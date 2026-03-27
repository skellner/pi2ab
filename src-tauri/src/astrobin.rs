use futures::future::join_all;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

/// Minimal filter record we expose to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AstrobinFilter {
    pub id: u32,
    pub name: String,
    pub brand_name: Option<String>,
}

#[derive(Deserialize)]
struct ApiPage {
    count: u32,
    next: Option<String>,
    results: Vec<ApiFilter>,
}

#[derive(Deserialize)]
struct ApiFilter {
    id: u32,
    name: String,
    #[serde(rename = "brandName")]
    brand_name: Option<String>,
}

const API_BASE: &str = "https://www.astrobin.com/api/v2/equipment/filter/";
const CACHE_TTL_SECS: u64 = 7 * 24 * 3600;

fn page_url(page: u32) -> String {
    if page <= 1 {
        format!("{}?format=json", API_BASE)
    } else {
        format!("{}?format=json&page={}", API_BASE, page)
    }
}

async fn fetch_page(client: &reqwest::Client, page: u32) -> Result<ApiPage, String> {
    let resp = client
        .get(page_url(page))
        .send()
        .await
        .map_err(|e| format!("request error (page {}): {}", page, e))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {} for page {}", status, page));
    }

    resp.json::<ApiPage>()
        .await
        .map_err(|e| format!("json error (page {}): {}", page, e))
}

async fn fetch_all() -> Result<Vec<AstrobinFilter>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // Fetch page 1 to get total count and first batch of results
    let first = fetch_page(&client, 1).await?;
    let total = first.count;
    eprintln!("[pi2ab] AstroBin reports {} filters total", total);

    let mut all: Vec<AstrobinFilter> = first
        .results
        .into_iter()
        .map(|f| AstrobinFilter { id: f.id, name: f.name, brand_name: f.brand_name })
        .collect();

    if first.next.is_none() {
        return Ok(all);
    }

    // Calculate remaining pages (page size is 50)
    let page_size = 50u32;
    let total_pages = (total + page_size - 1) / page_size;
    eprintln!("[pi2ab] fetching {} more pages...", total_pages - 1);

    // Fetch remaining pages in batches of 10
    let remaining: Vec<u32> = (2..=total_pages).collect();
    const BATCH: usize = 10;

    for chunk in remaining.chunks(BATCH) {
        let futs: Vec<_> = chunk.iter().map(|&p| fetch_page(&client, p)).collect();
        let results = join_all(futs).await;

        for res in results {
            match res {
                Ok(page) => {
                    for f in page.results {
                        all.push(AstrobinFilter { id: f.id, name: f.name, brand_name: f.brand_name });
                    }
                }
                Err(e) => eprintln!("[pi2ab] page error (skipping): {}", e),
            }
        }

        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    eprintln!("[pi2ab] fetched {} filters total", all.len());
    Ok(all)
}

fn cache_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join("astrobin_filters.json")
}

fn cache_is_fresh(app_data_dir: &Path) -> bool {
    let path = cache_path(app_data_dir);
    std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.elapsed()
                .map(|e| e < Duration::from_secs(CACHE_TTL_SECS))
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

fn load_cache(app_data_dir: &Path) -> Option<Vec<AstrobinFilter>> {
    let content = std::fs::read_to_string(cache_path(app_data_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_cache(app_data_dir: &Path, filters: &[AstrobinFilter]) {
    if let Some(parent) = cache_path(app_data_dir).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(filters) {
        let _ = std::fs::write(cache_path(app_data_dir), json);
    }
}

/// Returns the full filter list, using a 7-day local cache.
/// Pass `force_refresh = true` to delete the cache and re-fetch immediately.
pub async fn get_filters(app_data_dir: &Path, force_refresh: bool) -> Result<Vec<AstrobinFilter>, String> {
    if force_refresh {
        let _ = std::fs::remove_file(cache_path(app_data_dir));
        eprintln!("[pi2ab] cache cleared, forcing re-fetch");
    }

    if cache_is_fresh(app_data_dir) {
        if let Some(cached) = load_cache(app_data_dir) {
            eprintln!("[pi2ab] loaded {} filters from cache", cached.len());
            return Ok(cached);
        }
    }

    eprintln!("[pi2ab] fetching AstroBin filter database...");
    match fetch_all().await {
        Ok(filters) => {
            save_cache(app_data_dir, &filters);
            Ok(filters)
        }
        Err(e) => {
            eprintln!("[pi2ab] fetch error: {}", e);
            Err(e)
        }
    }
}
