// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::api::dialog::FileDialogBuilder;
use tauri::{AppHandle, CustomMenuItem, Manager, Menu, MenuItem, State, Submenu};

const PROGRESS_EVENT: &str = "resection://progress";
const RESULT_EVENT: &str = "resection://result";
const MENU_OPEN_FILE_EVENT: &str = "menu://open-file";
const MENU_CLOSE_FILE_EVENT: &str = "menu://close-file";
const MENU_ID_OPEN_FILE: &str = "file_open";
const MENU_ID_CLOSE_FILE: &str = "file_close";
const SUPPORTED_EXTENSIONS: [&str; 2] = ["mp4", "mov"];

#[derive(Default)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, Arc<JobControl>>>>,
    counter: AtomicU64,
}

struct JobControl {
    cancel: AtomicBool,
    pid: AtomicI32,
}

impl JobControl {
    fn new() -> Self {
        Self {
            cancel: AtomicBool::new(false),
            pid: AtomicI32::new(0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamInfo {
    index: usize,
    codec_type: String,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    sample_rate: Option<u32>,
    channels: Option<u32>,
    rotation: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeResult {
    duration_s: f64,
    container: String,
    streams: Vec<StreamInfo>,
    metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResectionRequest {
    path: String,
    in_seconds: f64,
    out_seconds: f64,
    output_mode: String,
    #[serde(default)]
    allow_fallback_reencode: bool,
    #[serde(default)]
    from_beginning: bool,
    #[serde(default)]
    to_end: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobStartResult {
    job_id: String,
    status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelResult {
    job_id: String,
    status: String,
    found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobProgress {
    job_id: String,
    phase: String,
    percent: f64,
    eta_ms: Option<u64>,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobResult {
    job_id: String,
    status: String,
    output_path: Option<String>,
    used_fallback: bool,
    warnings: Vec<String>,
    reason: Option<String>,
}

#[derive(Debug)]
enum PipelineError {
    Canceled,
    NeedsFallback(String),
    Failed(String),
}

#[derive(Debug, Deserialize)]
struct RawProbe {
    streams: Vec<RawStream>,
    format: Option<RawFormat>,
}

#[derive(Debug, Deserialize)]
struct RawStream {
    index: usize,
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    sample_rate: Option<String>,
    channels: Option<u32>,
    tags: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
struct RawFormat {
    duration: Option<String>,
    format_name: Option<String>,
    tags: Option<HashMap<String, String>>,
}

#[tauri::command]
fn probe_video(app: AppHandle, path: String) -> Result<ProbeResult, String> {
    let source_path = PathBuf::from(path);
    if !source_path.exists() {
        return Err("Selected file does not exist.".to_string());
    }
    probe_media(&app, &source_path)
}

#[tauri::command]
fn start_resection(
    app: AppHandle,
    state: State<AppState>,
    req: ResectionRequest,
) -> Result<JobStartResult, String> {
    if req.output_mode != "replace_original" {
        return Err("Only output_mode='replace_original' is supported in v1.".to_string());
    }

    let id_seed = state.counter.fetch_add(1, Ordering::SeqCst) + 1;
    let job_id = format!("job-{}-{}", now_millis(), id_seed);
    let job = Arc::new(JobControl::new());
    state
        .jobs
        .lock()
        .map_err(|_| "Failed to access job registry.".to_string())?
        .insert(job_id.clone(), Arc::clone(&job));

    let jobs = Arc::clone(&state.jobs);
    let app_handle = app.clone();
    let req_for_thread = req.clone();
    let job_id_for_thread = job_id.clone();
    thread::spawn(move || {
        let result = run_resection_job(&app_handle, &job_id_for_thread, &job, req_for_thread);
        emit_result(&app_handle, &result);
        if let Ok(mut guard) = jobs.lock() {
            guard.remove(&job_id_for_thread);
        }
    });

    Ok(JobStartResult {
        job_id,
        status: "started".to_string(),
    })
}

#[tauri::command]
fn cancel_resection(state: State<AppState>, job_id: String) -> Result<CancelResult, String> {
    let maybe_job = state
        .jobs
        .lock()
        .map_err(|_| "Failed to access job registry.".to_string())?
        .get(&job_id)
        .cloned();

    if let Some(job) = maybe_job {
        job.cancel.store(true, Ordering::SeqCst);
        let pid = job.pid.load(Ordering::SeqCst);
        if pid > 0 {
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status();
            thread::sleep(Duration::from_millis(250));
            let _ = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .status();
        }
        Ok(CancelResult {
            job_id,
            status: "cancel_requested".to_string(),
            found: true,
        })
    } else {
        Ok(CancelResult {
            job_id,
            status: "not_found".to_string(),
            found: false,
        })
    }
}

fn run_resection_job(
    app: &AppHandle,
    job_id: &str,
    job: &Arc<JobControl>,
    req: ResectionRequest,
) -> JobResult {
    let source_path = PathBuf::from(&req.path);

    if !source_path.exists() {
        return failed_result(job_id, "Selected file does not exist.");
    }
    if !source_path.is_file() {
        return failed_result(job_id, "Selected path is not a file.");
    }
    if !is_supported_input(&source_path) {
        return failed_result(job_id, "Only MP4 and MOV files are supported in v1.");
    }

    emit_progress(
        app,
        JobProgress {
            job_id: job_id.to_string(),
            phase: "preparing".to_string(),
            percent: 2.0,
            eta_ms: None,
            message: Some("Probing input media".to_string()),
        },
    );

    let input_probe = match probe_media(app, &source_path) {
        Ok(value) => value,
        Err(err) => return failed_result(job_id, &format!("Probe failed: {}", err)),
    };

    if req.from_beginning && req.to_end {
        return failed_result(
            job_id,
            "Invalid crop range: cannot combine 'from beginning' with 'to end'.",
        );
    }

    let effective_in = if req.from_beginning {
        0.0
    } else {
        req.in_seconds
    };
    let effective_out = if req.to_end {
        input_probe.duration_s
    } else {
        req.out_seconds
    };

    if effective_in < 0.0 || effective_out <= effective_in {
        return failed_result(job_id, "Invalid timestamps: expected 0 <= in < out.");
    }
    if effective_out > input_probe.duration_s {
        return failed_result(
            job_id,
            "Invalid timestamps: out timestamp exceeds media duration.",
        );
    }
    if (effective_out - effective_in) >= (input_probe.duration_s - 0.01) {
        return failed_result(
            job_id,
            "Invalid crop range: removing the entire file is not supported.",
        );
    }

    if job.cancel.load(Ordering::SeqCst) {
        return canceled_result(job_id);
    }

    let parent_dir = match source_path.parent() {
        Some(value) => value,
        None => return failed_result(job_id, "Could not resolve source directory."),
    };

    let workspace = parent_dir.join(format!(".pianyi-resection-{}", job_id));
    if let Err(err) = fs::create_dir_all(&workspace) {
        return failed_result(
            job_id,
            &format!("Failed to create workspace directory: {}", err),
        );
    }

    let extension = source_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("mp4");

    let output_candidate = workspace.join(format!("candidate.{}", extension));
    let ffmpeg_bin = resolve_binary(app, "ffmpeg");

    let mut used_fallback = false;
    let mut warnings: Vec<String> = Vec::new();

    let stream_copy_result = run_stream_copy(
        app,
        job_id,
        job,
        &ffmpeg_bin,
        &source_path,
        &workspace,
        &output_candidate,
        effective_in,
        effective_out,
        input_probe.duration_s,
    );

    match stream_copy_result {
        Ok(()) => {
            let expected_duration =
                (input_probe.duration_s - (effective_out - effective_in)).max(0.0);
            let output_probe = match probe_media(app, &output_candidate) {
                Ok(value) => value,
                Err(err) => {
                    let _ = fs::remove_dir_all(&workspace);
                    return failed_result(
                        job_id,
                        &format!("Failed to probe generated output: {}", err),
                    );
                }
            };

            match validate_output(&input_probe, &output_probe, expected_duration) {
                Ok(report_warnings) => warnings.extend(report_warnings),
                Err(reason) => {
                    if !req.allow_fallback_reencode {
                        let _ = fs::remove_dir_all(&workspace);
                        return JobResult {
                            job_id: job_id.to_string(),
                            status: "fallback_required".to_string(),
                            output_path: None,
                            used_fallback: false,
                            warnings,
                            reason: Some(reason),
                        };
                    }

                    used_fallback = true;
                    let _ = fs::remove_file(&output_candidate);
                    match run_precise_reencode(
                        app,
                        job_id,
                        job,
                        &ffmpeg_bin,
                        &source_path,
                        &output_candidate,
                        effective_in,
                        effective_out,
                        &input_probe,
                    ) {
                        Ok(result_warnings) => warnings.extend(result_warnings),
                        Err(PipelineError::Canceled) => {
                            let _ = fs::remove_dir_all(&workspace);
                            return canceled_result(job_id);
                        }
                        Err(PipelineError::NeedsFallback(reason))
                        | Err(PipelineError::Failed(reason)) => {
                            let _ = fs::remove_dir_all(&workspace);
                            return failed_result(job_id, &reason);
                        }
                    }
                }
            }
        }
        Err(PipelineError::Canceled) => {
            let _ = fs::remove_dir_all(&workspace);
            return canceled_result(job_id);
        }
        Err(PipelineError::NeedsFallback(reason)) => {
            if !req.allow_fallback_reencode {
                let _ = fs::remove_dir_all(&workspace);
                return JobResult {
                    job_id: job_id.to_string(),
                    status: "fallback_required".to_string(),
                    output_path: None,
                    used_fallback: false,
                    warnings,
                    reason: Some(reason),
                };
            }

            used_fallback = true;
            match run_precise_reencode(
                app,
                job_id,
                job,
                &ffmpeg_bin,
                &source_path,
                &output_candidate,
                effective_in,
                effective_out,
                &input_probe,
            ) {
                Ok(result_warnings) => warnings.extend(result_warnings),
                Err(PipelineError::Canceled) => {
                    let _ = fs::remove_dir_all(&workspace);
                    return canceled_result(job_id);
                }
                Err(PipelineError::NeedsFallback(reason)) | Err(PipelineError::Failed(reason)) => {
                    let _ = fs::remove_dir_all(&workspace);
                    return failed_result(job_id, &reason);
                }
            }
        }
        Err(PipelineError::Failed(reason)) => {
            let _ = fs::remove_dir_all(&workspace);
            return failed_result(job_id, &reason);
        }
    }

    emit_progress(
        app,
        JobProgress {
            job_id: job_id.to_string(),
            phase: "swap".to_string(),
            percent: 88.0,
            eta_ms: None,
            message: Some("Replacing original file".to_string()),
        },
    );

    if let Err(err) = atomic_replace(&source_path, &output_candidate, job_id) {
        let _ = fs::remove_dir_all(&workspace);
        return failed_result(job_id, &err);
    }

    let _ = fs::remove_dir_all(&workspace);

    emit_progress(
        app,
        JobProgress {
            job_id: job_id.to_string(),
            phase: "completed".to_string(),
            percent: 100.0,
            eta_ms: Some(0),
            message: Some("Video section removed".to_string()),
        },
    );

    JobResult {
        job_id: job_id.to_string(),
        status: "completed".to_string(),
        output_path: Some(source_path.to_string_lossy().to_string()),
        used_fallback,
        warnings,
        reason: None,
    }
}

fn run_stream_copy(
    app: &AppHandle,
    job_id: &str,
    job: &Arc<JobControl>,
    ffmpeg_bin: &Path,
    source_path: &Path,
    workspace: &Path,
    output_path: &Path,
    in_seconds: f64,
    out_seconds: f64,
    input_duration: f64,
) -> Result<(), PipelineError> {
    let keep_head = in_seconds > 0.01;
    let keep_tail = out_seconds < (input_duration - 0.01);

    let head_segment = workspace.join("segment_head.ts");
    let tail_segment = workspace.join("segment_tail.ts");

    if keep_head {
        let args = vec![
            "-y".to_string(),
            "-i".to_string(),
            source_path.to_string_lossy().to_string(),
            "-to".to_string(),
            format_seconds(in_seconds),
            "-map".to_string(),
            "0".to_string(),
            "-c".to_string(),
            "copy".to_string(),
            "-f".to_string(),
            "mpegts".to_string(),
            head_segment.to_string_lossy().to_string(),
        ];
        run_ffmpeg_step(
            app,
            job_id,
            job,
            ffmpeg_bin,
            &args,
            "copy_head",
            4.0,
            30.0,
            in_seconds.max(0.1),
        )?;
    }

    if keep_tail {
        let args = vec![
            "-y".to_string(),
            "-i".to_string(),
            source_path.to_string_lossy().to_string(),
            "-ss".to_string(),
            format_seconds(out_seconds),
            "-map".to_string(),
            "0".to_string(),
            "-c".to_string(),
            "copy".to_string(),
            "-f".to_string(),
            "mpegts".to_string(),
            tail_segment.to_string_lossy().to_string(),
        ];
        run_ffmpeg_step(
            app,
            job_id,
            job,
            ffmpeg_bin,
            &args,
            "copy_tail",
            30.0,
            56.0,
            30.0,
        )?;
    }

    let concat_file = workspace.join("concat.txt");
    let mut concat = File::create(&concat_file)
        .map_err(|err| PipelineError::Failed(format!("Failed to create concat list: {}", err)))?;

    if keep_head {
        writeln!(
            concat,
            "file '{}'",
            escape_ffmpeg_concat_path(&head_segment.to_string_lossy())
        )
        .map_err(|err| PipelineError::Failed(format!("Failed to write concat list: {}", err)))?;
    }
    if keep_tail {
        writeln!(
            concat,
            "file '{}'",
            escape_ffmpeg_concat_path(&tail_segment.to_string_lossy())
        )
        .map_err(|err| PipelineError::Failed(format!("Failed to write concat list: {}", err)))?;
    }

    let args = vec![
        "-y".to_string(),
        "-f".to_string(),
        "concat".to_string(),
        "-safe".to_string(),
        "0".to_string(),
        "-i".to_string(),
        concat_file.to_string_lossy().to_string(),
        "-map".to_string(),
        "0".to_string(),
        "-c".to_string(),
        "copy".to_string(),
        "-map_metadata".to_string(),
        "0".to_string(),
        "-map_chapters".to_string(),
        "0".to_string(),
        output_path.to_string_lossy().to_string(),
    ];

    run_ffmpeg_step(
        app,
        job_id,
        job,
        ffmpeg_bin,
        &args,
        "copy_concat",
        56.0,
        76.0,
        input_duration.max(0.1),
    )
    .map_err(|err| match err {
        PipelineError::Canceled => PipelineError::Canceled,
        PipelineError::Failed(reason) => PipelineError::NeedsFallback(format!(
            "Stream copy failed or produced non-concatenable segments: {}",
            reason
        )),
        PipelineError::NeedsFallback(reason) => PipelineError::NeedsFallback(reason),
    })?;

    Ok(())
}

fn run_precise_reencode(
    app: &AppHandle,
    job_id: &str,
    job: &Arc<JobControl>,
    ffmpeg_bin: &Path,
    source_path: &Path,
    output_path: &Path,
    in_seconds: f64,
    out_seconds: f64,
    input_probe: &ProbeResult,
) -> Result<Vec<String>, PipelineError> {
    emit_progress(
        app,
        JobProgress {
            job_id: job_id.to_string(),
            phase: "fallback".to_string(),
            percent: 10.0,
            eta_ms: None,
            message: Some("Running exact trim re-encode fallback".to_string()),
        },
    );

    let has_video = input_probe
        .streams
        .iter()
        .any(|stream| stream.codec_type == "video");
    let has_audio = input_probe
        .streams
        .iter()
        .any(|stream| stream.codec_type == "audio");

    if !has_video && !has_audio {
        return Err(PipelineError::Failed(
            "Input has no supported audio/video streams.".to_string(),
        ));
    }

    let video_codec = primary_stream(input_probe, "video")
        .and_then(|stream| stream.codec_name.clone())
        .unwrap_or_else(|| "h264".to_string());
    let audio_codec = primary_stream(input_probe, "audio")
        .and_then(|stream| stream.codec_name.clone())
        .unwrap_or_else(|| "aac".to_string());

    let (preferred_video_encoder, secondary_video_encoder) = select_video_encoders(&video_codec);
    let (preferred_audio_encoder, secondary_audio_encoder) = select_audio_encoders(&audio_codec);

    let expected_duration = (input_probe.duration_s - (out_seconds - in_seconds)).max(0.1);

    let primary_args = build_reencode_args(
        source_path,
        output_path,
        in_seconds,
        out_seconds,
        input_probe.duration_s,
        has_video,
        has_audio,
        preferred_video_encoder,
        preferred_audio_encoder,
    );

    match run_ffmpeg_step(
        app,
        job_id,
        job,
        ffmpeg_bin,
        &primary_args,
        "reencode_primary",
        14.0,
        84.0,
        expected_duration,
    ) {
        Ok(()) => {}
        Err(PipelineError::Failed(primary_error)) => {
            let secondary_args = build_reencode_args(
                source_path,
                output_path,
                in_seconds,
                out_seconds,
                input_probe.duration_s,
                has_video,
                has_audio,
                secondary_video_encoder,
                secondary_audio_encoder,
            );
            run_ffmpeg_step(
                app,
                job_id,
                job,
                ffmpeg_bin,
                &secondary_args,
                "reencode_secondary",
                14.0,
                84.0,
                expected_duration,
            )
            .map_err(|err| match err {
                PipelineError::Canceled => PipelineError::Canceled,
                PipelineError::NeedsFallback(reason) => {
                    PipelineError::Failed(format!("Re-encode fallback failed: {}", reason))
                }
                PipelineError::Failed(secondary_error) => PipelineError::Failed(format!(
                    "Re-encode fallback failed with both encoder profiles. primary='{}' secondary='{}'",
                    trim_multiline(&primary_error, 240),
                    trim_multiline(&secondary_error, 240)
                )),
            })?;
        }
        Err(other) => return Err(other),
    }

    let output_probe = probe_media(app, output_path)
        .map_err(|err| PipelineError::Failed(format!("Probe failed after re-encode: {}", err)))?;

    let expected_duration = (input_probe.duration_s - (out_seconds - in_seconds)).max(0.0);
    let mut warnings = validate_output(input_probe, &output_probe, expected_duration)
        .map_err(|reason| PipelineError::Failed(format!("Validation failed: {}", reason)))?;

    warnings.push("Used precise re-encode fallback to honor cut boundaries.".to_string());
    if preferred_video_encoder != secondary_video_encoder {
        warnings.push(format!(
            "Encoder profile selection attempted: preferred '{}', fallback '{}'.",
            preferred_video_encoder, secondary_video_encoder
        ));
    }

    Ok(warnings)
}

fn build_reencode_args(
    source_path: &Path,
    output_path: &Path,
    in_seconds: f64,
    out_seconds: f64,
    input_duration: f64,
    has_video: bool,
    has_audio: bool,
    video_encoder: &str,
    audio_encoder: &str,
) -> Vec<String> {
    let mut filter_parts: Vec<String> = Vec::new();
    let keep_head = in_seconds > 0.01;
    let keep_tail = out_seconds < (input_duration - 0.01);

    if has_video {
        match (keep_head, keep_tail) {
            (true, true) => {
                filter_parts.push(format!(
                    "[0:v:0]trim=start=0:end={},setpts=PTS-STARTPTS[v0]",
                    format_seconds(in_seconds)
                ));
                filter_parts.push(format!(
                    "[0:v:0]trim=start={},setpts=PTS-STARTPTS[v1]",
                    format_seconds(out_seconds)
                ));
                filter_parts.push("[v0][v1]concat=n=2:v=1:a=0[vout]".to_string());
            }
            (true, false) => {
                filter_parts.push(format!(
                    "[0:v:0]trim=start=0:end={},setpts=PTS-STARTPTS[vout]",
                    format_seconds(in_seconds)
                ));
            }
            (false, true) => {
                filter_parts.push(format!(
                    "[0:v:0]trim=start={},setpts=PTS-STARTPTS[vout]",
                    format_seconds(out_seconds)
                ));
            }
            (false, false) => {}
        }
    }

    if has_audio {
        match (keep_head, keep_tail) {
            (true, true) => {
                filter_parts.push(format!(
                    "[0:a:0]atrim=start=0:end={},asetpts=PTS-STARTPTS[a0]",
                    format_seconds(in_seconds)
                ));
                filter_parts.push(format!(
                    "[0:a:0]atrim=start={},asetpts=PTS-STARTPTS[a1]",
                    format_seconds(out_seconds)
                ));
                filter_parts.push("[a0][a1]concat=n=2:v=0:a=1[aout]".to_string());
            }
            (true, false) => {
                filter_parts.push(format!(
                    "[0:a:0]atrim=start=0:end={},asetpts=PTS-STARTPTS[aout]",
                    format_seconds(in_seconds)
                ));
            }
            (false, true) => {
                filter_parts.push(format!(
                    "[0:a:0]atrim=start={},asetpts=PTS-STARTPTS[aout]",
                    format_seconds(out_seconds)
                ));
            }
            (false, false) => {}
        }
    }

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        source_path.to_string_lossy().to_string(),
        "-filter_complex".to_string(),
        filter_parts.join(";"),
    ];

    if has_video {
        args.push("-map".to_string());
        args.push("[vout]".to_string());
        args.push("-c:v".to_string());
        args.push(video_encoder.to_string());
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
    }

    if has_audio {
        args.push("-map".to_string());
        args.push("[aout]".to_string());
        args.push("-c:a".to_string());
        args.push(audio_encoder.to_string());
    }

    args.push("-map_metadata".to_string());
    args.push("0".to_string());
    args.push("-map_chapters".to_string());
    args.push("0".to_string());
    args.push("-movflags".to_string());
    args.push("+faststart".to_string());
    args.push(output_path.to_string_lossy().to_string());

    args
}

fn run_ffmpeg_step(
    app: &AppHandle,
    job_id: &str,
    job: &Arc<JobControl>,
    ffmpeg_bin: &Path,
    args: &[String],
    phase: &str,
    start_percent: f64,
    end_percent: f64,
    expected_duration_s: f64,
) -> Result<(), PipelineError> {
    if job.cancel.load(Ordering::SeqCst) {
        return Err(PipelineError::Canceled);
    }

    emit_progress(
        app,
        JobProgress {
            job_id: job_id.to_string(),
            phase: phase.to_string(),
            percent: start_percent,
            eta_ms: None,
            message: None,
        },
    );

    let mut command = Command::new(ffmpeg_bin);
    command
        .args(args)
        .arg("-progress")
        .arg("pipe:1")
        .arg("-nostats")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|err| PipelineError::Failed(format!("Failed to launch ffmpeg: {}", err)))?;

    job.pid.store(child.id() as i32, Ordering::SeqCst);

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| PipelineError::Failed("Unable to capture ffmpeg stdout.".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| PipelineError::Failed("Unable to capture ffmpeg stderr.".to_string()))?;

    let stderr_reader = thread::spawn(move || {
        let mut buffer = String::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_string(&mut buffer);
        buffer
    });

    let expected_duration_s = expected_duration_s.max(0.1);
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {
                let trimmed = line.trim();
                if let Some(raw_time) = trimmed.strip_prefix("out_time_ms=") {
                    if let Ok(microseconds) = raw_time.parse::<f64>() {
                        if last_emit.elapsed() >= Duration::from_millis(120) {
                            let processed = (microseconds / 1_000_000.0).max(0.0);
                            let ratio = (processed / expected_duration_s).clamp(0.0, 1.0);
                            let percent = start_percent + ((end_percent - start_percent) * ratio);
                            emit_progress(
                                app,
                                JobProgress {
                                    job_id: job_id.to_string(),
                                    phase: phase.to_string(),
                                    percent,
                                    eta_ms: None,
                                    message: None,
                                },
                            );
                            last_emit = Instant::now();
                        }
                    }
                }
            }
            Err(err) => {
                job.pid.store(0, Ordering::SeqCst);
                return Err(PipelineError::Failed(format!(
                    "Failed reading ffmpeg progress output: {}",
                    err
                )));
            }
        }

        if job.cancel.load(Ordering::SeqCst) {
            let _ = child.kill();
        }
    }

    let status = child.wait().map_err(|err| {
        PipelineError::Failed(format!("Failed waiting on ffmpeg process: {}", err))
    })?;
    job.pid.store(0, Ordering::SeqCst);

    let stderr_text = stderr_reader
        .join()
        .unwrap_or_else(|_| "<stderr join failed>".to_string());

    if job.cancel.load(Ordering::SeqCst) {
        return Err(PipelineError::Canceled);
    }

    if !status.success() {
        return Err(PipelineError::Failed(format!(
            "ffmpeg step '{}' failed: {}",
            phase,
            trim_multiline(&stderr_text, 400)
        )));
    }

    emit_progress(
        app,
        JobProgress {
            job_id: job_id.to_string(),
            phase: phase.to_string(),
            percent: end_percent,
            eta_ms: None,
            message: None,
        },
    );

    Ok(())
}

fn atomic_replace(original: &Path, candidate: &Path, job_id: &str) -> Result<(), String> {
    let parent = original
        .parent()
        .ok_or_else(|| "Could not resolve original file parent directory.".to_string())?;

    let filename = original
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Could not resolve original filename.".to_string())?;

    let backup = parent.join(format!(".{}.pianyi-backup-{}", filename, job_id));

    fs::rename(original, &backup)
        .map_err(|err| format!("Failed to move original file to backup: {}", err))?;

    match fs::rename(candidate, original) {
        Ok(()) => {
            let _ = fs::remove_file(&backup);
            Ok(())
        }
        Err(err) => {
            let _ = fs::rename(&backup, original);
            Err(format!(
                "Failed to replace original file with output candidate: {}",
                err
            ))
        }
    }
}

fn validate_output(
    input: &ProbeResult,
    output: &ProbeResult,
    expected_duration: f64,
) -> Result<Vec<String>, String> {
    let mut warnings: Vec<String> = Vec::new();

    let duration_delta = (output.duration_s - expected_duration).abs();
    if duration_delta > 0.40 {
        return Err(format!(
            "Duration mismatch too large. expected≈{:.3}s output={:.3}s delta={:.3}s",
            expected_duration, output.duration_s, duration_delta
        ));
    }

    let input_video = primary_stream(input, "video");
    let output_video = primary_stream(output, "video");
    if input_video.is_some() && output_video.is_none() {
        return Err("Output is missing video stream present in source.".to_string());
    }

    let input_audio = primary_stream(input, "audio");
    let output_audio = primary_stream(output, "audio");
    if input_audio.is_some() && output_audio.is_none() {
        return Err("Output is missing audio stream present in source.".to_string());
    }

    if input.container != output.container {
        warnings.push(format!(
            "Container changed from '{}' to '{}'.",
            input.container, output.container
        ));
    }

    if let (Some(in_video), Some(out_video)) = (input_video, output_video) {
        if in_video.codec_name != out_video.codec_name {
            warnings.push(format!(
                "Video codec changed from '{}' to '{}'.",
                in_video
                    .codec_name
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string()),
                out_video
                    .codec_name
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string())
            ));
        }
        if in_video.width != out_video.width || in_video.height != out_video.height {
            warnings.push(format!(
                "Video resolution changed from {}x{} to {}x{}.",
                in_video.width.unwrap_or(0),
                in_video.height.unwrap_or(0),
                out_video.width.unwrap_or(0),
                out_video.height.unwrap_or(0)
            ));
        }
        if in_video.rotation != out_video.rotation {
            warnings.push("Rotation metadata changed in output.".to_string());
        }
    }

    if let (Some(in_audio), Some(out_audio)) = (input_audio, output_audio) {
        if in_audio.codec_name != out_audio.codec_name {
            warnings.push(format!(
                "Audio codec changed from '{}' to '{}'.",
                in_audio
                    .codec_name
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string()),
                out_audio
                    .codec_name
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string())
            ));
        }
        if in_audio.sample_rate != out_audio.sample_rate {
            warnings.push(format!(
                "Audio sample rate changed from {:?} to {:?}.",
                in_audio.sample_rate, out_audio.sample_rate
            ));
        }
        if in_audio.channels != out_audio.channels {
            warnings.push(format!(
                "Audio channels changed from {:?} to {:?}.",
                in_audio.channels, out_audio.channels
            ));
        }
    }

    Ok(warnings)
}

fn primary_stream<'a>(probe: &'a ProbeResult, stream_type: &str) -> Option<&'a StreamInfo> {
    probe
        .streams
        .iter()
        .find(|stream| stream.codec_type == stream_type)
}

fn resolve_binary(app: &AppHandle, binary_name: &str) -> PathBuf {
    if let Some(resource_dir) = app.path_resolver().resource_dir() {
        let candidate = resource_dir.join("bin").join(binary_name);
        if candidate.exists() {
            return candidate;
        }
    }

    PathBuf::from(binary_name)
}

fn probe_media(app: &AppHandle, path: &Path) -> Result<ProbeResult, String> {
    let ffprobe_binary = resolve_binary(app, "ffprobe");
    if ffprobe_binary.exists() || ffprobe_binary == PathBuf::from("ffprobe") {
        if let Ok(result) = probe_with_ffprobe(&ffprobe_binary, path) {
            return Ok(result);
        }
    }

    let ffmpeg_binary = resolve_binary(app, "ffmpeg");
    probe_with_ffmpeg_stderr(&ffmpeg_binary, path)
}

fn probe_with_ffprobe(ffprobe_binary: &Path, path: &Path) -> Result<ProbeResult, String> {
    let output = Command::new(ffprobe_binary)
        .arg("-v")
        .arg("error")
        .arg("-show_format")
        .arg("-show_streams")
        .arg("-of")
        .arg("json")
        .arg(path)
        .output()
        .map_err(|err| format!("Unable to execute ffprobe: {}", err))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            trim_multiline(&String::from_utf8_lossy(&output.stderr), 320)
        ));
    }

    let parsed: RawProbe = serde_json::from_slice(&output.stdout)
        .map_err(|err| format!("Failed to parse ffprobe output: {}", err))?;

    let format = parsed
        .format
        .ok_or_else(|| "ffprobe output missing format section.".to_string())?;

    let container = format
        .format_name
        .unwrap_or_else(|| "unknown".to_string())
        .split(',')
        .next()
        .unwrap_or("unknown")
        .to_string();

    let duration_s = format
        .duration
        .as_deref()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0);

    let metadata = format.tags.unwrap_or_default();

    let streams = parsed
        .streams
        .into_iter()
        .filter_map(|stream| {
            let codec_type = stream.codec_type?;
            let sample_rate = stream
                .sample_rate
                .as_deref()
                .and_then(|value| value.parse::<u32>().ok());
            let rotation = stream
                .tags
                .as_ref()
                .and_then(|tags| tags.get("rotate"))
                .and_then(|raw| raw.parse::<i32>().ok());

            Some(StreamInfo {
                index: stream.index,
                codec_type,
                codec_name: stream.codec_name,
                width: stream.width,
                height: stream.height,
                sample_rate,
                channels: stream.channels,
                rotation,
            })
        })
        .collect::<Vec<_>>();

    Ok(ProbeResult {
        duration_s,
        container,
        streams,
        metadata,
    })
}

fn probe_with_ffmpeg_stderr(ffmpeg_binary: &Path, path: &Path) -> Result<ProbeResult, String> {
    let output = Command::new(ffmpeg_binary)
        .arg("-hide_banner")
        .arg("-i")
        .arg(path)
        .output()
        .map_err(|err| format!("Unable to execute ffmpeg for probing: {}", err))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if stderr.trim().is_empty() {
        return Err("ffmpeg probe output was empty.".to_string());
    }

    let mut duration_s = 0.0;
    let mut container = "unknown".to_string();
    let mut streams = Vec::new();

    for line in stderr.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("Input #0,") {
            let tail = trimmed.trim_start_matches("Input #0,").trim();
            if let Some((container_part, _)) = tail.split_once(',') {
                container = container_part
                    .trim()
                    .split(',')
                    .next()
                    .unwrap_or("unknown")
                    .to_string();
            }
        }

        if trimmed.contains("Duration:") {
            if let Some(duration_raw) = extract_duration_token(trimmed) {
                duration_s = parse_hhmmss(&duration_raw).unwrap_or(0.0);
            }
        }

        if trimmed.starts_with("Stream #") {
            if let Some(stream_info) = parse_stream_line(trimmed, streams.len()) {
                streams.push(stream_info);
            }
        }
    }

    if streams.is_empty() {
        return Err("Could not parse any streams from ffmpeg probe output.".to_string());
    }

    Ok(ProbeResult {
        duration_s,
        container,
        streams,
        metadata: HashMap::new(),
    })
}

fn parse_stream_line(line: &str, index: usize) -> Option<StreamInfo> {
    if line.contains(" Video:") {
        let codec_name = line
            .split(" Video:")
            .nth(1)
            .and_then(|tail| tail.split(',').next())
            .map(|value| value.trim().to_string());

        let (width, height) = extract_resolution(line);

        return Some(StreamInfo {
            index,
            codec_type: "video".to_string(),
            codec_name,
            width,
            height,
            sample_rate: None,
            channels: None,
            rotation: None,
        });
    }

    if line.contains(" Audio:") {
        let codec_name = line
            .split(" Audio:")
            .nth(1)
            .and_then(|tail| tail.split(',').next())
            .map(|value| value.trim().to_string());

        let sample_rate = line.split(',').find_map(|token| {
            let trimmed = token.trim();
            if let Some(raw_hz) = trimmed.strip_suffix(" Hz") {
                return raw_hz.trim().parse::<u32>().ok();
            }
            None
        });

        let channels = if line.contains("mono") {
            Some(1)
        } else if line.contains("stereo") {
            Some(2)
        } else if line.contains("5.1") {
            Some(6)
        } else {
            None
        };

        return Some(StreamInfo {
            index,
            codec_type: "audio".to_string(),
            codec_name,
            width: None,
            height: None,
            sample_rate,
            channels,
            rotation: None,
        });
    }

    None
}

fn extract_resolution(line: &str) -> (Option<u32>, Option<u32>) {
    for token in line.split(',') {
        let trimmed = token.trim();
        if let Some((w, h)) = trimmed.split_once('x') {
            if let (Ok(width), Ok(height)) = (w.trim().parse::<u32>(), h.trim().parse::<u32>()) {
                return (Some(width), Some(height));
            }
        }
    }
    (None, None)
}

fn extract_duration_token(line: &str) -> Option<String> {
    let (_, tail) = line.split_once("Duration:")?;
    let token = tail.split(',').next()?.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

fn parse_hhmmss(input: &str) -> Option<f64> {
    let mut parts = input.trim().split(':');
    let hours = parts.next()?.trim().parse::<f64>().ok()?;
    let minutes = parts.next()?.trim().parse::<f64>().ok()?;
    let seconds = parts.next()?.trim().parse::<f64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((hours * 3600.0) + (minutes * 60.0) + seconds)
}

fn format_seconds(value: f64) -> String {
    format!("{:.3}", value.max(0.0))
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn is_supported_input(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .map(|extension| SUPPORTED_EXTENSIONS.contains(&extension.as_str()))
        .unwrap_or(false)
}

fn escape_ffmpeg_concat_path(path: &str) -> String {
    path.replace('\\', "\\\\").replace('\'', "'\\''")
}

fn select_video_encoders(codec: &str) -> (&'static str, &'static str) {
    match codec {
        "hevc" => ("hevc_videotoolbox", "libx265"),
        "prores" => ("prores_ks", "prores"),
        "mpeg4" => ("mpeg4", "libx264"),
        _ => ("h264_videotoolbox", "libx264"),
    }
}

fn select_audio_encoders(codec: &str) -> (&'static str, &'static str) {
    match codec {
        "alac" => ("alac", "aac"),
        "pcm_s16le" => ("pcm_s16le", "aac"),
        _ => ("aac_at", "aac"),
    }
}

fn trim_multiline(input: &str, max_len: usize) -> String {
    let compact = input
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    if compact.len() <= max_len {
        compact
    } else {
        format!("{}...", &compact[0..max_len])
    }
}

fn failed_result(job_id: &str, reason: &str) -> JobResult {
    JobResult {
        job_id: job_id.to_string(),
        status: "failed".to_string(),
        output_path: None,
        used_fallback: false,
        warnings: Vec::new(),
        reason: Some(reason.to_string()),
    }
}

fn canceled_result(job_id: &str) -> JobResult {
    JobResult {
        job_id: job_id.to_string(),
        status: "canceled".to_string(),
        output_path: None,
        used_fallback: false,
        warnings: Vec::new(),
        reason: Some("Operation canceled by user.".to_string()),
    }
}

fn emit_progress(app: &AppHandle, payload: JobProgress) {
    let _ = app.emit_all(PROGRESS_EVENT, payload);
}

fn emit_result(app: &AppHandle, payload: &JobResult) {
    let _ = app.emit_all(RESULT_EVENT, payload.clone());
}

fn emit_menu_close_event(app: &AppHandle) {
    let _ = app.emit_all(MENU_CLOSE_FILE_EVENT, true);
}

fn open_file_from_menu(app: &AppHandle) {
    let app_handle = app.clone();
    FileDialogBuilder::new()
        .add_filter("Video", &["mp4", "mov"])
        .pick_file(move |picked_path| {
            if let Some(path) = picked_path {
                let _ = app_handle.emit_all(
                    MENU_OPEN_FILE_EVENT,
                    path.as_path().to_string_lossy().to_string(),
                );
            }
        });
}

fn main() {
    let file_menu = Menu::new()
        .add_item(CustomMenuItem::new(MENU_ID_OPEN_FILE, "Open File").accelerator("CmdOrCtrl+O"))
        .add_item(CustomMenuItem::new(MENU_ID_CLOSE_FILE, "Close File").accelerator("CmdOrCtrl+W"))
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Quit);

    let app_menu = Menu::new().add_submenu(Submenu::new("File", file_menu));

    tauri::Builder::default()
        .menu(app_menu)
        .on_menu_event(|event| {
            let app_handle = event.window().app_handle();
            match event.menu_item_id() {
                MENU_ID_OPEN_FILE => open_file_from_menu(&app_handle),
                MENU_ID_CLOSE_FILE => emit_menu_close_event(&app_handle),
                _ => {}
            }
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            probe_video,
            start_resection,
            cancel_resection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{parse_hhmmss, validate_output, ProbeResult, StreamInfo};
    use std::collections::HashMap;

    fn make_probe(duration_s: f64) -> ProbeResult {
        ProbeResult {
            duration_s,
            container: "mov".to_string(),
            streams: vec![
                StreamInfo {
                    index: 0,
                    codec_type: "video".to_string(),
                    codec_name: Some("h264".to_string()),
                    width: Some(1920),
                    height: Some(1080),
                    sample_rate: None,
                    channels: None,
                    rotation: Some(0),
                },
                StreamInfo {
                    index: 1,
                    codec_type: "audio".to_string(),
                    codec_name: Some("aac".to_string()),
                    width: None,
                    height: None,
                    sample_rate: Some(48000),
                    channels: Some(2),
                    rotation: None,
                },
            ],
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn parses_hhmmss_values() {
        let parsed = parse_hhmmss("00:01:03.500").expect("must parse");
        assert!((parsed - 63.5).abs() < 0.001);
    }

    #[test]
    fn rejects_invalid_hhmmss_values() {
        assert!(parse_hhmmss("invalid").is_none());
        assert!(parse_hhmmss("00:01").is_none());
    }

    #[test]
    fn validate_output_passes_for_close_duration() {
        let input = make_probe(120.0);
        let output = make_probe(95.81);
        let report = validate_output(&input, &output, 96.0);
        assert!(report.is_ok(), "expected validation to pass");
    }

    #[test]
    fn validate_output_fails_for_large_duration_delta() {
        let input = make_probe(120.0);
        let output = make_probe(89.0);
        let report = validate_output(&input, &output, 96.0);
        assert!(report.is_err(), "expected validation failure");
    }
}
