import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

interface LightGroup {
  date: string;
  filter_code: string;
  exposure: number;
  binning: number;
  count: number;
}

interface FilterMapping {
  code: string;
  astrobin_id: number;
  name: string;
}

interface AstrobinFilter {
  id: number;
  name: string;
  brand_name: string | null;
}

function displayName(f: AstrobinFilter): string {
  return f.brand_name ? `${f.brand_name} ${f.name}` : f.name;
}

// ── Searchable filter picker for one mapping row ────────────────────────────
function FilterPicker({
  mapping,
  allFilters,
  onUpdate,
  onRemove,
}: {
  mapping: FilterMapping;
  allFilters: AstrobinFilter[];
  onUpdate: (field: keyof FilterMapping, value: string | number) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState(mapping.name || "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLTableCellElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const matches =
    query.length >= 2
      ? allFilters
          .filter((f) =>
            displayName(f).toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 25)
      : [];

  function select(f: AstrobinFilter) {
    const dn = displayName(f);
    setQuery(dn);
    onUpdate("astrobin_id", f.id);
    onUpdate("name", dn);
    setOpen(false);
  }

  return (
    <tr>
      <td style={s.td}>
        <input
          style={{ ...s.input, width: 70 }}
          value={mapping.code}
          onChange={(e) => onUpdate("code", e.target.value)}
          placeholder="H"
        />
      </td>
      <td style={{ ...s.td, position: "relative" }} ref={wrapRef}>
        <input
          style={{ ...s.input, width: 340 }}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Search brand or filter name…"
        />
        {mapping.astrobin_id > 0 && (
          <span style={s.idBadge}>#{mapping.astrobin_id}</span>
        )}
        {open && matches.length > 0 && (
          <div style={s.dropdown}>
            {matches.map((f) => (
              <div
                key={f.id}
                style={s.dropdownItem}
                onMouseDown={() => select(f)}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    "#1a2a3a")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    "transparent")
                }
              >
                <span style={s.dropdownName}>{displayName(f)}</span>
                <span style={s.dropdownId}>#{f.id}</span>
              </div>
            ))}
          </div>
        )}
        {open && query.length >= 2 && matches.length === 0 && (
          <div style={s.dropdown}>
            <div style={{ ...s.dropdownItem, color: "#5a6478" }}>
              No matches
            </div>
          </div>
        )}
      </td>
      <td style={s.td}>
        <button style={s.btnDanger} onClick={onRemove}>
          ✕
        </button>
      </td>
    </tr>
  );
}

// ── Main app ────────────────────────────────────────────────────────────────
type View = "main" | "settings";

export default function App() {
  const [view, setView] = useState<View>("main");
  const [logPath, setLogPath] = useState<string | null>(null);
  const [groups, setGroups] = useState<LightGroup[]>([]);
  const [mappings, setMappings] = useState<FilterMapping[]>([]);
  const [bortle, setBortle] = useState<number>(4);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [draftMappings, setDraftMappings] = useState<FilterMapping[]>([]);
  const [astrobinFilters, setAstrobinFilters] = useState<AstrobinFilter[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);

  useEffect(() => {
    invoke<FilterMapping[]>("get_filter_mappings").then(setMappings).catch(() => {});
    invoke<number>("get_bortle").then(setBortle).catch(() => {});
  }, []);

  function updateBortle(value: number) {
    setBortle(value);
    invoke("save_bortle", { bortle: value }).catch(() => {});
  }

  const unmappedCodes = [...new Set(groups.map((g) => g.filter_code))].filter(
    (code) => !mappings.find((m) => m.code === code)
  );

  async function pickLog() {
    setError(null);
    setExportError(null);
    setExportSuccess(null);
    const selected = await open({
      title: "Select WBPP log file",
      filters: [{ name: "Log files", extensions: ["log", "txt"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    setLogPath(selected);
    try {
      const result = await invoke<LightGroup[]>("parse_log", { path: selected });
      setGroups(result);
    } catch (e) {
      setError(String(e));
      setGroups([]);
    }
  }

  async function exportCsv() {
    setExportError(null);
    setExportSuccess(null);
    const dest = await save({
      title: "Save AstroBin CSV",
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: "astrobin_upload.csv",
    });
    if (!dest) return;
    try {
      await invoke("export_csv", { groups, mappings, bortle, outputPath: dest });
      setExportSuccess(dest);
    } catch (e) {
      setExportError(String(e));
    }
  }

  async function openSettings() {
    const draft = mappings.map((m) => ({ ...m }));
    const existingCodes = mappings.map((m) => m.code);
    const newRows: FilterMapping[] = unmappedCodes
      .filter((c) => !existingCodes.includes(c))
      .map((c) => ({ code: c, astrobin_id: 0, name: "" }));
    setDraftMappings([...draft, ...newRows]);
    setView("settings");

    if (astrobinFilters.length === 0) {
      await loadAstrobinFilters(false);
    }
  }

  async function loadAstrobinFilters(forceRefresh: boolean) {
    setFiltersLoading(true);
    setFiltersError(null);
    try {
      const filters = await invoke<AstrobinFilter[]>("get_astrobin_filters", {
        forceRefresh,
      });
      setAstrobinFilters(filters);
    } catch (e) {
      setFiltersError(String(e));
    } finally {
      setFiltersLoading(false);
    }
  }

  async function saveSettings() {
    const valid = draftMappings.filter((m) => m.code.trim() !== "");
    try {
      await invoke("save_filter_mappings", { mappings: valid });
      setMappings(valid);
      setView("main");
    } catch (e) {
      setError(String(e));
    }
  }

  function addMappingRow() {
    setDraftMappings((prev) => [
      ...prev,
      { code: "", astrobin_id: 0, name: "" },
    ]);
  }

  function removeMappingRow(i: number) {
    setDraftMappings((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateDraft(i: number, field: keyof FilterMapping, value: string | number) {
    setDraftMappings((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m))
    );
  }

  // ── Settings view ──────────────────────────────────────────────────────────
  if (view === "settings") {
    return (
      <div style={s.root}>
        <div style={s.header}>
          <span style={s.title}>pi2ab</span>
          <button style={s.btnSecondary} onClick={() => setView("main")}>
            ← Back
          </button>
        </div>
        <div style={s.content}>
          <h2 style={s.sectionTitle}>Filter Mappings</h2>
          <p style={s.hint}>
            Map PixInsight filter codes to AstroBin filters. Type to search the
            AstroBin equipment database.
          </p>

          {filtersLoading && (
            <div style={s.infoBox}>
              Fetching AstroBin filter database… (~2,400 filters)
            </div>
          )}
          {filtersError && (
            <div style={s.errorBox}>
              Failed to load AstroBin filters: {filtersError}
            </div>
          )}
          {!filtersLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span style={s.hint}>
                {astrobinFilters.length > 0
                  ? `${astrobinFilters.length} filters loaded`
                  : "Filter database not loaded"}
              </span>
              <button
                style={s.btnSecondary}
                onClick={() => loadAstrobinFilters(true)}
              >
                ↻ Refresh database
              </button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>PI Code</th>
                <th style={s.th}>AstroBin Filter</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {draftMappings.map((m, i) => (
                <FilterPicker
                  key={i}
                  mapping={m}
                  allFilters={astrobinFilters}
                  onUpdate={(field, value) => updateDraft(i, field, value)}
                  onRemove={() => removeMappingRow(i)}
                />
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={s.btnSecondary} onClick={addMappingRow}>
              + Add row
            </button>
            <button style={s.btnPrimary} onClick={saveSettings}>
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  const filename = logPath
    ? logPath.replace(/\\/g, "/").split("/").pop()
    : null;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.title}>pi2ab</span>
        <button style={s.btnSecondary} onClick={openSettings}>
          Filter Settings
        </button>
      </div>

      <div style={s.content}>
        <div style={s.row}>
          <button style={s.btnPrimary} onClick={pickLog}>
            Open WBPP log…
          </button>
          {filename && <span style={s.filepath}>{filename}</span>}
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {groups.length > 0 && (
          <>
            <div style={s.row}>
              <span style={s.meta}>
                {groups.length} light frame groups parsed
              </span>
              {unmappedCodes.length > 0 && (
                <span style={s.warning}>
                  ⚠ Unmapped filters: {unmappedCodes.join(", ")} — configure in
                  Filter Settings
                </span>
              )}
            </div>

            <div style={{ ...s.row, alignItems: "center", gap: 12 }}>
              <label style={s.label}>Bortle:</label>
              <input
                style={{ ...s.input, width: 60 }}
                type="number"
                min={1}
                max={9}
                value={bortle}
                onChange={(e) => updateBortle(Number(e.target.value))}
              />
              <button
                style={
                  unmappedCodes.length > 0 ? s.btnDisabled : s.btnPrimary
                }
                onClick={exportCsv}
                disabled={unmappedCodes.length > 0}
              >
                Export CSV
              </button>
            </div>

            {exportError && <div style={s.errorBox}>{exportError}</div>}
            {exportSuccess && (
              <div style={s.successBox}>Saved: {exportSuccess}</div>
            )}

            <table style={{ ...s.table, marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Filter</th>
                  <th style={s.th}>Frames</th>
                  <th style={s.th}>Exposure</th>
                  <th style={s.th}>Binning</th>
                  <th style={s.th}>AstroBin ID</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => {
                  const mapping = mappings.find((m) => m.code === g.filter_code);
                  return (
                    <tr
                      key={i}
                      style={i % 2 === 0 ? s.rowEven : s.rowOdd}
                    >
                      <td style={s.td}>{g.date}</td>
                      <td style={s.td}>{g.filter_code}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        {g.count}
                      </td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        {g.exposure}s
                      </td>
                      <td style={{ ...s.td, textAlign: "center" }}>
                        {g.binning}x{g.binning}
                      </td>
                      <td
                        style={{
                          ...s.td,
                          color: mapping ? "#7ec8a0" : "#e07070",
                        }}
                      >
                        {mapping ? mapping.astrobin_id : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {groups.length === 0 && !error && !logPath && (
          <p style={s.hint}>Select a WBPP log file to begin.</p>
        )}
        {groups.length === 0 && !error && logPath && (
          <p style={s.hint}>
            No light frame calibration groups found in log.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    background: "#0f1117",
    color: "#d0d6e0",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: 14,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    borderBottom: "1px solid #1e2434",
    background: "#0a0d14",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 2,
    color: "#a0b8d8",
    textTransform: "uppercase",
  },
  content: { padding: "20px 24px", maxWidth: 900 },
  row: { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  sectionTitle: { margin: "0 0 8px", color: "#a0b8d8", fontWeight: 600, fontSize: 16 },
  hint: { color: "#5a6478", margin: "8px 0" },
  infoBox: {
    background: "#0f1a2a",
    border: "1px solid #1e3050",
    color: "#6a9ad0",
    padding: "8px 12px",
    borderRadius: 4,
    marginBottom: 10,
    fontSize: 13,
  },
  meta: { color: "#7a8898", alignSelf: "center" },
  warning: { color: "#d4a855", alignSelf: "center" },
  filepath: { color: "#7a8898", alignSelf: "center", fontFamily: "monospace", fontSize: 13 },
  label: { alignSelf: "center", color: "#7a8898" },
  errorBox: {
    background: "#2a1515",
    border: "1px solid #5a2020",
    color: "#e07070",
    padding: "8px 12px",
    borderRadius: 4,
    marginBottom: 12,
    fontSize: 13,
  },
  successBox: {
    background: "#0f2a1a",
    border: "1px solid #1e5a30",
    color: "#7ec8a0",
    padding: "8px 12px",
    borderRadius: 4,
    marginBottom: 12,
    fontSize: 13,
  },
  table: { borderCollapse: "collapse", width: "100%" },
  th: {
    textAlign: "left",
    padding: "6px 10px",
    background: "#141824",
    color: "#6a7890",
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: "1px solid #1e2434",
  },
  td: { padding: "5px 10px", borderBottom: "1px solid #1a1f2e" },
  rowEven: { background: "transparent" },
  rowOdd: { background: "#0c0f18" },
  input: {
    background: "#141824",
    border: "1px solid #2a3040",
    color: "#d0d6e0",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 13,
    outline: "none",
    width: 120,
  },
  idBadge: {
    marginLeft: 8,
    color: "#7ec8a0",
    fontSize: 12,
    fontFamily: "monospace",
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 2px)",
    left: 0,
    zIndex: 200,
    background: "#141824",
    border: "1px solid #2a3040",
    borderRadius: 4,
    maxHeight: 220,
    overflowY: "auto",
    width: 420,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  },
  dropdownItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
  },
  dropdownName: { color: "#d0d6e0" },
  dropdownId: { color: "#4a6080", fontSize: 11, fontFamily: "monospace", marginLeft: 8 },
  btnPrimary: {
    background: "#1e3a5a",
    border: "1px solid #2a5080",
    color: "#a0c8f0",
    padding: "6px 14px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
  },
  btnSecondary: {
    background: "#1a1f2e",
    border: "1px solid #2a3040",
    color: "#7a8898",
    padding: "6px 14px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
  },
  btnDanger: {
    background: "transparent",
    border: "none",
    color: "#6a4040",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
  },
  btnDisabled: {
    background: "#141824",
    border: "1px solid #2a3040",
    color: "#3a4450",
    padding: "6px 14px",
    borderRadius: 4,
    cursor: "not-allowed",
    fontSize: 13,
  },
};
