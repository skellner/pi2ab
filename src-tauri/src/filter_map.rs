use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterMapping {
    pub code: String,
    pub astrobin_id: u32,
    pub name: String,
}

fn mappings_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("filter_mappings.json")
}

pub fn load_mappings(app_data_dir: &Path) -> Vec<FilterMapping> {
    let path = mappings_path(app_data_dir);
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

pub fn save_mappings(app_data_dir: &Path, mappings: &[FilterMapping]) -> Result<(), String> {
    let path = mappings_path(app_data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(mappings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
