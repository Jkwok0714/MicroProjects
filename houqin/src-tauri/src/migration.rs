use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use crate::case_path::ensure_relative_directory;
use crate::filters::ExcludeMatcher;
use crate::models::{ConflictRecord, MigrationProgress, MigrationReport, StepReport, SubdirectoryReport};

#[derive(Debug, Clone)]
pub struct ChainStep {
    pub source_index: usize,
    pub destination_index: usize,
    pub source_path: PathBuf,
    pub destination_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct MigrationEngineRequest {
    pub chain: Vec<PathBuf>,
    pub excludes: Vec<String>,
}

#[derive(Debug, Default)]
pub struct JobControl {
    pub cancel_requested: AtomicBool,
}

pub trait ProgressSink: Send + Sync {
    fn emit(&self, progress: MigrationProgress);
}

#[derive(Default)]
pub struct InMemoryProgressSink {
    events: Mutex<Vec<MigrationProgress>>,
}

impl InMemoryProgressSink {
    pub fn events(&self) -> Vec<MigrationProgress> {
        self.events.lock().map(|events| events.clone()).unwrap_or_default()
    }
}

impl ProgressSink for InMemoryProgressSink {
    fn emit(&self, progress: MigrationProgress) {
        if let Ok(mut events) = self.events.lock() {
            events.push(progress);
        }
    }
}

#[derive(Debug, Clone)]
struct FilePlan {
    source_path: PathBuf,
    relative_directory: PathBuf,
    file_name: String,
}

pub fn plan_chain_steps(chain: &[String]) -> Vec<ChainStep> {
    plan_chain_steps_from_paths(&chain.iter().map(PathBuf::from).collect::<Vec<_>>())
}

fn plan_chain_steps_from_paths(chain: &[PathBuf]) -> Vec<ChainStep> {
    if chain.len() < 2 {
        return vec![];
    }

    let mut steps = Vec::new();
    for index in (0..(chain.len() - 1)).rev() {
        steps.push(ChainStep {
            source_index: index,
            destination_index: index + 1,
            source_path: chain[index].clone(),
            destination_path: chain[index + 1].clone(),
        });
    }
    steps
}

fn collect_files(
    root: &Path,
    current: &Path,
    matcher: &ExcludeMatcher,
    plans: &mut Vec<FilePlan>,
) -> Result<(), String> {
    let mut entries = fs::read_dir(current)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if file_type.is_dir() {
            if matcher.is_excluded_dir(&name) {
                continue;
            }
            collect_files(root, &path, matcher, plans)?;
        } else if file_type.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?;
            let relative_directory = relative.parent().unwrap_or_else(|| Path::new("")).to_path_buf();
            plans.push(FilePlan {
                source_path: path,
                relative_directory,
                file_name: name,
            });
        }
    }

    Ok(())
}

pub fn execute_migration<T: ProgressSink + 'static>(
    request: MigrationEngineRequest,
    control: Arc<JobControl>,
    progress_sink: Arc<T>,
) -> Result<MigrationReport, String> {
    execute_migration_with_job_id("", request, control, progress_sink)
}

pub fn execute_migration_with_job_id<T: ProgressSink + 'static>(
    job_id: &str,
    request: MigrationEngineRequest,
    control: Arc<JobControl>,
    progress_sink: Arc<T>,
) -> Result<MigrationReport, String> {
    let matcher = ExcludeMatcher::new(&request.excludes);
    let mut report = MigrationReport {
        job_id: job_id.to_string(),
        status: "completed".to_string(),
        total_files_moved: 0,
        steps: Vec::new(),
        conflicts: Vec::new(),
    };

    for (step_position, step) in plan_chain_steps_from_paths(&request.chain).into_iter().enumerate() {
        if control
            .cancel_requested
            .load(std::sync::atomic::Ordering::SeqCst)
        {
            report.status = "canceled".into();
            return Ok(report);
        }

        fs::create_dir_all(&step.destination_path).map_err(|error| error.to_string())?;

        let mut file_plans = Vec::new();
        collect_files(&step.source_path, &step.source_path, &matcher, &mut file_plans)?;

        progress_sink.emit(MigrationProgress {
            job_id: job_id.to_string(),
            step_index: step_position,
            step_label: format!("{} -> {}", step.source_index, step.destination_index),
            current_directory: ".".into(),
            current_file: 0,
            total_files: file_plans.len(),
            phase: "scanning".into(),
        });

        let mut subdirectories = BTreeMap::<String, usize>::new();
        let mut moved = 0usize;
        for (file_index, plan) in file_plans.iter().enumerate() {
            if control
                .cancel_requested
                .load(std::sync::atomic::Ordering::SeqCst)
            {
                report.status = "canceled".into();
                report.total_files_moved += moved;
                report.steps.push(step_report(&step, moved, &subdirectories));
                return Ok(report);
            }

            let destination_dir =
                ensure_relative_directory(&step.destination_path, &plan.relative_directory)?;
            let destination_path = destination_dir.join(&plan.file_name);
            let directory_label = directory_label(&plan.relative_directory);

            if destination_path.exists() {
                report.conflicts.push(ConflictRecord {
                    step_label: format!("{} -> {}", step.source_index, step.destination_index),
                    source: plan.source_path.display().to_string(),
                    destination: destination_path.display().to_string(),
                });
                progress_sink.emit(MigrationProgress {
                    job_id: job_id.to_string(),
                    step_index: step_position,
                    step_label: format!("{} -> {}", step.source_index, step.destination_index),
                    current_directory: directory_label,
                    current_file: file_index + 1,
                    total_files: file_plans.len(),
                    phase: "conflict".into(),
                });
                continue;
            }

            fs::rename(&plan.source_path, &destination_path).map_err(|error| error.to_string())?;
            moved += 1;
            *subdirectories
                .entry(directory_label.clone())
                .or_insert(0) += 1;

            progress_sink.emit(MigrationProgress {
                job_id: job_id.to_string(),
                step_index: step_position,
                step_label: format!("{} -> {}", step.source_index, step.destination_index),
                current_directory: directory_label,
                current_file: file_index + 1,
                total_files: file_plans.len(),
                phase: "moving".into(),
            });
        }

        report.total_files_moved += moved;
        report.steps.push(step_report(&step, moved, &subdirectories));
    }

    Ok(report)
}

fn step_report(step: &ChainStep, moved: usize, subdirectories: &BTreeMap<String, usize>) -> StepReport {
    StepReport {
        source_index: step.source_index,
        destination_index: step.destination_index,
        source_path: step.source_path.display().to_string(),
        destination_path: step.destination_path.display().to_string(),
        files_moved: moved,
        subdirectories: subdirectories
            .iter()
            .map(|(directory, files_moved)| SubdirectoryReport {
                directory: directory.clone(),
                files_moved: *files_moved,
            })
            .collect(),
    }
}

fn directory_label(relative_directory: &Path) -> String {
    if relative_directory.as_os_str().is_empty() {
        ".".into()
    } else {
        relative_directory.display().to_string()
    }
}
