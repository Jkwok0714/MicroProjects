use std::fs;
use std::path::Path;
use std::sync::Arc;

use houqin::case_path::ensure_relative_directory;
use houqin::filters::ExcludeMatcher;
use houqin::migration::{
    execute_migration, plan_chain_steps, InMemoryProgressSink, JobControl, MigrationEngineRequest,
};
use houqin::seed::seed_directories;
use tempfile::tempdir;

fn write_file(path: &Path, contents: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, contents).unwrap();
}

#[test]
fn plans_chain_steps_in_descending_adjacent_order() {
    let steps = plan_chain_steps(&[
        "/tmp/source".to_string(),
        "/tmp/mid-a".to_string(),
        "/tmp/mid-b".to_string(),
        "/tmp/dest".to_string(),
    ]);

    let labels: Vec<(usize, usize)> = steps
        .iter()
        .map(|step| (step.source_index, step.destination_index))
        .collect();

    assert_eq!(labels, vec![(2, 3), (1, 2), (0, 1)]);
}

#[test]
fn excludes_match_directory_names_only() {
    let matcher = ExcludeMatcher::new(&["cache".to_string(), "skip-me".to_string()]);

    assert!(matcher.is_excluded_dir("Cache"));
    assert!(matcher.is_excluded_dir("SKIP-ME"));
    assert!(!matcher.is_excluded_dir("movie-cache.mp4"));
}

#[test]
fn reuses_existing_destination_directory_casing() {
    let root = tempdir().unwrap();
    let base = root.path().join("base");
    fs::create_dir_all(base.join("Photos")).unwrap();

    let resolved = ensure_relative_directory(&base, Path::new("photos/Trips")).unwrap();
    let entries = fs::read_dir(&base)
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    let names: Vec<String> = entries
        .iter()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();

    assert_eq!(resolved, base.join("Photos").join("Trips"));
    assert!(base.join("Photos").join("Trips").exists());
    assert_eq!(names, vec!["Photos".to_string()]);
}

#[test]
fn seeds_relative_directories_and_rejects_absolute_paths() {
    let root = tempdir().unwrap();
    let source = root.path().join("source");
    fs::create_dir_all(&source).unwrap();

    seed_directories(&source, &["Shows/Queued".to_string(), "Photos/Trips".to_string()]).unwrap();

    assert!(source.join("Shows/Queued").is_dir());
    assert!(source.join("Photos/Trips").is_dir());

    let error = seed_directories(&source, &["/absolute/path".to_string()]).unwrap_err();
    assert!(error.contains("relative"));
}

#[test]
fn migrates_one_step_at_a_time_and_preserves_empty_directories() {
    let root = tempdir().unwrap();
    let dir0 = root.path().join("0-source");
    let dir1 = root.path().join("1-middle");
    let dir2 = root.path().join("2-destination");
    fs::create_dir_all(dir0.join("photos/Sub")).unwrap();
    fs::create_dir_all(dir1.join("Docs")).unwrap();
    fs::create_dir_all(dir2.join("Photos")).unwrap();

    write_file(&dir0.join("photos/Sub/source-a.jpg"), "a");
    write_file(&dir1.join("Docs/middle-a.txt"), "b");

    let progress = Arc::new(InMemoryProgressSink::default());
    let report = execute_migration(
        MigrationEngineRequest {
            chain: vec![dir0.clone(), dir1.clone(), dir2.clone()],
            excludes: vec![],
        },
        Arc::new(JobControl::default()),
        progress,
    )
    .unwrap();

    assert_eq!(report.status, "completed");
    assert!(dir0.join("photos/Sub").is_dir());
    assert!(dir1.join("Docs").is_dir());
    assert!(dir1.join("photos/Sub/source-a.jpg").exists());
    assert!(dir2.join("Docs/middle-a.txt").exists());
    assert!(!dir2.join("Photos/Sub/source-a.jpg").exists());
    let destination_names: Vec<String> = fs::read_dir(&dir2)
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
        .iter()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    assert_eq!(destination_names, vec!["Docs".to_string(), "Photos".to_string()]);
}

#[test]
fn skips_conflicts_reports_them_and_honors_cancellation() {
    let root = tempdir().unwrap();
    let dir0 = root.path().join("0-source");
    let dir1 = root.path().join("1-destination");
    fs::create_dir_all(dir0.join("alpha")).unwrap();
    fs::create_dir_all(dir1.join("alpha")).unwrap();

    write_file(&dir0.join("alpha/incoming.txt"), "incoming");
    write_file(&dir1.join("alpha/incoming.txt"), "existing");
    write_file(&dir0.join("alpha/second.txt"), "second");

    let control = Arc::new(JobControl::default());
    control.cancel_requested.store(true, std::sync::atomic::Ordering::SeqCst);

    let canceled = execute_migration(
        MigrationEngineRequest {
            chain: vec![dir0.clone(), dir1.clone()],
            excludes: vec![],
        },
        Arc::clone(&control),
        Arc::new(InMemoryProgressSink::default()),
    )
    .unwrap();

    assert_eq!(canceled.status, "canceled");
    assert!(dir0.join("alpha/incoming.txt").exists());

    control
        .cancel_requested
        .store(false, std::sync::atomic::Ordering::SeqCst);

    let report = execute_migration(
        MigrationEngineRequest {
            chain: vec![dir0.clone(), dir1.clone()],
            excludes: vec![],
        },
        control,
        Arc::new(InMemoryProgressSink::default()),
    )
    .unwrap();

    assert_eq!(report.status, "completed");
    assert_eq!(report.conflicts.len(), 1);
    assert!(report.conflicts[0].destination.ends_with("alpha/incoming.txt"));
    assert!(dir1.join("alpha/incoming.txt").exists());
    assert!(dir1.join("alpha/second.txt").exists());
    assert!(dir0.join("alpha/incoming.txt").exists());
}

#[test]
fn excludes_matching_directories_from_migration() {
    let root = tempdir().unwrap();
    let dir0 = root.path().join("0-source");
    let dir1 = root.path().join("1-destination");
    fs::create_dir_all(dir0.join("skip-me")).unwrap();
    fs::create_dir_all(dir0.join("keep-me")).unwrap();

    write_file(&dir0.join("skip-me/skip.txt"), "skip");
    write_file(&dir0.join("keep-me/keep.txt"), "keep");

    let report = execute_migration(
        MigrationEngineRequest {
            chain: vec![dir0.clone(), dir1.clone()],
            excludes: vec!["skip-me".to_string()],
        },
        Arc::new(JobControl::default()),
        Arc::new(InMemoryProgressSink::default()),
    )
    .unwrap();

    assert_eq!(report.total_files_moved, 1);
    assert!(dir1.join("keep-me/keep.txt").exists());
    assert!(!dir1.join("skip-me/skip.txt").exists());
    assert!(dir0.join("skip-me/skip.txt").exists());
}
