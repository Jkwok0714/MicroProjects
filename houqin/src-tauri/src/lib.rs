pub mod case_path;
mod commands;
mod config;
pub mod filters;
pub mod migration;
pub mod models;
pub mod seed;

use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use commands::{
    cancel_migration, load_config_command, pick_directory, save_config_command,
    seed_directories_command, start_migration,
};
use migration::JobControl;

#[derive(Default)]
pub struct AppState {
    pub jobs: Arc<Mutex<HashMap<String, Arc<JobControl>>>>,
    pub counter: AtomicU64,
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pick_directory,
            load_config_command,
            save_config_command,
            seed_directories_command,
            start_migration,
            cancel_migration
        ])
        .run(tauri::generate_context!())
        .expect("error while running Houqin");
}
