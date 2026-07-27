use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HouqinConfig {
    pub chain: Vec<String>,
    pub excludes: Vec<String>,
    pub seeds: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SeedRequest {
    pub source_directory: String,
    pub seeds: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SeedResult {
    pub created: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartMigrationRequest {
    pub chain: Vec<String>,
    pub excludes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartMigrationResult {
    pub job_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CancelMigrationResult {
    pub job_id: String,
    pub status: String,
    pub found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRecord {
    pub step_label: String,
    pub source: String,
    pub destination: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubdirectoryReport {
    pub directory: String,
    pub files_moved: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StepReport {
    pub source_index: usize,
    pub destination_index: usize,
    pub source_path: String,
    pub destination_path: String,
    pub files_moved: usize,
    pub subdirectories: Vec<SubdirectoryReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub job_id: String,
    pub status: String,
    pub total_files_moved: usize,
    pub steps: Vec<StepReport>,
    pub conflicts: Vec<ConflictRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationProgress {
    pub job_id: String,
    pub step_index: usize,
    pub step_label: String,
    pub current_directory: String,
    pub current_file: usize,
    pub total_files: usize,
    pub phase: String,
}
