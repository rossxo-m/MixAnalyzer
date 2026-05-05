import XLSX from "xlsx";
const path = "mix-analyzer-tracker.xlsx";
const wb = XLSX.readFile(path, { cellStyles: true });
const name = wb.SheetNames[0];
const ws = wb.Sheets[name];
const ref = XLSX.utils.decode_range(ws["!ref"]);
let rowNum = ref.e.r;

const rows = [
  [116, "UI / Phase A", "Design tokens: space/radius/shadow/z/motion/type scales in theme.js", "Done", "High",
    "Palette was the only designed layer. All spacing/radius/shadow/transition were ad-hoc (6/7/8 mixed radii, 2/3/4/5/6/7/8 gap mixed, 3 inline transition declarations). Added palette-invariant TOKENS merged into THEME alongside FONTS so THEME.space[3] / THEME.radius.md / THEME.motion.base are available everywhere. No behavior change; tokens ready for migration sites.",
    "Small"],
  [117, "UI / Phase A", "UI primitive layer: Button + Panel + Toggle + Modal + Tabs under components/ui/", "Done", "High",
    "12 hand-rolled button variants across App/Preferences/PlaybackWaveform (every site redefined padding/font/radius/border). Created variant-driven Button (primary/secondary/tertiary/tab/icon/danger, sm+md+icon sizes, built-in hover/active/focus-visible via injected stylesheet). Tabs composes Button + tab variant. Modal is responsive (width: min(92vw, 340px)), ESC-closes, focus-trap via aria-modal. Toggle is role=switch with animated thumb. prefers-reduced-motion respected globally.",
    "Medium"],
  [118, "UI / Phase A", "Migrate App.jsx + Preferences.jsx + PlaybackWaveform.jsx to ui/ primitives", "Done", "High",
    "Zero hand-rolled <button> in the three top sprawl files (was 14 across them). Inline style={{}} count across the three dropped 159 → 136. Preferences modal now uses <Modal> primitive — auto-responsive, ESC-closes, backdrop-click-closes. View switcher uses <Tabs>. All buttons get consistent hover/focus/active feedback for free. Keyboard focus rings now present on every clickable.",
    "Medium"],
  [119, "UI / Phase A", "Canvas font bumps: phase panel labels, BPM indicator, LUFS readouts", "Done", "Medium",
    "Phase panel LOW/MID/HIGH 7px → 10px bold, correlation 7px → 9px, L/R letters 6px → 8px. Waveform BPM + key indicator bold 8px → bold 11px, alpha 0.7 → 0.85. LUFS momentary 8px → bold 12px, short-term 7px → bold 10px, scale ticks 7px → 9px, M/ST labels 6px → 8px, target label 6px → 8px, SCRUB label 6px → 8px. Readability pass across drawers.js — no DSP math changed.",
    "Small"],
];

for (const row of rows) {
  rowNum++;
  row.forEach((val, c) => {
    const addr = XLSX.utils.encode_cell({ r: rowNum, c });
    ws[addr] = { t: typeof val === "number" ? "n" : "s", v: val };
  });
  console.log(`appended row ${rowNum + 1}: #${row[0]} ${row[2]}`);
}
ref.e.r = rowNum;
ws["!ref"] = XLSX.utils.encode_range(ref);
XLSX.writeFile(wb, path);
