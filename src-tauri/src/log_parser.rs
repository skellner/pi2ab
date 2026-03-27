use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightGroup {
    pub date: String,
    pub filter_code: String,
    pub exposure: f64,
    pub binning: u8,
    pub count: u32,
}

fn strip_timestamp(line: &str) -> &str {
    // Lines are like: "[2026-03-27 08:11:15] content"
    if let Some(pos) = line.find("] ") {
        &line[pos + 2..]
    } else {
        line
    }
}

fn extract_after_colon(text: &str) -> Option<&str> {
    text.find(':').map(|pos| text[pos + 1..].trim())
}

pub fn parse_wbpp_log(content: &str) -> Vec<LightGroup> {
    let mut groups = Vec::new();
    let mut in_block = false;

    let mut count: Option<u32> = None;
    let mut binning: Option<u8> = None;
    let mut filter_code: Option<String> = None;
    let mut exposure: Option<f64> = None;
    let mut date: Option<String> = None;

    for line in content.lines() {
        let text = strip_timestamp(line);

        if text.contains("LIGHT FRAMES CALIBRATION") {
            in_block = true;
            count = None;
            binning = None;
            filter_code = None;
            exposure = None;
            date = None;
            continue;
        }

        if !in_block {
            continue;
        }

        let trimmed = text.trim();

        if trimmed.starts_with("Group of ") && trimmed.contains("active)") {
            // "Group of N Light frames (M active)"
            if let Some(start) = trimmed.find('(') {
                let sub = &trimmed[start + 1..];
                if let Some(end) = sub.find(" active)") {
                    count = sub[..end].parse().ok();
                }
            }
        } else if trimmed.starts_with("BINNING") {
            if let Some(val) = extract_after_colon(trimmed) {
                binning = val.parse().ok();
            }
        } else if trimmed.starts_with("Filter") && !trimmed.starts_with("Filter name") {
            if let Some(val) = extract_after_colon(trimmed) {
                filter_code = Some(val.to_string());
            }
        } else if trimmed.starts_with("Exposure") {
            if let Some(val) = extract_after_colon(trimmed) {
                let s = val.trim_end_matches('s');
                exposure = s.parse().ok();
            }
        } else if trimmed.starts_with("Keywords") {
            // "Keywords : [DATE: 2026-03-15]"
            if let Some(date_start) = trimmed.find("[DATE: ") {
                let sub = &trimmed[date_start + 7..];
                if let Some(end) = sub.find(']') {
                    date = Some(sub[..end].to_string());
                }
            }
        } else if trimmed.starts_with("Calibration completed:") {
            if let (Some(c), Some(b), Some(f), Some(e), Some(d)) =
                (count, binning, filter_code.clone(), exposure, date.clone())
            {
                groups.push(LightGroup {
                    date: d,
                    filter_code: f,
                    exposure: e,
                    binning: b,
                    count: c,
                });
            }
            in_block = false;
        }
    }

    groups
}
