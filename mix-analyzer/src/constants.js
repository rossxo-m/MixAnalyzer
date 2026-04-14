export const BANDS_7 = [
  { name: "Sub", min: 20, max: 60, color: "#ff3366" },
  { name: "Bass", min: 60, max: 250, color: "#ff6633" },
  { name: "Low Mid", min: 250, max: 500, color: "#ffaa00" },
  { name: "Mid", min: 500, max: 2000, color: "#33cc66" },
  { name: "Up Mid", min: 2000, max: 4000, color: "#33aaff" },
  { name: "Presence", min: 4000, max: 8000, color: "#6644ff" },
  { name: "Air", min: 8000, max: 20000, color: "#cc44ff" },
];

export const BANDS_3 = [
  { name: "Low", min: 20, max: 200, color: "#ff5544", bandIndices: [0, 1] },
  { name: "Mid", min: 200, max: 4000, color: "#44cc66", bandIndices: [2, 3, 4] },
  { name: "High", min: 4000, max: 20000, color: "#4488ff", bandIndices: [5, 6] },
];

export const DEFAULT_PREFS = {
  lufsTarget: -9,
  truePeakCeiling: -1.0,
  monoCrossover: 120,
  showVectorscope: true,
  showBandWidth: true,
  genre: "EDM / Electronic",
  specSlope: 3.0,     // dB/octave (0, 3, 4.5)
  waveMode: "spectral", // "uniform" | "spectral"
  stereoMode: "3band",  // "3band" | "7band"
  bandToggles: [true, true, true], // Low, Mid, High
  liveSpecMode: "line", // "line" | "spectrograph"
  specMs: false,        // M/S toggle (works in any live spec mode)
  volume: 1.0,          // 0..1 gain
  monoPreview: false,   // sum L+R to mono
  feedbackTier: 1,      // 1 = offline template engine; 3 = Claude API (backend /feedback)
  apiKey: "",           // optional — sent as Bearer header, overrides backend env key
  vectorscopeStyle: "dots", // "dots" | "pixels"
};

// Per-genre colors for target curve overlay
export const GENRE_COLORS = {
  "EDM / Electronic": "#ff4488",
  "Hip Hop / Trap": "#ff8833",
  "Pop": "#44ddff",
  "Rock": "#ffcc33",
  "Lo-Fi / Chill": "#88ff66",
};
