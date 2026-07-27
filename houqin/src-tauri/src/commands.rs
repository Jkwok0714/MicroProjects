use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;

use tauri::api::dialog::FileDialogBuilder;
use tauri::{AppHandle, Manager, State};

use crate::config::{load_config, save_config};
use crate::migration::{execute_migration_with_job_id, JobControl, ProgressSink};
use crate::models::{
    CancelMigrationResult, HouqinConfig, MigrationProgress, MigrationReport, SeedRequest, SeedResult,
    StartMigrationRequest, StartMigrationResult,
};
use crate::seed::seed_directories;
use crate::AppState;

const PROGRESS_EVENT: &str = "houqin://progress";
const RESULT_EVENT: &str = "houqin://result";

struct EventProgressSink {
    app: AppHandle,
}

impl ProgressSink for EventProgressSink {
    fn emit(&self, progress: MigrationProgress) {
        let _ = self.app.emit_all(PROGRESS_EVENT, progress);
    }
}

#[tauri::command]
pub fn pick_directory(current_directory: Option<String>) -> Result<Option<String>, String> {
    let (sender, receiver) = mpsc::channel();
    let mut dialog = FileDialogBuilder::new();

    if let Some(directory) = current_directory {
        dialog = dialog.set_directory(directory);
    }

    dialog.pick_folder(move |path| {
        let _ = sender.send(path.map(|value| value.display().to_string()));
    });

    receiver
        .recv()
        .map_err(|_| "Could not receive the directory picker result.".to_string())
}

#[tauri::command]
pub fn load_config_command(app: AppHandle) -> Result<HouqinConfig, String> {
    load_config(&app)
}

#[tauri::command]
pub fn save_config_command(app: AppHandle, config: HouqinConfig) -> Result<HouqinConfig, String> {
    save_config(&app, &config)
}

#[tauri::command]
pub fn seed_directories_command(request: SeedRequest) -> Result<SeedResult, String> {
    let created = seed_directories(PathBuf::from(request.source_directory).as_path(), &request.seeds)?;
    Ok(SeedResult {
        created: created
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
    })
}

#[tauri::command]
pub fn start_migration(
    app: AppHandle,
    state: State<AppState>,
    request: StartMigrationRequest,
) -> Result<StartMigrationResult, String> {
    if request.chain.len() < 2 {
        return Err("At least two directories are required.".into());
    }

    let job_seed = state.counter.fetch_add(1, Ordering::SeqCst) + 1;
    let job_id = format!("houqin-job-{job_seed}");
    let control = Arc::new(JobControl::default());

    state
        .jobs
        .lock()
        .map_err(|_| "Could not access the job registry.".to_string())?
        .insert(job_id.clone(), Arc::clone(&control));

    let jobs = Arc::clone(&state.jobs);
    let app_for_thread = app.clone();
    let job_id_for_thread = job_id.clone();
    thread::spawn(move || {
        let progress_sink = Arc::new(EventProgressSink {
            app: app_for_thread.clone(),
        });
        let report = execute_migration_with_job_id(
            &job_id_for_thread,
            crate::migration::MigrationEngineRequest {
                chain: request.chain.iter().map(PathBuf::from).collect(),
                excludes: request.excludes.clone(),
            },
            Arc::clone(&control),
            progress_sink,
        )
        .unwrap_or_else(|error| MigrationReport {
            job_id: job_id_for_thread.clone(),
            status: "failed".into(),
            total_files_moved: 0,
            steps: vec![],
            conflicts: vec![crate::models::ConflictRecord {
                step_label: "runtime".into(),
                source: String::new(),
                destination: error,
            }],
        });

        let _ = app_for_thread.emit_all(RESULT_EVENT, report);
        if let Ok(mut jobs) = jobs.lock() {
            jobs.remove(&job_id_for_thread);
        }
    });

    Ok(StartMigrationResult {
        job_id,
        status: "started".into(),
    })
}

#[tauri::command]
pub fn cancel_migration(
    state: State<AppState>,
    job_id: String,
) -> Result<CancelMigrationResult, String> {
    let maybe_job = state
        .jobs
        .lock()
        .map_err(|_| "Could not access the job registry.".to_string())?
        .get(&job_id)
        .cloned();

    if let Some(job) = maybe_job {
        job.cancel_requested.store(true, Ordering::SeqCst);
        Ok(CancelMigrationResult {
            job_id,
            status: "cancel_requested".into(),
            found: true,
        })
    } else {
        Ok(CancelMigrationResult {
            job_id,
            status: "not_found".into(),
            found: false,
        })
    }
}
