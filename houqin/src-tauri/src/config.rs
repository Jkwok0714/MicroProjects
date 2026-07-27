use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::models::HouqinConfig;

const CONFIG_FILE_NAME: &str = "houqin.json";

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path_resolver()
        .app_config_dir()
        .ok_or_else(|| "Could not resolve an app config directory.".to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    Ok(config_dir.join(CONFIG_FILE_NAME))
}

pub fn load_config(app: &AppHandle) -> Result<HouqinConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(HouqinConfig::default());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

pub fn save_config(app: &AppHandle, config: &HouqinConfig) -> Result<HouqinConfig, String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())?;
    Ok(config.clone())
}
