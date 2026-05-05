import XLSX from "xlsx";
const path = "mix-analyzer-tracker.xlsx";
const wb = XLSX.readFile(path, { cellStyles: true });
const name = wb.SheetNames[0];
const ws = wb.Sheets[name];
const ref = XLSX.utils.decode_range(ws["!ref"]);
let rowNum = ref.e.r;
const rows = [
  [112, "DSP Correctness", "LUFS: integrated loudness via power-domain mean (BS.1770-4 §5.1)", "Done", "High",
   "Was averaging block LUFS values in dB space; BS.1770-4 §5.1 requires combining gated blocks by mean 10^(L/10). Also applied abs+rel gates sequentially on the same gated set instead of re-filtering raw blocks. Bias on dynamic material: up to ~1 dB.",
   "Small"],
  [113, "DSP Correctness", "BPM: autocorrelation over full onset sequence", "Done", "High",
   "bpm.js + bpmWorker.js both capped acLen = lagMax*2 (~414 onset frames, ~2.4s) regardless of track length. Now acLen = numFrames — full track correlates, normalized by pair count per lag. Fixes lock-to-noise on tracks with pickup/breakdown in first 2s.",
   "Small"],
  [114, "DSP Correctness", "Waveform peaks from both L+R at base resolution", "Done", "High",
   "sharedFFT spectral waveform pass was computing mx/mn from mid signal only, so a single-channel clip that phase-cancels in M could slip past the clip strip at zoom 1–3×. Now scans both channels; RMS stays mid-derived.",
   "Small"],
  [115, "DSP Correctness", "Spectral waveform color from |M|²+|S|² (= (|L|²+|R|²)/2)", "Done", "Medium",
   "Mid-only band energies went neutral/grey on pure-side content. Now includes side magnitudes when stereo, gated by isStereo flag. Triggers extra side FFTs on wave hops (~2× FFT cost on stereo analysis) but all in the analyzeWorker so UI stays responsive.",
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
