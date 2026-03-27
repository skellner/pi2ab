# pi2ab

**pi2ab** converts [PixInsight](https://pixinsight.com/) Weighted Batch Pre-Processing (WBPP) log files into CSV files ready for upload to [AstroBin](https://www.astrobin.com/).

## What it does

When you finish a WBPP run in PixInsight, it produces a detailed log file. pi2ab reads that log, extracts every light frame calibration group (date, filter, exposure, frame count, binning), lets you map your filter codes to AstroBin filter IDs, and exports a CSV that AstroBin's acquisition importer accepts directly.

**AstroBin CSV format produced:**
```
date,filter,filterName,number,duration,binning,bortle
2026-03-16,5765,Astronomik Ha 6nm 36mm,39,600,0,2
2026-03-18,5766,Astronomik OIII 6nm 36mm,31,600,0,2
```

## Features

- **Log parsing** — reads the `LIGHT FRAMES CALIBRATION` summary section of any WBPP log, extracting date, filter code, exposure, binning, and active frame count per group
- **Filter mapping** — searchable settings screen backed by the full AstroBin equipment database (~2,400 filters); mappings persist between sessions
- **AstroBin filter search** — type 2+ characters to search brand and filter name; results cached locally for 7 days
- **CSV export** — native save dialog; one row per date/filter/exposure group, ready to paste into AstroBin's acquisition form
- **Bortle** — set per-export from the main screen

## Installation

### Pre-built (Windows)

Download the latest `.msi` installer from [Releases](https://github.com/skellner/pi2ab/releases).

### Build from source

**Prerequisites:**
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Node.js](https://nodejs.org/) 18+
- Windows (WebView2 required — included in Windows 10/11)

```bash
git clone https://github.com/skellner/pi2ab.git
cd pi2ab
npm install
npm run tauri build
```

The installer will be at `src-tauri/target/release/bundle/msi/`.

**Development:**
```bash
npm run tauri dev
```

## Usage

1. **Open a WBPP log** — click "Open WBPP log…" and select the `.log` file from your PixInsight output folder (e.g. `D:\OUT\MyTarget\logs\20260327081113.log`)
2. **Map filters** — if any PI filter codes are unmapped, a warning appears. Click **Filter Settings**, search for each filter in the AstroBin database, and save.
3. **Set Bortle** — enter your sky's Bortle class
4. **Export** — click **Export CSV** and save the file. Upload it to AstroBin under your image's acquisition data.

## How the log is parsed

pi2ab looks for `LIGHT FRAMES CALIBRATION` summary blocks near the end of the WBPP log. Each block contains:

```
LIGHT FRAMES CALIBRATION
Group of 39 Light frames (39 active)
BINNING  : 1
Filter   : H
Exposure : 600.00s
Keywords : [DATE: 2026-03-16]
```

The **active** count (frames that passed calibration) is used as the frame count. Post-calibration blocks (registration/stacking, which lack date keywords) are ignored.

## Filter mapping

PixInsight uses short filter codes (`H`, `O`, `S`, `L`, `R`, `G`, `B`…). AstroBin identifies filters by numeric ID from its equipment database. The settings screen lets you search by brand or name and stores the mapping locally.

Mappings are saved to:
```
%APPDATA%\com.stefan.pi2ab\filter_mappings.json
```

The AstroBin filter list is fetched once and cached for 7 days at:
```
%APPDATA%\com.stefan.pi2ab\astrobin_filters.json
```

## Tech stack

| Layer | Technology |
|---|---|
| App shell | [Tauri 2](https://tauri.app/) |
| Frontend | React 19 + TypeScript + Vite |
| Backend | Rust |
| HTTP | reqwest 0.12 (rustls) |
| Persistence | JSON files in app data dir |

## License

MIT
