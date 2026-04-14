// Shared font stacks — never change per theme.
const FONTS = {
  mono: "'JetBrains Mono', monospace",
  sans: "'Instrument Sans', -apple-system, sans-serif",
};

// Non-color design tokens. Palette-invariant — same across every theme preset.
// THEME.space[3] → 8px, THEME.radius.md → 6px, THEME.type.base → 12, etc.
const TOKENS = {
  space: { 0: 0, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16, 6: 24, 7: 32 },
  radius: { xs: 2, sm: 4, md: 6, lg: 10, pill: 999 },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.25)",
    md: "0 2px 8px rgba(0,0,0,0.35)",
    lg: "0 6px 24px rgba(0,0,0,0.45)",
    inset: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  z: { base: 0, overlay: 10, modal: 100, toast: 1000 },
  motion: {
    fast: "120ms ease",
    base: "180ms ease",
    slow: "240ms cubic-bezier(.2,.6,.2,1)",
  },
  type: { xs: 10, sm: 11, base: 12, md: 14, lg: 16, xl: 20 },
};

// Theme presets. Shape mirrors the old THEME constant so every existing
// `THEME.bg` / `THEME.accent` call site works unchanged.
//
// Chrome fields (UI): bg, card, border, dim, text, sub, accent, good, warn, error, info
// Signal fields (canvas meters): waveBg, waveCard, waveGrid, waveGridText, waveCenter,
//   bandLow, bandMid, bandHigh, playhead, beatGrid, clipIndicator, midCurve, sideCurve,
//   keyMajor, keyMinor
//
export const THEMES = {
  nebula: {
    name: "Nebula",
    bg: "#0b0b16", card: "#0e0e1c", border: "#181830",
    dim: "#6666a0", text: "#f0f0ff", sub: "#9090c0",
    accent: "#6644ff", good: "#22cc66", warn: "#ff8833",
    error: "#ff3355", info: "#33aaff",
    waveBg: "#080812", waveCard: "#0c0c1a",
    waveGrid: "#1a1a30", waveGridText: "#3a3a55", waveCenter: "#111120",
    bandLow: "#ff5544", bandMid: "#44cc66", bandHigh: "#4488ff",
    playhead: "#ffffff", beatGrid: "#ff8833", clipIndicator: "#ff3355",
    midCurve: "#55ccff", sideCurve: "#ff8833",
    keyMajor: "#33ccaa", keyMinor: "#aa66ff",
  },
  graphite: {
    name: "Graphite",
    bg: "#1e1f1f", card: "#232323", border: "#3f3f3f",
    dim: "#6e6e6e", text: "#afafaf", sub: "#888888",
    accent: "#5fa9c0", good: "#6db373", warn: "#ffd991",
    error: "#c22d0e", info: "#5fa9c0",
    waveBg: "#161616", waveCard: "#1e1f1f",
    waveGrid: "#3f3f3f", waveGridText: "#6e6e6e", waveCenter: "#2c2c2c",
    bandLow: "#ff665a", bandMid: "#5fa9c0", bandHigh: "#ffd991",
    playhead: "#afafaf", beatGrid: "#ffd991", clipIndicator: "#c22d0e",
    midCurve: "#5fa9c0", sideCurve: "#ff665a",
    keyMajor: "#6db373", keyMinor: "#d09090",
  },
  onyx: {
    name: "Onyx",
    bg: "#000000", card: "#0c0c0c", border: "#252525",
    dim: "#606060", text: "#c0c0c0", sub: "#a4a4a4",
    accent: "#3088d0", good: "#44dd88", warn: "#ffc047",
    error: "#fc0803", info: "#3088d0",
    waveBg: "#000000", waveCard: "#0c0c0c",
    waveGrid: "#252525", waveGridText: "#606060", waveCenter: "#151515",
    bandLow: "#fc0803", bandMid: "#ffc047", bandHigh: "#3088d0",
    playhead: "#c0c0c0", beatGrid: "#ffc047", clipIndicator: "#fc0803",
    midCurve: "#3088d0", sideCurve: "#ffc047",
    keyMajor: "#44dd88", keyMinor: "#cc88aa",
  },
  abyss: {
    name: "Abyss",
    bg: "#0a1220", card: "#0f1830", border: "#1a2342",
    dim: "#5577aa", text: "#e8edf5", sub: "#8098c0",
    accent: "#3388ff", good: "#44dd88", warn: "#ffaa44",
    error: "#ff5577", info: "#55ccee",
    waveBg: "#070e1a", waveCard: "#0a1220",
    waveGrid: "#1a2342", waveGridText: "#5577aa", waveCenter: "#13202f",
    bandLow: "#ff5577", bandMid: "#44dd88", bandHigh: "#3388ff",
    playhead: "#e8edf5", beatGrid: "#ffaa44", clipIndicator: "#ff5577",
    midCurve: "#55ccee", sideCurve: "#ffaa44",
    keyMajor: "#44dd88", keyMinor: "#aa88ff",
  },
  retrograde: {
    name: "Retrograde",
    bg: "#07030f", card: "#0e0820", border: "#1f1030",
    dim: "#8855aa", text: "#ffe8ff", sub: "#cc88dd",
    accent: "#ff2288", good: "#22ff88", warn: "#ffcc33",
    error: "#ff3366", info: "#33ccff",
    waveBg: "#04020a", waveCard: "#0a0618",
    waveGrid: "#1f1030", waveGridText: "#8855aa", waveCenter: "#1a0828",
    bandLow: "#ff2288", bandMid: "#ffcc33", bandHigh: "#33ccff",
    playhead: "#ffe8ff", beatGrid: "#ffcc33", clipIndicator: "#ff3366",
    midCurve: "#33ccff", sideCurve: "#ff2288",
    keyMajor: "#22ff88", keyMinor: "#cc44ff",
  },
  daylight: {
    name: "Daylight",
    bg: "#f5f5f8", card: "#ffffff", border: "#d0d3dc",
    dim: "#7a7e8c", text: "#0e1020", sub: "#404558",
    accent: "#5533ee", good: "#118844", warn: "#cc6611",
    error: "#cc2244", info: "#1166cc",
    waveBg: "#ffffff", waveCard: "#f5f5f8",
    waveGrid: "#d0d3dc", waveGridText: "#7a7e8c", waveCenter: "#e6e9f0",
    bandLow: "#cc2244", bandMid: "#118844", bandHigh: "#1166cc",
    playhead: "#0e1020", beatGrid: "#cc6611", clipIndicator: "#cc2244",
    midCurve: "#1166cc", sideCurve: "#cc6611",
    keyMajor: "#118844", keyMinor: "#8833cc",
  },
};

// Mutable singleton — every module that did `import { THEME } from './theme.js'`
// sees the current palette because each render reads properties fresh.
export const THEME = { ...THEMES.nebula, ...FONTS, ...TOKENS };

export function applyTheme(name) {
  const preset = THEMES[name] || THEMES.nebula;
  Object.assign(THEME, preset, FONTS, TOKENS);
}

// Helper: parse "#rrggbb" → [r, g, b] for additive-alpha rendering.
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map(c => c + c).join("")
    : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Helper: return "#rrggbbaa" (hex with alpha byte). alpha ∈ [0,1].
export function withAlpha(hex, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  const hh = Math.round(a * 255).toString(16).padStart(2, "0");
  const base = hex.length === 4
    ? "#" + hex.slice(1).split("").map(c => c + c).join("")
    : hex.slice(0, 7);
  return base + hh;
}
