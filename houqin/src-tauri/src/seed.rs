use std::fs;
use std::path::{Path, PathBuf};

use crate::case_path::ensure_relative_directory;

pub fn seed_directories(source_root: &Path, seeds: &[String]) -> Result<Vec<PathBuf>, String> {
    if !source_root.is_dir() {
        return Err("Source directory does not exist.".into());
    }

    let mut created = Vec::new();
    for seed in seeds {
        let relative = PathBuf::from(seed);
        let full = ensure_relative_directory(source_root, &relative)?;
        if full != source_root {
            created.push(full);
        }
    }

    // `ensure_relative_directory` creates missing nodes one by one, but if the
    // root folder was missing we still want the error above instead of auto-creating it.
    fs::metadata(source_root).map_err(|error| error.to_string())?;

    Ok(created)
}
