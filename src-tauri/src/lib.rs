mod astrobin;
mod filter_map;
mod log_parser;

use astrobin::AstrobinFilter;
use filter_map::{FilterMapping, load_mappings, save_mappings};
use log_parser::{LightGroup, parse_wbpp_log};
use tauri::Manager;

#[tauri::command]
fn parse_log(path: String) -> Result<Vec<LightGroup>, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(parse_wbpp_log(&content))
}

#[tauri::command]
fn get_filter_mappings(app_handle: tauri::AppHandle) -> Vec<FilterMapping> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    load_mappings(&dir)
}

#[tauri::command]
fn save_filter_mappings(
    app_handle: tauri::AppHandle,
    mappings: Vec<FilterMapping>,
) -> Result<(), String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    save_mappings(&dir, &mappings)
}

#[tauri::command]
async fn get_astrobin_filters(
    app_handle: tauri::AppHandle,
    force_refresh: bool,
) -> Result<Vec<AstrobinFilter>, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    astrobin::get_filters(&dir, force_refresh).await
}

#[tauri::command]
fn export_csv(
    groups: Vec<LightGroup>,
    mappings: Vec<FilterMapping>,
    bortle: u8,
    output_path: String,
) -> Result<(), String> {
    let mut rows = vec!["date,filter,filterName,number,duration,binning,bortle".to_string()];

    for group in &groups {
        let mapping = mappings.iter().find(|m| m.code == group.filter_code);
        let (filter_id, filter_name) = match mapping {
            Some(m) => (m.astrobin_id.to_string(), m.name.clone()),
            None => {
                return Err(format!(
                    "No AstroBin mapping for filter '{}'. Please configure it in settings.",
                    group.filter_code
                ))
            }
        };

        // AstroBin uses 0-indexed binning: 1x1 = 0, 2x2 = 1
        let astrobin_binning = group.binning.saturating_sub(1);
        let duration = group.exposure as u32;

        rows.push(format!(
            "{},{},{},{},{},{},{}",
            group.date,
            filter_id,
            filter_name,
            group.count,
            duration,
            astrobin_binning,
            bortle
        ));
    }

    let csv = rows.join("\n");
    std::fs::write(&output_path, csv).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            parse_log,
            get_filter_mappings,
            save_filter_mappings,
            export_csv,
            get_astrobin_filters,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
