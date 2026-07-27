use std::fs;
use std::path::{Component, Path, PathBuf};

fn normalize_relative_path(relative: &Path) -> Result<Vec<String>, String> {
    if relative.as_os_str().is_empty() {
        return Ok(vec![]);
    }

    let mut segments = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => segments.push(value.to_string_lossy().to_string()),
            _ => return Err("Paths must be relative and must not contain traversal segments.".into()),
        }
    }

    Ok(segments)
}

pub fn ensure_relative_directory(base: &Path, relative: &Path) -> Result<PathBuf, String> {
    let segments = normalize_relative_path(relative)?;
    let mut current = base.to_path_buf();

    for segment in segments {
        let existing = fs::read_dir(&current)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .find(|entry| {
                entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
                    && entry
                        .file_name()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(&segment)
            })
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .unwrap_or(segment.clone());

        current.push(&existing);
        if !current.exists() {
            fs::create_dir(&current).map_err(|error| error.to_string())?;
        }
    }

    Ok(current)
}
