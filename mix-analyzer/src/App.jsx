import { useState, useRef, useCallback, useMemo, useEffect } from "react";

/* ════════════════════════════════════════════════════
   CONSTANTS
   ════════════════════════════════════════════════════ */

const BANDS_7 = [
  { name: "Sub", min: 20, max: 60, color: "#ff3366" },
  { name: "Bass", min: 60, max: 250, color: "#ff6633" },
  { name: "Low Mid", min: 250, max: 500, color: "#ffaa00" },
  { name: "Mid", min: 500, max: 2000, color: "#33cc66" },
  { name: "Up Mid", min: 2000, max: 4000, color: "#33aaff" },
  { name: "Presence", min: 4000, max: 8000, color: "#6644ff" },
  { name: "Air", min: 8000, max: 20000, color: "#cc44ff" },
];

const BANDS_3 = [
  { name: "Low", min: 20, max: 200, color: "#ff5544", bandIndices: [0, 1] },
  { name: "Mid", min: 200, max: 4000, color: "#44cc66", bandIndices: [2, 3, 4] },
  { name: "High", min: 4000, max: 20000, color: "#4488ff", bandIndices: [5, 6] },
];

// High-resolution target curves: [freq, dBRelative, ±rangedB] triplets
// dB values are relative to the 1kHz reference level of the analyzed track
// Range values define the acceptable tolerance band (wider at extremes, tighter in mids)
// Derived from analysis of commercial masters (iZotope TBC methodology):
// - EDM drops approximate pink noise (flat at 3dB/oct slope)
// - Modern masters show ~4.5dB/oct natural rolloff
// - Tolerance is WIDER at frequency extremes (sub, air) and TIGHTER in mids
const GENRE_CURVES = {
  "EDM / Electronic": {
    lufs: -9,
    points: [
      [20, 2, 6], [30, 4, 5], [40, 5, 4.5], [50, 5.5, 4], [60, 5, 3.5],
      [80, 4, 3], [100, 3, 3], [120, 2, 2.5], [150, 1, 2.5], [200, 0, 2.5],
      [250, -1, 2.5], [300, -2, 2], [400, -2.5, 2], [500, -2, 2],
      [600, -1.5, 2], [800, -1, 2], [1000, 0, 2], [1200, 0.5, 2],
      [1500, 1, 2], [2000, 1.5, 2.5], [2500, 1.5, 2.5], [3000, 1, 2.5],
      [4000, 0.5, 3], [5000, 0, 3], [6000, -0.5, 3], [8000, -1, 3.5],
      [10000, -2, 4], [12000, -3, 4.5], [15000, -5, 5], [20000, -8, 6],
    ],
  },
  "Hip Hop / Trap": {
    lufs: -10,
    points: [
      [20, 3, 6], [30, 5, 5], [40, 6, 4.5], [50, 6.5, 4], [60, 6, 3.5],
      [80, 5, 3], [100, 3.5, 3], [120, 2, 2.5], [150, 1, 2.5], [200, 0, 2.5],
      [250, -0.5, 2.5], [300, -1.5, 2], [400, -2, 2], [500, -1.5, 2],
      [600, -1, 2], [800, -0.5, 2], [1000, 0, 2], [1200, 0, 2],
      [1500, 0.5, 2.5], [2000, 1, 2.5], [2500, 1, 2.5], [3000, 0.5, 3],
      [4000, 0, 3], [5000, -0.5, 3], [6000, -1, 3.5], [8000, -2, 3.5],
      [10000, -3, 4], [12000, -4, 4.5], [15000, -6, 5], [20000, -10, 6],
    ],
  },
  "Pop": {
    lufs: -12,
    points: [
      [20, -2, 5], [30, 0, 4.5], [40, 1, 4], [50, 1.5, 3.5], [60, 2, 3],
      [80, 2, 3], [100, 2, 2.5], [120, 1.5, 2.5], [150, 1, 2], [200, 0.5, 2],
      [250, 0, 2], [300, -0.5, 2], [400, -1, 2], [500, -0.5, 1.5],
      [600, 0, 1.5], [800, 0, 1.5], [1000, 0, 1.5], [1200, 0.5, 1.5],
      [1500, 1, 2], [2000, 1.5, 2], [2500, 2, 2], [3000, 2, 2.5],
      [4000, 1.5, 2.5], [5000, 1, 3], [6000, 0.5, 3], [8000, 0, 3.5],
      [10000, -0.5, 4], [12000, -1.5, 4.5], [15000, -3, 5], [20000, -6, 6],
    ],
  },
  "Rock": {
    lufs: -11,
    points: [
      [20, -1, 5.5], [30, 1, 5], [40, 2, 4.5], [50, 2.5, 4], [60, 2.5, 3.5],
      [80, 2, 3], [100, 2, 3], [120, 1.5, 2.5], [150, 1.5, 2.5], [200, 1, 2.5],
      [250, 0.5, 2.5], [300, 0, 2.5], [400, 0, 2.5], [500, 0, 2.5],
      [600, 0, 2.5], [800, 0, 2], [1000, 0, 2], [1200, 0, 2],
      [1500, 0.5, 2.5], [2000, 1, 2.5], [2500, 1, 3], [3000, 1, 3],
      [4000, 0.5, 3], [5000, 0, 3.5], [6000, -0.5, 3.5], [8000, -1.5, 4],
      [10000, -2.5, 4], [12000, -4, 4.5], [15000, -6, 5], [20000, -9, 6],
    ],
  },
  "Lo-Fi / Chill": {
    lufs: -14,
    points: [
      [20, 0, 6], [30, 1, 5], [40, 2, 4.5], [50, 3, 4], [60, 3, 3.5],
      [80, 3, 3], [100, 2.5, 3], [120, 2, 2.5], [150, 2, 2.5], [200, 1.5, 2.5],
      [250, 1, 2.5], [300, 0.5, 2.5], [400, 0, 2.5], [500, 0, 2],
      [600, 0, 2], [800, 0, 2], [1000, 0, 2], [1200, -0.5, 2.5],
      [1500, -1, 2.5], [2000, -1, 3], [2500, -1.5, 3], [3000, -2, 3.5],
      [4000, -2.5, 3.5], [5000, -3, 4], [6000, -4, 4], [8000, -5, 4.5],
      [10000, -7, 5], [12000, -9, 5.5], [15000, -12, 6], [20000, -16, 7],
    ],
  },
};

// Helper: interpolate a target curve at any frequency (log-space cosine interp)
// Returns { db, range } — center dB and ± tolerance at that frequency
function interpolateTargetCurve(curvePoints, freq) {
  if (freq <= curvePoints[0][0]) return { db: curvePoints[0][1], range: curvePoints[0][2] || 3 };
  const last = curvePoints[curvePoints.length - 1];
  if (freq >= last[0]) return { db: last[1], range: last[2] || 3 };
  for (let i = 0; i < curvePoints.length - 1; i++) {
    if (freq >= curvePoints[i][0] && freq <= curvePoints[i + 1][0]) {
      const t = Math.log(freq / curvePoints[i][0]) / Math.log(curvePoints[i + 1][0] / curvePoints[i][0]);
      const smooth = 0.5 - 0.5 * Math.cos(t * Math.PI);
      const db = curvePoints[i][1] + (curvePoints[i + 1][1] - curvePoints[i][1]) * smooth;
      const r0 = curvePoints[i][2] || 3, r1 = curvePoints[i + 1][2] || 3;
      const range = r0 + (r1 - r0) * smooth;
      return { db, range };
    }
  }
  return { db: 0, range: 3 };
}

// Keep 7-band distribution targets for the band bars (derived from curves)
const GENRE_TARGETS = {};
for (const [name, curve] of Object.entries(GENRE_CURVES)) {
  // Approximate band energy proportions from the curve shape
  const bandEnergies = BANDS_7.map(band => {
    const centerFreq = Math.sqrt(band.min * band.max);
    const dbAtCenter = interpolateTargetCurve(curve.points, centerFreq).db;
    return Math.pow(10, dbAtCenter / 10); // convert dB to linear energy
  });
  const total = bandEnergies.reduce((a, b) => a + b, 0);
  GENRE_TARGETS[name] = {
    lufs: curve.lufs,
    bands: bandEnergies.map(e => +(e / total).toFixed(3)),
  };
}

const DEFAULT_PREFS = {
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
};

// Per-genre colors for target curve overlay
const GENRE_COLORS = {
  "EDM / Electronic": "#ff4488",
  "Hip Hop / Trap": "#ff8833",
  "Pop": "#44ddff",
  "Rock": "#ffcc33",
  "Lo-Fi / Chill": "#88ff66",
};

const THEME = {
  bg: "#0b0b16", card: "#0e0e1c", border: "#181830",
  dim: "#3a3a50", text: "#e0e0f0", sub: "#5a5a70",
  mono: "'JetBrains Mono', monospace",
  sans: "'Instrument Sans', -apple-system, sans-serif",
  accent: "#6644ff", good: "#22cc66", warn: "#ff8833",
  error: "#ff3355", info: "#33aaff",
};

/* ════════════════════════════════════════════════════
   DSP: Biquad, K-weighting, LUFS
   ════════════════════════════════════════════════════ */

function applyBiquad(samples, b0, b1, b2, a1, a2) {
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

function kWeightFilter(samples, sampleRate) {
  // Stage 1: High shelf (+4dB @ 1681Hz)
  const A = Math.pow(10, 3.9998 / 40);
  const w0 = 2 * Math.PI * 1681.97 / sampleRate;
  const sinW = Math.sin(w0), cosW = Math.cos(w0);
  const alpha = sinW / (2 * 0.7072), sqrtA = Math.sqrt(A);
  const b0 = A * ((A + 1) + (A - 1) * cosW + 2 * sqrtA * alpha);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
  const b2 = A * ((A + 1) + (A - 1) * cosW - 2 * sqrtA * alpha);
  const a0 = (A + 1) - (A - 1) * cosW + 2 * sqrtA * alpha;
  const a1 = 2 * ((A - 1) - (A + 1) * cosW);
  const a2 = (A + 1) - (A - 1) * cosW - 2 * sqrtA * alpha;
  const stage1 = applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);

  // Stage 2: High-pass (RLB @ 38Hz)
  const w2 = 2 * Math.PI * 38.14 / sampleRate;
  const alpha2 = Math.sin(w2) / (2 * 0.5003);
  const hpB0 = (1 + Math.cos(w2)) / 2;
  const hpB1 = -(1 + Math.cos(w2));
  const hpB2 = (1 + Math.cos(w2)) / 2;
  const hpA0 = 1 + alpha2;
  const hpA1 = -2 * Math.cos(w2);
  const hpA2 = 1 - alpha2;
  return applyBiquad(stage1, hpB0/hpA0, hpB1/hpA0, hpB2/hpA0, hpA1/hpA0, hpA2/hpA0);
}

function computeLUFS(buffer) {
  const sr = buffer.sampleRate, nCh = buffer.numberOfChannels, len = buffer.length;
  const kWeighted = [];
  for (let ch = 0; ch < nCh; ch++) kWeighted.push(kWeightFilter(buffer.getChannelData(ch), sr));
  const weights = [1, 1, 1, 1.41, 1.41];
  const blockSize = Math.floor(sr * 0.4), stepSize = Math.floor(sr * 0.1);
  const blockLoudness = [];

  for (let s = 0; s + blockSize <= len; s += stepSize) {
    let power = 0;
    for (let ch = 0; ch < nCh; ch++) {
      let chPow = 0;
      const data = kWeighted[ch];
      for (let i = s; i < s + blockSize; i++) chPow += data[i] * data[i];
      power += (weights[ch] || 1) * (chPow / blockSize);
    }
    blockLoudness.push(-0.691 + 10 * Math.log10(power + 1e-20));
  }

  if (!blockLoudness.length) return { integrated: -70, shortTerm: -70, lra: 0 };

  // Absolute gate at -70 LUFS
  let gated = blockLoudness.filter(l => l > -70);
  if (!gated.length) return { integrated: -70, shortTerm: -70, lra: 0 };

  // Relative gate at mean - 10
  const relativeThreshold = gated.reduce((a, b) => a + b) / gated.length - 10;
  const finalGated = blockLoudness.filter(l => l > relativeThreshold);
  const integrated = finalGated.length ? finalGated.reduce((a, b) => a + b) / finalGated.length : -70;

  // LRA + short-term max: slide 3s window across full track (1s hop)
  const stBlocks = [];
  const stSize = Math.floor(sr * 3), stStep = Math.floor(sr);
  for (let s = 0; s + stSize <= len; s += stStep) {
    let pow = 0;
    for (let ch = 0; ch < nCh; ch++) {
      let chP = 0;
      const data = kWeighted[ch];
      for (let i = s; i < s + stSize; i++) chP += data[i] * data[i];
      pow += (weights[ch] || 1) * (chP / stSize);
    }
    stBlocks.push(-0.691 + 10 * Math.log10(pow + 1e-20));
  }
  const absGated = stBlocks.filter(l => l > -70);
  // Short-term = loudest 3s window across the full track
  const shortTerm = absGated.length ? Math.max(...absGated) : integrated;
  const relMean = absGated.length ? absGated.reduce((a, b) => a + b) / absGated.length : -70;
  const relGated = absGated.filter(l => l > relMean - 20).sort((a, b) => a - b);
  const p10 = relGated[Math.floor(relGated.length * 0.1)] || -70;
  const p95 = relGated[Math.floor(relGated.length * 0.95)] || -70;

  return {
    integrated: +integrated.toFixed(1),
    shortTerm: +shortTerm.toFixed(1),
    lra: +(p95 - p10).toFixed(1),
  };
}

/* ════════════════════════════════════════════════════
   DSP: True Peak, FFT
   ════════════════════════════════════════════════════ */

function computeTruePeak(buffer) {
  let max = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 1; i < data.length - 2; i++) {
      let abs = Math.abs(data[i]);
      if (abs > max) max = abs;
      const s0 = data[i-1], s1 = data[i], s2 = data[i+1], s3 = data[i+2];
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const v = Math.abs(0.5 * ((2*s1) + (-s0+s2)*t + (2*s0-5*s1+4*s2-s3)*t*t + (-s0+3*s1-3*s2+s3)*t*t*t));
        if (v > max) max = v;
      }
    }
  }
  return +(20 * Math.log10(max + 1e-20)).toFixed(2);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wR = Math.cos(ang), wI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cR = 1, cI = 0;
      for (let j = 0; j < len / 2; j++) {
        const idx = i + j + len / 2;
        const tR = cR * re[idx] - cI * im[idx];
        const tI = cR * im[idx] + cI * re[idx];
        re[idx] = re[i+j] - tR; im[idx] = im[i+j] - tI;
        re[i+j] += tR; im[i+j] += tI;
        const nr = cR * wR - cI * wI;
        cI = cR * wI + cI * wR; cR = nr;
      }
    }
  }
}

/* ════════════════════════════════════════════════════
   DSP: Spectrum + Spectral Waveform Data (Phase 1 NEW)
   ════════════════════════════════════════════════════ */

function computeSpectrum(buffer) {
  const sr = buffer.sampleRate, len = buffer.length;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const N = 8192, half = N / 2, hop = N / 2;

  // Hann window
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));

  const avgMag = new Float64Array(half);
  const avgMagS = new Float64Array(half); // Side (L-R)/2 spectrum
  const freqRes = sr / N;
  const numHops = Math.floor((len - N) / hop);
  const maxFrames = Math.min(numHops, 48);
  const frameStep = Math.max(1, Math.floor(numHops / maxFrames));
  let frameCount = 0;

  // ── Spectral waveform: per-frame 3-band energy ──
  const totalFramesForWaveform = Math.min(numHops, 600);
  const waveStep = Math.max(1, Math.floor(numHops / totalFramesForWaveform));
  const spectralWaveform = []; // array of { low, mid, high, rms }

  // Band bin ranges for 3-band
  const band3Ranges = BANDS_3.map(b => ({
    lo: Math.max(1, Math.floor(b.min / freqRes)),
    hi: Math.min(half - 1, Math.ceil(b.max / freqRes)),
  }));

  for (let h = 0; h < numHops; h++) {
    const off = h * hop;
    if (off + N > len) break;

    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((L[off + i] + R[off + i]) / 2) * win[i];
    fft(re, im);

    // Accumulate average spectrum (sampled frames)
    if (h % frameStep === 0) {
      for (let i = 0; i < half; i++) avgMag[i] += Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      // Side spectrum: (L-R)/2
      const reS = new Float64Array(N), imS = new Float64Array(N);
      for (let i = 0; i < N; i++) reS[i] = ((L[off + i] - R[off + i]) / 2) * win[i];
      fft(reS, imS);
      for (let i = 0; i < half; i++) avgMagS[i] += Math.sqrt(reS[i] * reS[i] + imS[i] * imS[i]);
      frameCount++;
    }

    // Spectral waveform data (sampled frames)
    if (h % waveStep === 0) {
      const bandEnergy = [0, 0, 0];
      let totalE = 0;
      for (let b = 0; b < 3; b++) {
        const { lo, hi } = band3Ranges[b];
        for (let k = lo; k <= hi; k++) {
          const mag = re[k] * re[k] + im[k] * im[k];
          bandEnergy[b] += mag;
          totalE += mag;
        }
      }
      // Normalize to proportions
      const total = totalE + 1e-20;
      // Also compute RMS for this frame
      let rms = 0;
      for (let i = 0; i < N; i++) {
        const m = (L[off + i] + R[off + i]) / 2;
        rms += m * m;
      }
      rms = Math.sqrt(rms / N);
      // Peak for this frame
      let mx = 0, mn = 0;
      for (let i = 0; i < N; i++) {
        const m = (L[off + i] + R[off + i]) / 2;
        if (m > mx) mx = m;
        if (m < mn) mn = m;
      }
      spectralWaveform.push({
        low: bandEnergy[0] / total,
        mid: bandEnergy[1] / total,
        high: bandEnergy[2] / total,
        rms, mx, mn,
      });
    }
  }

  if (frameCount > 0) for (let i = 0; i < half; i++) { avgMag[i] /= frameCount; avgMagS[i] /= frameCount; }

  // 7-band distribution
  const bandEnergies = BANDS_7.map(({ min, max }) => {
    let e = 0;
    for (let i = Math.max(1, Math.floor(min / freqRes)); i <= Math.min(half - 1, Math.ceil(max / freqRes)); i++)
      e += avgMag[i] * avgMag[i];
    return e;
  });
  const totalEnergy = bandEnergies.reduce((a, b) => a + b, 0);
  const bandDistribution = bandEnergies.map(e => e / (totalEnergy + 1e-20));

  // Spectrum curve points — 1/3 octave smoothed (like Ozone/SPAN)
  // Instead of sampling single bins, average all bins within a fractional-octave window
  const spectrumPoints = [];
  const numPts = 300, fMin = 20, fMax = Math.min(20000, sr / 2);
  const smoothingOctaves = 1 / 6; // 1/6 octave smoothing width

  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const centerFreq = fMin * Math.pow(fMax / fMin, t);
    // Window: centerFreq * 2^(-smoothing/2) to centerFreq * 2^(+smoothing/2)
    const loFreq = centerFreq * Math.pow(2, -smoothingOctaves / 2);
    const hiFreq = centerFreq * Math.pow(2, smoothingOctaves / 2);
    const loBin = Math.max(1, Math.floor(loFreq / freqRes));
    const hiBin = Math.min(half - 1, Math.ceil(hiFreq / freqRes));

    // Average magnitude across the window
    let sum = 0, count = 0;
    for (let b = loBin; b <= hiBin; b++) {
      sum += avgMag[b];
      count++;
    }
    const avgVal = count > 0 ? sum / count : 1e-20;
    const db = 20 * Math.log10(avgVal + 1e-20);
    spectrumPoints.push({ freq: centerFreq, db: Math.max(-100, db) });
  }

  // Side spectrum points
  const spectrumPointsS = [];
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const centerFreq = fMin * Math.pow(fMax / fMin, t);
    const loFreq = centerFreq * Math.pow(2, -smoothingOctaves / 2);
    const hiFreq = centerFreq * Math.pow(2, smoothingOctaves / 2);
    const loBin = Math.max(1, Math.floor(loFreq / freqRes));
    const hiBin = Math.min(half - 1, Math.ceil(hiFreq / freqRes));
    let sum = 0, count = 0;
    for (let b = loBin; b <= hiBin; b++) { sum += avgMagS[b]; count++; }
    const avgVal = count > 0 ? sum / count : 1e-20;
    spectrumPointsS.push({ freq: centerFreq, db: Math.max(-100, 20 * Math.log10(avgVal + 1e-20)) });
  }

  return { bandDistribution, spectrumPoints, spectrumPointsS, spectralWaveform };
}

/* ════════════════════════════════════════════════════
   DSP: Multiband Stereo (7-band FFT, grouped to 3-band)
   ════════════════════════════════════════════════════ */

function computeStereo(buffer) {
  if (buffer.numberOfChannels < 2) return { bands7: BANDS_7.map(() => ({ width: 0, corr: 1 })), bands3: BANDS_3.map(() => ({ width: 0, corr: 1 })) };

  const sr = buffer.sampleRate, len = buffer.length;
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const N = 8192, half = N / 2, freqRes = sr / N;

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));

  const accum = BANDS_7.map(() => ({ sLL: 0, sRR: 0, sLR: 0, sM: 0, sS: 0 }));
  const numH = Math.floor((len - N) / (N / 2));
  const maxH = Math.min(numH, 24);
  const hStep = Math.max(1, Math.floor(numH / maxH));

  for (let h = 0; h < numH; h += hStep) {
    const off = h * (N / 2);
    if (off + N > len) break;
    const reL = new Float64Array(N), imL = new Float64Array(N);
    const reR = new Float64Array(N), imR = new Float64Array(N);
    for (let i = 0; i < N; i++) { reL[i] = L[off+i] * win[i]; reR[i] = R[off+i] * win[i]; }
    fft(reL, imL); fft(reR, imR);

    for (let b = 0; b < BANDS_7.length; b++) {
      const lo = Math.max(1, Math.floor(BANDS_7[b].min / freqRes));
      const hi = Math.min(half - 1, Math.ceil(BANDS_7[b].max / freqRes));
      const acc = accum[b];
      for (let k = lo; k <= hi; k++) {
        acc.sLL += reL[k]*reL[k] + imL[k]*imL[k];
        acc.sRR += reR[k]*reR[k] + imR[k]*imR[k];
        acc.sLR += reL[k]*reR[k] + imL[k]*imR[k];
        const mR = (reL[k]+reR[k])/2, mI = (imL[k]+imR[k])/2;
        const sR = (reL[k]-reR[k])/2, sI = (imL[k]-imR[k])/2;
        acc.sM += mR*mR + mI*mI;
        acc.sS += sR*sR + sI*sI;
      }
    }
  }

  const bands7 = accum.map(a => ({
    width: a.sM + a.sS > 0 ? +((a.sS / (a.sM + a.sS)) * 100).toFixed(1) : 0,
    corr: +(a.sLR / (Math.sqrt(a.sLL * a.sRR) + 1e-20)).toFixed(3),
  }));

  // Group into 3-band
  const bands3 = BANDS_3.map(b3 => {
    let sM = 0, sS = 0, sLR = 0, sLL = 0, sRR = 0;
    for (const idx of b3.bandIndices) {
      const a = accum[idx];
      sM += a.sM; sS += a.sS; sLR += a.sLR; sLL += a.sLL; sRR += a.sRR;
    }
    return {
      width: sM + sS > 0 ? +((sS / (sM + sS)) * 100).toFixed(1) : 0,
      corr: +(sLR / (Math.sqrt(sLL * sRR) + 1e-20)).toFixed(3),
    };
  });

  return { bands7, bands3 };
}

/* ════════════════════════════════════════════════════
   DSP: Vectorscope
   ════════════════════════════════════════════════════ */

function computeVectorscope(buffer, numPoints = 5000) {
  if (buffer.numberOfChannels < 2) return [];
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const step = Math.max(1, Math.floor(buffer.length / numPoints));
  const points = [];
  for (let i = 0; i < buffer.length; i += step) {
    points.push({ x: (L[i] - R[i]) * 0.707, y: (L[i] + R[i]) * 0.707 });
  }
  return points;
}

/* ════════════════════════════════════════════════════
   Phase 4: BPM Detection (onset flux + autocorrelation)
   ════════════════════════════════════════════════════ */

function computeBPM(buffer) {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const len = buffer.length;

  // Smaller hop for better lag resolution
  const hop = 256;
  const frameN = 1024;
  const win = new Float32Array(frameN);
  for (let i = 0; i < frameN; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameN - 1)));
  const freqRes = sr / frameN;
  // Sub-bass + bass: strong kick/bass transients drive BPM
  const binLo = Math.max(1, Math.floor(20 / freqRes));
  const binHi = Math.min(frameN / 2 - 1, Math.ceil(300 / freqRes));

  const numFrames = Math.floor((len - frameN) / hop);
  const energy = new Float32Array(numFrames);
  const re = new Float64Array(frameN), im = new Float64Array(frameN);

  for (let h = 0; h < numFrames; h++) {
    const off = h * hop;
    for (let i = 0; i < frameN; i++) {
      re[i] = ((L[off + i] + R[off + i]) / 2) * win[i];
      im[i] = 0;
    }
    fft(re, im);
    let e = 0;
    for (let b = binLo; b <= binHi; b++) e += re[b] * re[b] + im[b] * im[b];
    energy[h] = e;
  }

  // Onset strength: positive energy flux, normalized
  const onset = new Float32Array(numFrames);
  for (let h = 1; h < numFrames; h++) onset[h] = Math.max(0, energy[h] - energy[h - 1]);
  const maxO = Math.max(...onset, 1e-10);
  for (let h = 0; h < numFrames; h++) onset[h] /= maxO;

  // Autocorrelation — BPM range 50–220
  const fps = sr / hop;
  const lagMin = Math.floor(fps * 60 / 220);
  const lagMax = Math.ceil(fps * 60 / 50);
  const acLen = Math.min(numFrames, lagMax * 2);
  const ac = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    for (let h = 0; h + lag < acLen; h++) sum += onset[h] * onset[h + lag];
    ac[lag] = sum / (acLen - lag); // normalize by window length
  }

  // Enhanced scoring: each lag accumulates AC at its integer multiples (2×, 3×, 4× = bar level)
  // A true beat period has strong AC at ALL multiples; subdivisions do not
  const score = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = ac[lag];
    if (lag * 2 <= lagMax) s += 0.5  * ac[lag * 2];
    if (lag * 3 <= lagMax) s += 0.33 * ac[lag * 3];
    if (lag * 4 <= lagMax) s += 0.25 * ac[lag * 4];
    score[lag] = s;
  }

  let bestLag = lagMin, bestScore = -1;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    if (score[lag] > bestScore) { bestScore = score[lag]; bestLag = lag; }
  }

  // Prefer half-tempo (2× lag) if its score is within 15% — avoids doubling to sub-beats
  const doubleLag = bestLag * 2;
  if (doubleLag <= lagMax && score[doubleLag] > bestScore * 0.85) bestLag = doubleLag;

  const bpm = fps * 60 / bestLag;
  return Math.round(bpm * 2) / 2;
}

/* ════════════════════════════════════════════════════
   Phase 4: Key Detection (chromagram + Krumhansl-Kessler)
   ════════════════════════════════════════════════════ */

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
// Krumhansl-Kessler tonal hierarchy profiles
const KK_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KK_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

function pearsonCorr(a, b) {
  const n = a.length;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const mA = sumA / n, mB = sumB / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const ea = a[i] - mA, eb = b[i] - mB;
    num += ea * eb; da += ea * ea; db += eb * eb;
  }
  return (da * db) > 0 ? num / Math.sqrt(da * db) : 0;
}

function computeKey(buffer) {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const len = buffer.length;

  const N = 8192, hop = N / 2;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
  const freqRes = sr / N;

  // Accumulate chroma over multiple frames
  const chroma = new Float64Array(12);
  const numHops = Math.floor((len - N) / hop);
  const maxFrames = Math.min(numHops, 64);
  const frameStep = Math.max(1, Math.floor(numHops / maxFrames));
  const re = new Float64Array(N), im = new Float64Array(N);

  // Only consider harmonically relevant range: C2 (65Hz) to C7 (2093Hz)
  const fLo = 65, fHi = 2093;
  const binLo = Math.max(1, Math.floor(fLo / freqRes));
  const binHi = Math.min(N / 2 - 1, Math.ceil(fHi / freqRes));

  for (let h = 0; h < numHops; h += frameStep) {
    const off = h * hop;
    if (off + N > len) break;
    for (let i = 0; i < N; i++) {
      re[i] = ((L[off + i] + R[off + i]) / 2) * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = binLo; b <= binHi; b++) {
      const freq = b * freqRes;
      const midi = 12 * Math.log2(freq / 440) + 69; // MIDI note number
      const pc = ((Math.round(midi) % 12) + 12) % 12; // pitch class 0=C
      chroma[pc] += Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    }
  }

  // Correlate against all 24 KK profiles (12 major + 12 minor)
  let bestCorr = -Infinity, bestKey = 0, bestMode = "major";
  for (let root = 0; root < 12; root++) {
    // Rotate profiles to match root
    const majProfile = Array.from({ length: 12 }, (_, i) => KK_MAJOR[(i - root + 12) % 12]);
    const minProfile = Array.from({ length: 12 }, (_, i) => KK_MINOR[(i - root + 12) % 12]);
    const chromaArr = Array.from(chroma);
    const cMaj = pearsonCorr(chromaArr, majProfile);
    const cMin = pearsonCorr(chromaArr, minProfile);
    if (cMaj > bestCorr) { bestCorr = cMaj; bestKey = root; bestMode = "major"; }
    if (cMin > bestCorr) { bestCorr = cMin; bestKey = root; bestMode = "minor"; }
  }

  const keyName = NOTE_NAMES[bestKey] + (bestMode === "minor" ? "m" : "");

  // Build chroma profile for visualization (normalized)
  const chromaMax = Math.max(...chroma, 1e-10);
  const chromaNorm = Array.from(chroma).map(v => v / chromaMax);

  return { key: keyName, root: bestKey, mode: bestMode, confidence: +bestCorr.toFixed(3), chroma: chromaNorm };
}

/* ════════════════════════════════════════════════════
   ANALYSIS: Full pipeline
   ════════════════════════════════════════════════════ */

function analyze(buffer, prefs) {
  const sr = buffer.sampleRate, nCh = buffer.numberOfChannels, len = buffer.length;
  const L = buffer.getChannelData(0), R = nCh > 1 ? buffer.getChannelData(1) : L;

  // Peak
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const aL = Math.abs(L[i]), aR = Math.abs(R[i]);
    if (aL > peak) peak = aL;
    if (aR > peak) peak = aR;
  }
  const samplePeak = +(20 * Math.log10(peak + 1e-20)).toFixed(1);
  const truePeak = computeTruePeak(buffer);
  const lufsData = computeLUFS(buffer);

  // RMS
  let sumSq = 0;
  for (let i = 0; i < len; i++) { const m = (L[i] + R[i]) / 2; sumSq += m * m; }
  const rmsDb = +(20 * Math.log10(Math.sqrt(sumSq / len) + 1e-20)).toFixed(1);

  // Overall stereo
  let sLR = 0, sLL = 0, sRR = 0;
  for (let i = 0; i < len; i++) { sLR += L[i]*R[i]; sLL += L[i]*L[i]; sRR += R[i]*R[i]; }
  const correlation = +(sLR / (Math.sqrt(sLL * sRR) + 1e-20)).toFixed(3);
  const stereoWidth = +(((1 - correlation) / 2) * 100).toFixed(1);

  // Clipping
  let clipSamples = 0;
  for (let i = 0; i < len; i++) {
    if (Math.abs(L[i]) >= 0.9999) clipSamples++;
    if (nCh > 1 && Math.abs(R[i]) >= 0.9999) clipSamples++;
  }

  // Spectrum + spectral waveform
  const specData = computeSpectrum(buffer);
  const stereoData = computeStereo(buffer);
  const vectorscope = computeVectorscope(buffer);
  // Phase 4: BPM + Key
  const bpm = computeBPM(buffer);
  const keyData = computeKey(buffer);

  // Dynamic range
  const blockSize = Math.floor(sr * 0.4), blockStep = Math.floor(sr * 0.1);
  const blockRms = [];
  for (let i = 0; i + blockSize <= len; i += blockStep) {
    let s = 0;
    for (let j = 0; j < blockSize; j++) { const m = (L[i+j] + R[i+j]) / 2; s += m * m; }
    blockRms.push(20 * Math.log10(Math.sqrt(s / blockSize) + 1e-20));
  }
  blockRms.sort((a, b) => a - b);
  const gated = blockRms.filter(v => v > -70);
  const dynamicRange = gated.length > 2
    ? +(gated[Math.floor(gated.length * 0.95)] - gated[Math.floor(gated.length * 0.1)]).toFixed(1) : 0;

  return {
    rmsDb, samplePeak, truePeak,
    lufs: lufsData.integrated, lufsShortTerm: lufsData.shortTerm, lra: lufsData.lra,
    crestFactor: +(samplePeak - rmsDb).toFixed(1),
    stereoWidth, correlation,
    bandDistribution: specData.bandDistribution,
    spectrumPoints: specData.spectrumPoints,
    spectrumPointsS: specData.spectrumPointsS,
    spectralWaveform: specData.spectralWaveform,
    stereoBands7: stereoData.bands7,
    stereoBands3: stereoData.bands3,
    vectorscope,
    dynamicRange,
    clippingMs: +((clipSamples / sr) * 1000).toFixed(1),
    duration: +(len / sr).toFixed(1),
    sampleRate: sr, numChannels: nCh,
    bpm,
    key: keyData.key, keyRoot: keyData.root, keyMode: keyData.mode,
    keyConfidence: keyData.confidence, chroma: keyData.chroma,
  };
}

/* ════════════════════════════════════════════════════
   FEEDBACK ENGINE (EDM + genre-aware)
   ════════════════════════════════════════════════════ */

function generateFeedback(analysis, prefs) {
  const fb = [];
  const P = (type, category, message, tip) => fb.push({ type, category, message, tip });
  const genre = prefs.genre;
  const target = GENRE_TARGETS[genre];

  // True Peak
  if (analysis.truePeak > 0) P("error", "True Peak", `+${analysis.truePeak} dBTP — intersample clipping.`, "Set limiter ceiling to -1.0 dBTP.");
  else if (analysis.truePeak > prefs.truePeakCeiling) P("warning", "True Peak", `${analysis.truePeak} dBTP — above ${prefs.truePeakCeiling} target.`, "Lower limiter ceiling.");
  else P("good", "True Peak", `${analysis.truePeak} dBTP — safe headroom.`);

  // LUFS
  const lufsTarget = target ? target.lufs : prefs.lufsTarget;
  const lufsDelta = analysis.lufs - lufsTarget;
  if (analysis.lufs > -6) P("error", "Loudness", `INT ${analysis.lufs} LUFS — extremely loud.`, "Streaming normalization will heavily penalize this.");
  else if (lufsDelta > 3) P("warning", "Loudness", `INT ${analysis.lufs} LUFS — ${Math.abs(lufsDelta).toFixed(1)}dB above ${genre} target.`, `${genre} typical: ${lufsTarget} LUFS.`);
  else if (lufsDelta < -4) P("info", "Loudness", `INT ${analysis.lufs} LUFS — ${Math.abs(lufsDelta).toFixed(1)}dB below target.`, "May sound weak vs reference tracks.");
  else P("good", "Loudness", `INT ${analysis.lufs} LUFS — within ${genre} range.`);

  // Dynamics
  if (analysis.lra < 3) P("warning", "Dynamics", `LRA ${analysis.lra} LU — almost no dynamic movement.`, "Drop should hit harder than breakdown. Ease off master compression.");
  else if (analysis.dynamicRange < 4) P("warning", "Dynamics", `DR ${analysis.dynamicRange} dB — over-compressed.`, "Raise limiter threshold.");
  else P("good", "Dynamics", `LRA ${analysis.lra} LU, DR ${analysis.dynamicRange} dB — healthy.`);

  if (analysis.crestFactor < 4) P("warning", "Transients", `Crest ${analysis.crestFactor} dB — transients squashed.`, "Try a clipper before the limiter to shave peaks more transparently.");

  // 3-band stereo
  if (analysis.numChannels > 1 && analysis.stereoBands3[0]) {
    const lowW = analysis.stereoBands3[0].width;
    if (lowW > 10) P("error", "Sub Mono", `Low band width ${lowW}% — should be mono.`, `Collapse everything below ~${prefs.monoCrossover}Hz with M/S EQ.`);
    else P("good", "Sub Mono", `Low band ${lowW}% — properly mono.`);

    const midW = analysis.stereoBands3[1].width;
    if (midW > 45) P("warning", "Mid Stereo", `Mid band width ${midW}% — very wide.`, "May lose focus in clubs. Consider narrowing lead elements.");

    const hiW = analysis.stereoBands3[2].width;
    if (hiW < 5) P("info", "High Stereo", `High band width ${hiW}% — narrow.`, "Highs can usually be wider. Try stereo widening on reverb/delay returns.");
  }

  // Phase
  if (analysis.correlation < 0) P("error", "Phase", `Correlation ${analysis.correlation} — destructive cancellation.`, "Check bass layers for phase issues. Flip polarity on one layer.");
  else if (analysis.correlation < 0.3) P("warning", "Phase", `Correlation ${analysis.correlation} — low.`, "May collapse badly in mono. Test with mono preview.");

  // Spectral balance vs genre target
  if (target) {
    const d = analysis.bandDistribution;
    const t = target.bands;
    for (let i = 0; i < BANDS_7.length; i++) {
      const diff = d[i] - t[i];
      if (Math.abs(diff) > 0.06) {
        const direction = diff > 0 ? "heavy" : "light";
        const pct = Math.round(Math.abs(diff) * 100);
        P(diff > 0 ? "warning" : "info", "Spectrum",
          `${BANDS_7[i].name} (${BANDS_7[i].min}-${BANDS_7[i].max}Hz) is ${pct}% ${direction} vs ${genre}.`,
          diff > 0 ? `Consider cutting in this range.` : `Consider boosting in this range.`);
      }
    }
  }

  if (analysis.clippingMs > 0) P("warning", "Clipping", `${analysis.clippingMs}ms of sample-level clipping.`, "Use a clipper or limiter.");

  return fb;
}

/* ════════════════════════════════════════════════════
   CANVAS DRAWING: Live Spectrum + Waveform (Phase 2)
   ════════════════════════════════════════════════════ */

// DPR-aware canvas setup: sets physical pixel dimensions from CSS layout, applies scale transform.
// Returns { ctx, W, H, PW, PH, dpr } where W/H are logical CSS pixels for drawing.
function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const PW = Math.round(rect.width * dpr);
  const PH = Math.round(rect.height * dpr);
  if (canvas.width !== PW || canvas.height !== PH) {
    canvas.width = PW;
    canvas.height = PH;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: rect.width, H: rect.height, PW, PH, dpr };
}

// Persistent spectrograph scroll buffer (shared across frames)
let _heatmapBuf = null;
let _sgW = 0, _sgH = 0; // spectrograph buffer physical dimensions

function _buildSpecPoints(data, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil) {
  const dataLen = data.length;
  const rawDb = new Float64Array(numPts);
  const rawFreq = new Float64Array(numPts);
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const freq = fMin * Math.pow(fMax / fMin, t);
    rawFreq[i] = freq;
    const smoothOct = 1 / 6;
    const loFreq = freq * Math.pow(2, -smoothOct / 2);
    const hiFreq = freq * Math.pow(2, smoothOct / 2);
    const b0 = Math.max(0, Math.floor(loFreq / nyquist * dataLen));
    const b1 = Math.min(dataLen - 1, Math.ceil(hiFreq / nyquist * dataLen));
    let sum = 0, count = 0;
    for (let b = b0; b <= b1; b++) { sum += data[b]; count++; }
    let db = count > 0 ? sum / count : dbFloor;
    db += Math.log2(Math.max(freq, 1) / 1000) * slope;
    rawDb[i] = Math.max(dbFloor, Math.min(dbCeil, db));
  }
  return { rawDb, rawFreq };
}

function drawLiveSpec(canvas, analyser, slope, mode, filterBank, msMode) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H, PW, PH, dpr } = setup;

  const fMin = 20, fMax = 20000;
  const dbFloor = -80, dbCeil = -10;
  const freqGrid = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const isSpectrograph = mode === "spectrograph";

  // ── Background (always dark) ──
  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, W, H);

  // Grid drawn in line mode; spectrograph overlays its own grid after putImageData
  if (!isSpectrograph) {
    for (const f of freqGrid) {
      const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
      ctx.strokeStyle = "#151528"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let db = Math.ceil(dbFloor / 10) * 10; db <= dbCeil; db += 10) {
      const y = H - ((db - dbFloor) / (dbCeil - dbFloor)) * H;
      ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.font = "6px 'JetBrains Mono', monospace"; ctx.fillStyle = "#2a2a44"; ctx.textAlign = "right";
      ctx.fillText(`${db}`, W - 2, y - 2);
    }
  }

  const hasMS = msMode && filterBank?.lAnalyser;
  if (!analyser && !hasMS) return;

  // ── Build spectrum data ──
  const numPts = 400;
  let rawDb, rawFreq, rawDbS, nyquist;

  if (hasMS) {
    nyquist = filterBank.lAnalyser.context.sampleRate / 2;
    const lLen = filterBank.lAnalyser.frequencyBinCount;
    const lFreq = new Float32Array(lLen), rFreq = new Float32Array(lLen);
    filterBank.lAnalyser.getFloatFrequencyData(lFreq);
    filterBank.rAnalyser.getFloatFrequencyData(rFreq);
    const mData = new Float32Array(lLen), sData = new Float32Array(lLen);
    for (let i = 0; i < lLen; i++) {
      const lL = Math.pow(10, lFreq[i] / 20), rL = Math.pow(10, rFreq[i] / 20);
      mData[i] = 20 * Math.log10((lL + rL) / 2 + 1e-10);
      sData[i] = 20 * Math.log10(Math.abs(rL - lL) / 2 + 1e-10);
    }
    ({ rawDb, rawFreq } = _buildSpecPoints(mData, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
    ({ rawDb: rawDbS } = _buildSpecPoints(sData, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
  } else if (analyser) {
    nyquist = analyser.context.sampleRate / 2;
    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);
    ({ rawDb, rawFreq } = _buildSpecPoints(data, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
  } else return;

  // ── Spectrograph: scrolling spectrogram (physical pixels) ──
  if (isSpectrograph) {
    // Reset buffer if canvas was resized
    if (!_heatmapBuf || _sgW !== PW || _sgH !== PH) {
      _heatmapBuf = new ImageData(PW, PH);
      _sgW = PW; _sgH = PH;
      for (let i = 3; i < _heatmapBuf.data.length; i += 4) _heatmapBuf.data[i] = 255;
    }
    const imgData = _heatmapBuf;
    const scrollPx = Math.max(1, Math.round(dpr)); // 1 logical px per frame
    const stride = PW * 4;
    // Scroll left
    for (let y = 0; y < PH; y++) {
      const rowOff = y * stride;
      imgData.data.copyWithin(rowOff, rowOff + scrollPx * 4, rowOff + stride);
    }
    // Paint new column(s) at right edge
    for (let s = 0; s < scrollPx; s++) {
      const colX = PW - scrollPx + s;
      for (let py = 0; py < PH; py++) {
        const freqIdx = Math.floor((1 - py / PH) * (numPts - 1));
        const db = rawDb[freqIdx];
        const norm = Math.max(0, Math.min(1, (db - dbFloor) / (dbCeil - dbFloor)));
        let r, g, b;
        if (norm < 0.25) { r = 0; g = 0; b = Math.round(norm * 4 * 180); }
        else if (norm < 0.5) { const t = (norm - 0.25) * 4; r = 0; g = Math.round(t * 220); b = 180; }
        else if (norm < 0.75) { const t = (norm - 0.5) * 4; r = Math.round(t * 255); g = 220; b = Math.round(180 * (1 - t)); }
        else { const t = (norm - 0.75) * 4; r = 255; g = Math.round(220 + t * 35); b = Math.round(t * 255); }
        const off = (py * PW + colX) * 4;
        imgData.data[off] = r; imgData.data[off+1] = g; imgData.data[off+2] = b; imgData.data[off+3] = 255;
      }
    }
    // putImageData bypasses the DPR transform — reset to identity first
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(imgData, 0, 0);
    // Re-apply DPR transform for overlay drawing
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Translucent grid overlay
    ctx.globalAlpha = 0.25;
    for (const f of freqGrid) {
      const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  // ── Line curve(s) — drawn in both modes ──
  const pts = [];
  for (let i = 0; i < numPts; i++) {
    const x = (i / (numPts - 1)) * W;
    const y = H - ((rawDb[i] - dbFloor) / (dbCeil - dbFloor)) * H;
    pts.push([x, Math.max(0, Math.min(H, y))]);
  }
  if (pts.length < 2) return;

  const drawCurve = (ptArr, strokeColor, lw, glowColor, glowW) => {
    const path = () => {
      ctx.beginPath(); ctx.moveTo(ptArr[0][0], ptArr[0][1]);
      for (let i = 1; i < ptArr.length - 1; i++) {
        const cx = (ptArr[i][0] + ptArr[i+1][0]) / 2, cy = (ptArr[i][1] + ptArr[i+1][1]) / 2;
        ctx.quadraticCurveTo(ptArr[i][0], ptArr[i][1], cx, cy);
      }
      ctx.lineTo(ptArr[ptArr.length-1][0], ptArr[ptArr.length-1][1]);
    };
    if (glowColor) { path(); ctx.strokeStyle = glowColor; ctx.lineWidth = glowW; ctx.stroke(); }
    path(); ctx.strokeStyle = strokeColor; ctx.lineWidth = lw; ctx.stroke();
  };

  if (hasMS) {
    const ptsS = Array.from({ length: numPts }, (_, i) => [
      (i / (numPts - 1)) * W,
      Math.max(0, Math.min(H, H - ((rawDbS[i] - dbFloor) / (dbCeil - dbFloor)) * H)),
    ]);
    if (!isSpectrograph) {
      // Fills only in line mode (would obscure spectrograph)
      const gradM = ctx.createLinearGradient(0, 0, 0, H);
      gradM.addColorStop(0, "rgba(51,170,255,0.2)"); gradM.addColorStop(1, "rgba(51,170,255,0.01)");
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = gradM; ctx.fill();
      const gradS = ctx.createLinearGradient(0, 0, 0, H);
      gradS.addColorStop(0, "rgba(255,136,51,0.15)"); gradS.addColorStop(1, "rgba(255,136,51,0.01)");
      ctx.beginPath(); ctx.moveTo(ptsS[0][0], ptsS[0][1]);
      ptsS.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = gradS; ctx.fill();
    }
    drawCurve(pts,  "#55ccff", 1.3, "rgba(51,170,255,0.3)", 3);
    drawCurve(ptsS, "#ff8833", 1.3, "rgba(255,136,51,0.3)", 3);
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillStyle = isSpectrograph ? "rgba(85,204,255,0.8)" : "#55ccff"; ctx.fillText("MID", 6, 12);
    ctx.fillStyle = isSpectrograph ? "rgba(255,136,51,0.8)" : "#ff8833"; ctx.fillText("SIDE", 6, 22);
  } else {
    if (!isSpectrograph) {
      const bandRanges = [[20, 200, "#ff5544"], [200, 4000, "#44cc66"], [4000, 20000, "#4488ff"]];
      for (const [lo, hi, color] of bandRanges) {
        const i0 = pts.findIndex((_, i) => rawFreq[i] >= lo);
        const i1 = pts.findIndex((_, i) => rawFreq[i] >= hi);
        if (i0 < 0 || i1 < 0 || i0 >= i1) continue;
        ctx.beginPath(); ctx.moveTo(pts[i0][0], pts[i0][1]);
        for (let i = i0+1; i <= i1 && i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i1][0], H); ctx.lineTo(pts[i0][0], H); ctx.closePath();
        ctx.fillStyle = color + "18"; ctx.fill();
      }
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "rgba(51,170,255,0.4)");
      grad.addColorStop(0.5, "rgba(51,170,255,0.12)");
      grad.addColorStop(1, "rgba(51,170,255,0.02)");
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }
    drawCurve(pts, isSpectrograph ? "#55ccffcc" : "#55ccff", 1.3,
      isSpectrograph ? "rgba(51,170,255,0.2)" : "rgba(51,170,255,0.3)", 3);
  }

  // Freq labels
  ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  for (const f of [50, 200, 1000, 5000, 10000]) {
    const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
    ctx.fillStyle = isSpectrograph ? "rgba(255,255,255,0.35)" : "#3a3a55";
    ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x, H - 3);
  }
}

function drawWaveCanvas(canvas, waveData, prefs, duration, bpm, zoom = 1, scrollPct = 0) {
  if (!canvas || !waveData?.length) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  const isSpectral = prefs.waveMode === "spectral";
  const toggles = prefs.bandToggles;

  ctx.clearRect(0, 0, W, H);

  // Zoom/scroll: which slice of waveData frames is visible
  const visibleFrac = 1 / zoom;
  // scrollPct 0 = start, 1 = full scroll to right edge
  const maxScrollPct = 1 - visibleFrac;
  const startFrac = Math.min(scrollPct, maxScrollPct);
  const endFrac = startFrac + visibleFrac;
  const iStart = Math.floor(startFrac * waveData.length);
  const iEnd = Math.min(Math.ceil(endFrac * waveData.length), waveData.length);
  const visibleCount = iEnd - iStart;

  // Clip indicator dashes
  ctx.strokeStyle = "#ff336615"; ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(W, 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
  ctx.setLineDash([]);

  // Center line
  ctx.strokeStyle = "#111120"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  if (isSpectral) {
    const bw = Math.max(0.8, W / visibleCount);
    for (let i = iStart; i < iEnd; i++) {
      const frame = waveData[i];
      const x = ((i - iStart) / visibleCount) * W;
      const amplitude = frame.rms * H / 2;
      if (amplitude < 0.3) continue;

      let low = toggles[0] ? frame.low : 0;
      let mid = toggles[1] ? frame.mid : 0;
      let high = toggles[2] ? frame.high : 0;
      const sum = low + mid + high;
      if (sum < 0.001) continue;
      low /= sum; mid /= sum; high /= sum;

      const r = Math.round(low * 255 + mid * 60 + high * 70);
      const g = Math.round(low * 80 + mid * 210 + high * 130);
      const b = Math.round(low * 60 + mid * 100 + high * 255);
      const peakH = Math.max(frame.mx, -frame.mn) * H / 2;

      ctx.lineWidth = bw;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
      ctx.beginPath(); ctx.moveTo(x, H / 2 - peakH); ctx.lineTo(x, H / 2 + peakH); ctx.stroke();
      ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.beginPath(); ctx.moveTo(x, H / 2 - amplitude); ctx.lineTo(x, H / 2 + amplitude); ctx.stroke();
    }
  } else {
    const bw = Math.max(0.65, W / visibleCount);
    for (let i = iStart; i < iEnd; i++) {
      const frame = waveData[i];
      const x = ((i - iStart) / visibleCount) * W;
      ctx.lineWidth = bw;
      ctx.strokeStyle = "rgba(102,68,255,0.11)";
      ctx.beginPath(); ctx.moveTo(x, H / 2 - frame.mx * H / 2); ctx.lineTo(x, H / 2 - frame.mn * H / 2); ctx.stroke();
      ctx.strokeStyle = "rgba(102,68,255,0.5)";
      ctx.beginPath(); ctx.moveTo(x, H / 2 - frame.rms * H / 2); ctx.lineTo(x, H / 2 + frame.rms * H / 2); ctx.stroke();
    }
  }

  // Beat grid: thin tick marks at BPM intervals
  if (bpm > 0 && duration > 0) {
    const beatInterval = 60 / bpm;
    const barInterval = beatInterval * 4;
    const visibleStart = startFrac * duration;
    const visibleEnd = endFrac * duration;
    ctx.lineWidth = 0.5;
    for (let t = 0; t < duration; t += beatInterval) {
      if (t < visibleStart || t > visibleEnd) continue;
      const x = ((t - visibleStart) / (visibleEnd - visibleStart)) * W;
      const isBarLine = Math.abs(t - Math.round(t / barInterval) * barInterval) < beatInterval * 0.1;
      ctx.strokeStyle = isBarLine ? "rgba(255,136,51,0.25)" : "rgba(255,136,51,0.1)";
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  // Zoom position indicator (mini map strip) — visible only when zoomed
  if (zoom > 1) {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, H - 4, W, 4);
    const thumbW = W * visibleFrac;
    const thumbX = startFrac * W;
    ctx.fillStyle = "rgba(102,68,255,0.35)";
    ctx.fillRect(thumbX, H - 4, thumbW, 4);
  }
}

function drawOverlay(canvas, position, duration, zoom = 1, scrollPct = 0) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.clearRect(0, 0, W, H);
  if (position <= 0 || duration <= 0) return;

  const visibleFrac = 1 / zoom;
  const maxScrollPct = 1 - visibleFrac;
  const startFrac = Math.min(scrollPct, maxScrollPct);
  const endFrac = startFrac + visibleFrac;
  const posFrac = position / duration;

  // Playhead only visible if within current view
  if (posFrac < startFrac || posFrac > endFrac) return;
  const px = ((posFrac - startFrac) / visibleFrac) * W;

  ctx.fillStyle = "rgba(102,68,255,0.04)";
  ctx.fillRect(0, 0, Math.max(0, px), H);

  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.arc(px, H / 2, 3, 0, Math.PI * 2); ctx.fill();
}

/* ════════════════════════════════════════════════════
   Phase 3: 3-Band Stereo Phase Meter
   ════════════════════════════════════════════════════ */

function drawPhaseMeter(canvas, filterBank) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.fillStyle = "#080812"; ctx.fillRect(0, 0, W, H);

  const bandNames = ["LOW", "MID", "HIGH"];
  const bandColors = ["#ff5544", "#44cc66", "#4488ff"];
  const rowH = Math.floor(H / 3);

  if (!filterBank?.analysers?.length) {
    // No data — draw empty meter
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    for (let i = 0; i < 3; i++) {
      const y = i * rowH + rowH / 2;
      ctx.fillStyle = "#2a2a44"; ctx.fillText(bandNames[i], 4, y + 3);
      ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(W - 30, y); ctx.stroke();
      // Center tick
      const cx = 35 + (W - 65) / 2;
      ctx.strokeStyle = "#2a2a44"; ctx.beginPath(); ctx.moveTo(cx, y - 5); ctx.lineTo(cx, y + 5); ctx.stroke();
    }
    return;
  }

  const analysers = filterBank.analysers; // [lowL, midL, highL, lowR, midR, highR]

  for (let band = 0; band < 3; band++) {
    const aL = analysers[band];     // Left channel for this band
    const aR = analysers[band + 3]; // Right channel for this band
    const bufSize = aL.fftSize;
    const dataL = new Float32Array(bufSize);
    const dataR = new Float32Array(bufSize);
    aL.getFloatTimeDomainData(dataL);
    aR.getFloatTimeDomainData(dataR);

    // Pearson correlation coefficient
    let sumL = 0, sumR = 0, sumLR = 0, sumL2 = 0, sumR2 = 0;
    for (let i = 0; i < bufSize; i++) {
      sumL += dataL[i]; sumR += dataR[i];
      sumLR += dataL[i] * dataR[i];
      sumL2 += dataL[i] * dataL[i];
      sumR2 += dataR[i] * dataR[i];
    }
    const n = bufSize;
    const num = n * sumLR - sumL * sumR;
    const den = Math.sqrt((n * sumL2 - sumL * sumL) * (n * sumR2 - sumR * sumR));
    const corr = den > 0 ? num / den : 0;

    // Stereo width: RMS difference / RMS sum
    let diffRms = 0, sumRms = 0;
    for (let i = 0; i < bufSize; i++) {
      const mid = (dataL[i] + dataR[i]) / 2;
      const side = (dataL[i] - dataR[i]) / 2;
      diffRms += side * side;
      sumRms += mid * mid;
    }
    diffRms = Math.sqrt(diffRms / n);
    sumRms = Math.sqrt(sumRms / n);
    const width = sumRms > 0.0001 ? Math.min(1, diffRms / sumRms) : 0;

    const y = band * rowH;
    const barLeft = 35, barRight = W - 30, barW = barRight - barLeft;
    const centerX = barLeft + barW / 2;
    const barY = y + rowH / 2;

    // Background track
    ctx.fillStyle = "#0c0c1a";
    ctx.fillRect(barLeft, barY - 6, barW, 12);

    // Center line
    ctx.strokeStyle = "#2a2a44"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(centerX, barY - 6); ctx.lineTo(centerX, barY + 6); ctx.stroke();

    // L/R labels at ends
    ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    ctx.fillStyle = "#2a2a44";
    ctx.fillText("L", barLeft - 6, barY + 2);
    ctx.fillText("R", barRight + 6, barY + 2);

    // Correlation indicator dot — maps -1..+1 to left..right
    const dotX = centerX + corr * (barW / 2);
    const dotColor = corr < 0 ? "#ff3355" : corr < 0.3 ? "#ff8833" : bandColors[band];
    ctx.fillStyle = dotColor + "33";
    ctx.fillRect(Math.min(centerX, dotX), barY - 5, Math.abs(dotX - centerX), 10);
    ctx.beginPath(); ctx.arc(dotX, barY, 4, 0, Math.PI * 2);
    ctx.fillStyle = dotColor; ctx.fill();

    // Band label
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillStyle = bandColors[band]; ctx.fillText(bandNames[band], 4, barY + 3);

    // Correlation value
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
    ctx.fillStyle = corr < 0 ? "#ff3355" : "#5a5a70";
    ctx.fillText(corr.toFixed(2), W - 2, barY + 3);
  }
}

/* ════════════════════════════════════════════════════
   Phase 3: Live LUFS Meter (momentary + short-term)
   ════════════════════════════════════════════════════ */

// Rolling history for short-term LUFS (3s window at ~60fps = ~180 frames)
let _lufsHistory = [];
let _lufsPeak = -60;
let _lufsPeakDecay = 0;

function drawLufsMeter(canvas, analyser) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.fillStyle = "#080812"; ctx.fillRect(0, 0, W, H);

  const dbMin = -50, dbMax = 0;
  const dbRange = dbMax - dbMin;

  // Grid lines + dB scale labels
  const scaleW = 22;
  for (let db = -50; db <= 0; db += 10) {
    const y = H - ((db - dbMin) / dbRange) * H;
    ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(scaleW, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "right"; ctx.fillStyle = "#3a3a55";
    ctx.fillText(`${db}`, scaleW - 2, y + 3);
  }

  if (!analyser) {
    _lufsHistory = [];
    _lufsPeak = -60;
    return;
  }

  const bufSize = analyser.fftSize;
  const data = new Float32Array(bufSize);
  analyser.getFloatTimeDomainData(data);

  // Compute RMS → dB (approximate LUFS without K-weighting for live display)
  let sumSq = 0;
  for (let i = 0; i < bufSize; i++) sumSq += data[i] * data[i];
  const rms = Math.sqrt(sumSq / bufSize);
  const momentaryDb = rms > 0.00001 ? 20 * Math.log10(rms) : -60;

  // Track rolling history for short-term (3s ≈ 180 frames at 60fps)
  _lufsHistory.push(momentaryDb);
  if (_lufsHistory.length > 180) _lufsHistory.shift();

  // Short-term: average of last 3s in linear domain
  let stSum = 0;
  for (const db of _lufsHistory) stSum += Math.pow(10, db / 10);
  const shortTermDb = 10 * Math.log10(stSum / _lufsHistory.length);

  // Peak tracking with decay
  if (momentaryDb > _lufsPeak) { _lufsPeak = momentaryDb; _lufsPeakDecay = 0; }
  _lufsPeakDecay++;
  if (_lufsPeakDecay > 120) _lufsPeak = Math.max(_lufsPeak - 0.15, momentaryDb); // slow decay after 2s

  // Proportional bar geometry based on canvas width
  const barsW = W - scaleW - 2;
  const barLeft = scaleW, barW = Math.round(barsW * 0.52);
  const stBarLeft = barLeft + barW + 3, stBarW = barsW - barW - 3;

  // Momentary bar
  const mH = Math.max(0, ((momentaryDb - dbMin) / dbRange)) * H;
  const mColor = momentaryDb > -6 ? "#ff3355" : momentaryDb > -14 ? "#ff8833" : "#33aaff";
  const mGrad = ctx.createLinearGradient(0, H - mH, 0, H);
  mGrad.addColorStop(0, mColor);
  mGrad.addColorStop(1, mColor + "44");
  ctx.fillStyle = mGrad;
  ctx.fillRect(barLeft, H - mH, barW, mH);

  // Short-term bar
  const stH = Math.max(0, ((shortTermDb - dbMin) / dbRange)) * H;
  ctx.fillStyle = "#6644ff55";
  ctx.fillRect(stBarLeft, H - stH, stBarW, stH);

  // Peak line
  const peakY = H - ((_lufsPeak - dbMin) / dbRange) * H;
  if (peakY > 0 && peakY < H) {
    ctx.strokeStyle = "#ffffff88"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(barLeft - 2, peakY); ctx.lineTo(stBarLeft + stBarW + 2, peakY); ctx.stroke();
  }

  // Value readouts above each bar
  ctx.font = "8px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = mColor;
  ctx.fillText(momentaryDb > -60 ? momentaryDb.toFixed(1) : "---", barLeft + barW / 2, 10);
  ctx.font = "7px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#8866ff";
  ctx.fillText(shortTermDb > -60 ? shortTermDb.toFixed(1) : "---", stBarLeft + stBarW / 2, 10);

  // Column labels at bottom
  ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#4a4a66";
  ctx.fillText("M", barLeft + barW / 2, H - 2);
  ctx.fillText("ST", stBarLeft + stBarW / 2, H - 2);
}

/* ════════════════════════════════════════════════════
   Phase 3: Live Vectorscope (Canvas Lissajous)
   ════════════════════════════════════════════════════ */

function drawVectorscope(canvas, filterBank) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  const S = Math.min(W, H);
  const c = S / 2, scale = c * 0.82;

  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, S, S);

  // Grid: axes + diagonals + circles
  ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(S, c); ctx.stroke();
  ctx.strokeStyle = "#12122a"; ctx.lineWidth = 0.3;
  ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(S, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S, S); ctx.stroke();
  ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.arc(c, c, scale * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, scale, 0, Math.PI * 2); ctx.stroke();

  // Labels
  ctx.font = `${Math.round(S * 0.07)}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = "#2a2a44";
  ctx.textAlign = "center";
  ctx.fillText("M", c, 9);
  ctx.textAlign = "right";
  ctx.fillText("R", S - 2, c - 2);
  ctx.textAlign = "left";
  ctx.fillText("L", 2, c - 2);

  if (!filterBank?.lAnalyser) return;

  const bufSize = filterBank.lAnalyser.fftSize;
  const lData = new Float32Array(bufSize);
  const rData = new Float32Array(bufSize);
  filterBank.lAnalyser.getFloatTimeDomainData(lData);
  filterBank.rAnalyser.getFloatTimeDomainData(rData);

  const hasMultiband = filterBank.analysers?.length >= 6;
  if (hasMultiband) {
    // Per-band time domain data for multiband coloring
    const bandBufSize = filterBank.analysers[0].fftSize;
    const bandData = Array.from({ length: 6 }, (_, i) => {
      const d = new Float32Array(bandBufSize);
      filterBank.analysers[i].getFloatTimeDomainData(d);
      return d;
    });
    // Stride: wideband fftSize may differ from band fftSize — use min
    const stride = Math.round(bufSize / bandBufSize);
    // Band colors: Low=red, Mid=green, High=blue
    const bandRGB = [[255, 85, 68], [68, 204, 102], [68, 136, 255]];
    // Draw each sample as a colored dot based on dominant band energy
    for (let i = 0; i < bufSize; i++) {
      const m = (lData[i] + rData[i]) * 0.7071;
      const s = (rData[i] - lData[i]) * 0.7071;
      const px = c + s * scale;
      const py = c - m * scale;
      // Look up band energies at corresponding band buffer index
      const bi = Math.min(Math.floor(i / stride), bandBufSize - 1);
      const e = [0, 1, 2].map(b => {
        const lv = bandData[b][bi], rv = bandData[b + 3][bi];
        return lv * lv + rv * rv;
      });
      const eSum = e[0] + e[1] + e[2] + 1e-12;
      const [rw, gw, bw] = e.map(v => v / eSum);
      const r = Math.round(rw * bandRGB[0][0] + gw * bandRGB[1][0] + bw * bandRGB[2][0]);
      const g = Math.round(rw * bandRGB[0][1] + gw * bandRGB[1][1] + bw * bandRGB[2][1]);
      const b = Math.round(rw * bandRGB[0][2] + gw * bandRGB[1][2] + bw * bandRGB[2][2]);
      ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
      ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
    }
  } else {
    // Wideband monochrome fallback
    ctx.beginPath();
    for (let i = 0; i < bufSize; i++) {
      const m = (lData[i] + rData[i]) * 0.7071;
      const s = (rData[i] - lData[i]) * 0.7071;
      const px = c + s * scale;
      const py = c - m * scale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(51,170,255,0.18)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

/* ════════════════════════════════════════════════════
   PLAYBACK with Canvas waveform + Live Spectrum + Filter Bank + Meters
   ════════════════════════════════════════════════════ */

function PlaybackWaveform({ buffer, audioCtx, waveData, duration, prefs, setPrefs, bpm }) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [zoom, setZoom] = useState(1);        // 1x / 2x / 4x / 8x
  const [scrollPct, setScrollPct] = useState(0); // 0..1, fraction of total duration at left edge
  const zoomRef = useRef(1);
  const scrollPctRef = useRef(0);
  const sourceRef = useRef(null);
  const startTimeRef = useRef(0);
  const animRef = useRef(null);
  const positionRef = useRef(0);
  const playingRef = useRef(false);
  // Phase 2: Canvas refs
  const waveCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const liveSpecCanvasRef = useRef(null);
  // Phase 2: Audio analysis refs
  const specAnalyserRef = useRef(null);
  const filterBankRef = useRef(null);
  // Phase 3: Canvas refs for meters
  const phaseCanvasRef = useRef(null);
  const lufsCanvasRef = useRef(null);
  // Phase 3: Live vectorscope canvas
  const vsCanvasRef = useRef(null);
  // Phase 3: Audio graph refs
  const gainRef = useRef(null);
  const monoMergerRef = useRef(null);
  // Keep prefs accessible in RAF without stale closures
  const prefsRef = useRef(prefs);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { scrollPctRef.current = scrollPct; }, [scrollPct]);

  // Phase 3: Update gain value in real-time when volume slider changes
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = prefs.volume ?? 1.0;
  }, [prefs.volume]);

  // Draw static waveform when data or display prefs change
  useEffect(() => {
    drawWaveCanvas(waveCanvasRef.current, waveData, prefs, duration, bpm, zoomRef.current, scrollPctRef.current);
    drawOverlay(overlayCanvasRef.current, positionRef.current, duration, zoomRef.current, scrollPctRef.current);
  }, [waveData, prefs, duration, bpm, zoom, scrollPct]);

  // Init live spec + vectorscope canvases
  useEffect(() => {
    drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs);
    drawVectorscope(vsCanvasRef.current, null);
  }, []);

  // Stop playback on buffer change (tab switch)
  useEffect(() => {
    positionRef.current = 0;
    setPosition(0);
    drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs);
    drawVectorscope(vsCanvasRef.current, null);
  }, [buffer]);

  const killSource = useCallback(() => {
    cancelAnimationFrame(animRef.current); animRef.current = null;
    const src = sourceRef.current;
    if (src) { src.onended = null; try { src.disconnect(); } catch(e) {} try { src.stop(0); } catch(e) {} sourceRef.current = null; }
    // Disconnect filter bank
    if (filterBankRef.current) {
      filterBankRef.current.nodes.forEach(n => { try { n.disconnect(); } catch(e) {} });
      filterBankRef.current = null;
    }
    // Phase 3: Disconnect gain + mono nodes
    if (gainRef.current) { try { gainRef.current.disconnect(); } catch(e) {} gainRef.current = null; }
    if (monoMergerRef.current) { try { monoMergerRef.current.disconnect(); } catch(e) {} monoMergerRef.current = null; }
    specAnalyserRef.current = null;
    playingRef.current = false; setPlaying(false);
    _lufsHistory = []; _lufsPeak = -60;
  }, []);

  // Cleanup on unmount
  useEffect(() => { return () => killSource(); }, [killSource]);

  const playFrom = useCallback((offset) => {
    if (!buffer || !audioCtx) return;
    killSource();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    // ── Phase 3: GainNode for volume control ──
    const gain = audioCtx.createGain();
    gain.gain.value = prefsRef.current.volume ?? 1.0;
    gainRef.current = gain;
    src.connect(gain);

    // ── Phase 3: Mono preview (ChannelMerger) or stereo pass-through ──
    if (prefsRef.current.monoPreview && buffer.numberOfChannels >= 2) {
      const merger = audioCtx.createChannelMerger(1);
      gain.connect(merger, 0, 0);
      merger.connect(audioCtx.destination);
      monoMergerRef.current = merger;
    } else {
      gain.connect(audioCtx.destination);
    }

    // ── Phase 2: Full-spectrum AnalyserNode (parallel tap for live spectrum) ──
    const specAnalyser = audioCtx.createAnalyser();
    specAnalyser.fftSize = 4096; // larger FFT for better bass resolution
    specAnalyser.smoothingTimeConstant = 0.8;
    src.connect(specAnalyser);
    specAnalyserRef.current = specAnalyser;

    // ── Phase 2: 3-band BiquadFilter bank → 6 AnalyserNodes ──
    // Architecture: BufferSource → ChannelSplitter → per-channel LP/BP/HP → AnalyserNodes
    // This is a PARALLEL analysis path — does not affect audio output
    const allNodes = [specAnalyser];
    const splitter = audioCtx.createChannelSplitter(2);
    src.connect(splitter);
    allNodes.push(splitter);

    const bandAnalysers = []; // [lowL, midL, highL, lowR, midR, highR]
    for (let ch = 0; ch < 2; ch++) {
      // Low band: LP 200Hz (Butterworth Q)
      const lowF = audioCtx.createBiquadFilter();
      lowF.type = "lowpass"; lowF.frequency.value = 200; lowF.Q.value = 0.707;
      const lowA = audioCtx.createAnalyser();
      lowA.fftSize = 512; lowA.smoothingTimeConstant = 0.8;
      splitter.connect(lowF, ch); lowF.connect(lowA);
      allNodes.push(lowF, lowA);
      bandAnalysers.push(lowA);

      // Mid band: HP 200Hz → LP 4kHz (two filters in series)
      const midHP = audioCtx.createBiquadFilter();
      midHP.type = "highpass"; midHP.frequency.value = 200; midHP.Q.value = 0.707;
      const midLP = audioCtx.createBiquadFilter();
      midLP.type = "lowpass"; midLP.frequency.value = 4000; midLP.Q.value = 0.707;
      const midA = audioCtx.createAnalyser();
      midA.fftSize = 512; midA.smoothingTimeConstant = 0.8;
      splitter.connect(midHP, ch); midHP.connect(midLP); midLP.connect(midA);
      allNodes.push(midHP, midLP, midA);
      bandAnalysers.push(midA);

      // High band: HP 4kHz
      const highF = audioCtx.createBiquadFilter();
      highF.type = "highpass"; highF.frequency.value = 4000; highF.Q.value = 0.707;
      const highA = audioCtx.createAnalyser();
      highA.fftSize = 512; highA.smoothingTimeConstant = 0.8;
      splitter.connect(highF, ch); highF.connect(highA);
      allNodes.push(highF, highA);
      bandAnalysers.push(highA);
    }
    // Wideband L/R analysers for live vectorscope + M/S spectrum
    const lA = audioCtx.createAnalyser(); lA.fftSize = 4096; lA.smoothingTimeConstant = 0.8;
    const rA = audioCtx.createAnalyser(); rA.fftSize = 4096; rA.smoothingTimeConstant = 0.8;
    splitter.connect(lA, 0); splitter.connect(rA, 1);
    allNodes.push(lA, rA);
    filterBankRef.current = { analysers: bandAnalysers, lAnalyser: lA, rAnalyser: rA, nodes: allNodes };

    sourceRef.current = src; startTimeRef.current = audioCtx.currentTime - offset;
    playingRef.current = true; setPlaying(true);
    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null; playingRef.current = false;
        cancelAnimationFrame(animRef.current);
        setPlaying(false); setPosition(0); positionRef.current = 0;
        drawOverlay(overlayCanvasRef.current, 0, buffer.duration);
      }
    };
    src.start(0, offset);

    const tick = () => {
      if (!playingRef.current || sourceRef.current !== src) return;
      const elapsed = Math.min(audioCtx.currentTime - startTimeRef.current, buffer.duration);
      positionRef.current = elapsed; setPosition(elapsed);
      // Phase 2: update live spectrum + playhead overlay via Canvas
      drawLiveSpec(liveSpecCanvasRef.current, specAnalyserRef.current, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, filterBankRef.current, prefsRef.current.specMs);
      // Auto-scroll: keep playhead in view when zoomed
      if (zoomRef.current > 1) {
        const posFrac = elapsed / buffer.duration;
        const visibleFrac = 1 / zoomRef.current;
        const curScroll = scrollPctRef.current;
        const endFrac = curScroll + visibleFrac;
        if (posFrac > endFrac - visibleFrac * 0.1 || posFrac < curScroll) {
          const newScroll = Math.max(0, Math.min(1 - visibleFrac, posFrac - visibleFrac * 0.1));
          scrollPctRef.current = newScroll;
          setScrollPct(newScroll);
        }
      }
      drawOverlay(overlayCanvasRef.current, elapsed, buffer.duration, zoomRef.current, scrollPctRef.current);
      // Phase 3: update meters
      drawPhaseMeter(phaseCanvasRef.current, filterBankRef.current);
      drawLufsMeter(lufsCanvasRef.current, specAnalyserRef.current);
      drawVectorscope(vsCanvasRef.current, filterBankRef.current);
      if (elapsed < buffer.duration) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [buffer, audioCtx, killSource]);

  const toggle = useCallback(() => {
    if (playingRef.current) killSource(); else playFrom(positionRef.current);
  }, [killSource, playFrom]);

  const seek = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // Map click position within visible window to absolute time
    const visibleFrac = 1 / zoomRef.current;
    const startFrac = Math.min(scrollPctRef.current, 1 - visibleFrac);
    const newPos = (startFrac + clickPct * visibleFrac) * duration;
    if (playingRef.current) playFrom(newPos);
    else { positionRef.current = newPos; setPosition(newPos); drawOverlay(overlayCanvasRef.current, newPos, duration, zoomRef.current, scrollPctRef.current); }
  }, [duration, playFrom]);

  const handleWheelZoom = useCallback((e) => {
    e.preventDefault();
    const levels = [1, 2, 4, 8];
    setZoom(prev => {
      const idx = levels.indexOf(prev);
      const newZoom = e.deltaY < 0
        ? levels[Math.min(idx + 1, levels.length - 1)]
        : levels[Math.max(idx - 1, 0)];
      zoomRef.current = newZoom;
      // Keep the hovered position as anchor point
      if (newZoom === 1) {
        scrollPctRef.current = 0;
        setScrollPct(0);
      }
      return newZoom;
    });
  }, []);

  const handleScrollDrag = useCallback((e) => {
    if (zoom <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const visibleFrac = 1 / zoom;
    // Click on mini-map strip: position the view so strip thumb center = click
    const newScroll = Math.max(0, Math.min(1 - visibleFrac, pct - visibleFrac / 2));
    scrollPctRef.current = newScroll;
    setScrollPct(newScroll);
  }, [zoom]);

  if (!buffer || !waveData) return null;

  const SPEC_W = 560, W = 760, H = 120, LSH = 90;
  const PHASE_W = 150, LUFS_W = 90;
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const isSpectral = prefs.waveMode === "spectral";
  const toggles = prefs.bandToggles;
  const vol = Math.round((prefs.volume ?? 1) * 100);

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Transport bar: play, time, volume, mono, band toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <button onClick={toggle} style={{
          width: 28, height: 28, borderRadius: "50%",
          background: playing ? "#ff335518" : THEME.accent + "18",
          color: playing ? THEME.error : "#bb99ff",
          border: `1px solid ${playing ? THEME.error + "44" : THEME.accent + "44"}`,
          cursor: "pointer", fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{playing ? "■" : "▶"}</button>
        <span style={{ fontSize: 9, color: THEME.sub, fontFamily: THEME.mono }}>{fmt(position)} / {fmt(duration)}</span>

        {/* Phase 3: Volume slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: 4 }}>
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>VOL</span>
          <input type="range" min={0} max={100} value={vol} onChange={e => {
            setPrefs(p => ({ ...p, volume: +e.target.value / 100 }));
          }} style={{ width: 50, height: 3, accentColor: THEME.accent }} />
          <span style={{ fontSize: 7, color: THEME.sub, fontFamily: THEME.mono, width: 22 }}>{vol}%</span>
        </div>

        {/* Phase 3: Mono preview toggle */}
        <button onClick={() => {
          setPrefs(p => ({ ...p, monoPreview: !p.monoPreview }));
          // Restart playback to rebuild audio graph with mono/stereo
          if (playingRef.current) {
            const pos = positionRef.current;
            setTimeout(() => playFrom(pos), 0);
          }
        }} style={{
          padding: "2px 6px", fontSize: 7, fontFamily: THEME.mono,
          background: prefs.monoPreview ? "#ff885522" : THEME.card,
          color: prefs.monoPreview ? "#ff8855" : THEME.dim,
          border: `1px solid ${prefs.monoPreview ? "#ff885544" : THEME.border}`,
          borderRadius: 3, cursor: "pointer",
        }}>MONO</button>

        {/* Band toggles */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {BANDS_3.map((band, i) => (
            <button key={band.name} onClick={() => {
              setPrefs(p => {
                const next = [...p.bandToggles];
                next[i] = !next[i];
                if (!next.some(Boolean)) return p;
                return { ...p, bandToggles: next };
              });
            }} style={{
              padding: "2px 8px", fontSize: 8, fontFamily: THEME.mono,
              background: toggles[i] ? band.color + "22" : THEME.card,
              color: toggles[i] ? band.color : THEME.dim,
              border: `1px solid ${toggles[i] ? band.color + "44" : THEME.border}`,
              borderRadius: 3, cursor: "pointer",
            }}>{band.name}</button>
          ))}
          <button onClick={() => {
            setPrefs(p => ({ ...p, waveMode: p.waveMode === "spectral" ? "uniform" : "spectral" }));
          }} style={{
            padding: "2px 8px", fontSize: 7, fontFamily: THEME.mono,
            background: isSpectral ? THEME.accent + "18" : THEME.card,
            color: isSpectral ? "#bb99ff" : THEME.dim,
            border: `1px solid ${isSpectral ? THEME.accent + "33" : THEME.border}`,
            borderRadius: 3, cursor: "pointer",
          }}>{isSpectral ? "SPECTRAL" : "UNIFORM"}</button>
        </div>
      </div>

      {/* Live Spectrum + Phase Meter + LUFS Meter (PROJECT.md layout) */}
      <div style={{ display: "flex", gap: 0, borderRadius: "7px 7px 0 0", overflow: "hidden" }}>
        {/* Live Spectrum (left) */}
        <div style={{ flex: 1, background: "#080812" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 0" }}>
            <span style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1.5 }}>
              LIVE SPECTRUM {playing ? <span style={{ color: "#ff3366" }}>●</span> : <span style={{ color: THEME.dim }}>○</span>}
            </span>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {["line", "spectrograph"].map(m => (
                <button key={m} onClick={() => {
                  setPrefs(p => ({ ...p, liveSpecMode: m }));
                  if (m !== prefs.liveSpecMode) { _heatmapBuf = null; }
                }} style={{
                  padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono, textTransform: "uppercase",
                  background: prefs.liveSpecMode === m ? THEME.accent + "18" : "transparent",
                  color: prefs.liveSpecMode === m ? "#bb99ff" : THEME.dim,
                  border: `1px solid ${prefs.liveSpecMode === m ? THEME.accent + "33" : THEME.border}`,
                  borderRadius: 2, cursor: "pointer",
                }}>{m}</button>
              ))}
              <button onClick={() => setPrefs(p => ({ ...p, specMs: !p.specMs }))} style={{
                padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono,
                background: prefs.specMs ? "#ff885518" : "transparent",
                color: prefs.specMs ? "#ff9966" : THEME.dim,
                border: `1px solid ${prefs.specMs ? "#ff885544" : THEME.border}`,
                borderRadius: 2, cursor: "pointer",
              }}>M/S</button>
              <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, marginLeft: 4 }}>
                slope {prefs.specSlope}dB/oct
              </span>
            </div>
          </div>
          <canvas ref={liveSpecCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* 3-Band Phase Meter (center) */}
        <div style={{ width: PHASE_W, background: "#080812", borderLeft: "1px solid #111122" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>PHASE</span>
          </div>
          <canvas ref={phaseCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* Live Vectorscope */}
        <div style={{ width: LSH, background: "#080812", borderLeft: "1px solid #111122" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>VECTOR</span>
          </div>
          <canvas ref={vsCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* LUFS Meter (right) */}
        <div style={{ width: LUFS_W, background: "#080812", borderLeft: "1px solid #111122" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>LUFS</span>
          </div>
          <canvas ref={lufsCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>
      </div>

      {/* Canvas Waveform with playhead overlay */}
      <div style={{ background: "#080812", borderRadius: "0 0 7px 7px", borderTop: "1px solid #111122" }}>
        {/* Zoom controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 6px 0" }}>
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>ZOOM</span>
          {[1, 2, 4, 8].map(z => (
            <button key={z} onClick={() => {
              setZoom(z);
              zoomRef.current = z;
              if (z === 1) { scrollPctRef.current = 0; setScrollPct(0); }
            }} style={{
              padding: "1px 5px", fontSize: 7, fontFamily: THEME.mono,
              background: zoom === z ? THEME.accent + "22" : "transparent",
              color: zoom === z ? "#bb99ff" : THEME.dim,
              border: `1px solid ${zoom === z ? THEME.accent + "44" : THEME.border}`,
              borderRadius: 2, cursor: "pointer",
            }}>{z}×</button>
          ))}
          {zoom > 1 && (
            <input type="range" min={0} max={100} value={Math.round(scrollPct * 100)} onChange={e => {
              const v = +e.target.value / 100;
              scrollPctRef.current = v; setScrollPct(v);
            }} style={{ flex: 1, height: 3, accentColor: THEME.accent, marginLeft: 4 }} />
          )}
        </div>
        <div style={{ position: "relative", padding: "4px 0 0", cursor: "pointer" }}
          onClick={seek}
          onWheel={handleWheelZoom}
        >
          <canvas ref={waveCanvasRef} style={{ display: "block", width: "100%", height: H }} />
          <canvas ref={overlayCanvasRef} style={{
            position: "absolute", top: 4, left: 0, display: "block", width: "100%", height: H, pointerEvents: "none",
          }} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SPECTRUM DISPLAY with slope compensation
   ════════════════════════════════════════════════════ */

function SpectrumDisplay({ points, pointsS, slope, genre }) {
  const [msMode, setMsMode] = useState(false);
  if (!points?.length) return null;
  const W = 760, H = 220;
  const fMin = points[0]?.freq || 20, fMax = points[points.length - 1]?.freq || 20000;
  const genreColor = genre ? (GENRE_COLORS[genre] || "#ffcc44") : "#ffcc44";

  // Apply slope compensation
  const compensated = points.map(p => {
    const octavesFromRef = Math.log2(p.freq / 1000);
    return { freq: p.freq, db: p.db + octavesFromRef * slope };
  });
  const compensatedS = msMode && pointsS ? pointsS.map(p => {
    const octavesFromRef = Math.log2(p.freq / 1000);
    return { freq: p.freq, db: p.db + octavesFromRef * slope };
  }) : null;

  // Auto-range: tighter range centered on data for better visual spread
  let dataMin = Infinity, dataMax = -Infinity;
  for (const p of compensated) {
    if (p.db > dataMax) dataMax = p.db;
    if (p.db < dataMin && p.db > -100) dataMin = p.db;
  }
  // Tighter minimum span (36dB) so curves fill more of the display
  const minSpan = 36;
  if (dataMax - dataMin < minSpan) {
    const center = (dataMax + dataMin) / 2;
    dataMax = center + minSpan / 2;
    dataMin = center - minSpan / 2;
  }
  // Round to nice grid values, pad by 3dB (tighter padding)
  const dbMax = Math.ceil(dataMax / 6) * 6 + 3;
  const dbMin = Math.floor(dataMin / 6) * 6 - 3;
  const dbRange = dbMax - dbMin || 1;

  // Map frequency to x (log scale)
  const fToX = f => (Math.log(f / fMin) / Math.log(fMax / fMin)) * W;
  // Map dB to y
  const dbToY = db => H - ((db - dbMin) / dbRange) * H;

  // Build path — main curve
  const pathD = compensated.map((p, i) => {
    const x = (i / (compensated.length - 1)) * W;
    const y = Math.max(0, Math.min(H, dbToY(p.db)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Build colored fill segments per band
  const bandFills = BANDS_3.map((band, bi) => {
    const pts = compensated.filter(p => p.freq >= band.min && p.freq <= band.max);
    if (pts.length < 2) return null;
    const startIdx = compensated.indexOf(pts[0]);
    const d = pts.map((p, i) => {
      const x = ((startIdx + i) / (compensated.length - 1)) * W;
      const y = Math.max(0, Math.min(H, dbToY(p.db)));
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const xStart = (startIdx / (compensated.length - 1)) * W;
    const xEnd = ((startIdx + pts.length - 1) / (compensated.length - 1)) * W;
    return { d: d + ` L${xEnd.toFixed(1)},${H} L${xStart.toFixed(1)},${H} Z`, color: band.color };
  }).filter(Boolean);

  // Grid lines
  const gridLines = [];
  for (let db = dbMin; db <= dbMax; db += 6) {
    gridLines.push(db);
  }

  const freqLabels = [20, 30, 50, 80, 100, 150, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 20000].filter(f => f >= fMin && f <= fMax);
  // Thin vertical freq grid
  const freqGrid = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(f => f >= fMin && f <= fMax);

  return (
    <div style={{ background: "#080812", borderRadius: 7, padding: "8px 8px 4px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1.5 }}>
          SPECTRUM {genre && <span style={{ color: genreColor, letterSpacing: 0.5 }}>· {genre}</span>}
        </span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {pointsS && (
            <button onClick={() => setMsMode(m => !m)} style={{
              padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono,
              background: msMode ? "#ff883322" : "transparent",
              color: msMode ? "#ff8833" : THEME.dim,
              border: `1px solid ${msMode ? "#ff883344" : THEME.border}`,
              borderRadius: 2, cursor: "pointer",
            }}>M/S</button>
          )}
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>
            1/6 oct · slope {slope}dB/oct · {dbMin}→{dbMax}dB
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W + 30} ${H + 18}`} width="100%" style={{ display: "block" }}>
        <g>
          {/* dB grid — higher contrast */}
          {gridLines.map(db => {
            const y = dbToY(db);
            const isMajor = db % 12 === 0;
            return (
              <g key={db}>
                <line x1="0" y1={y} x2={W} y2={y} stroke={isMajor ? "#222240" : "#141428"} strokeWidth={isMajor ? "1" : ".5"} />
                <text x={W + 3} y={y + 3} fill={isMajor ? "#4a4a65" : "#2a2a44"} fontSize="7" fontFamily={THEME.mono}>{db}</text>
              </g>
            );
          })}
          {/* Freq grid — higher contrast */}
          {freqGrid.map(f => {
            const x = fToX(f);
            const isMajor = [100, 1000, 10000].includes(f);
            return <line key={f} x1={x} y1={0} x2={x} y2={H} stroke={isMajor ? "#1a1a30" : "#111125"} strokeWidth={isMajor ? ".6" : ".4"} />;
          })}
          {/* Band-colored fills */}
          {bandFills.map((bf, i) => (
            <path key={i} d={bf.d} fill={bf.color} opacity=".12" />
          ))}
          {/* Main curve — thicker, with glow */}
          <path d={pathD} fill="none" stroke="#33aaff" strokeWidth="2.2" opacity=".3" />
          <path d={pathD} fill="none" stroke="#55ccff" strokeWidth="1.3" />
          {/* Fill under curve */}
          <path d={pathD + ` L${W},${H} L0,${H} Z`} fill="url(#specGrad)" opacity=".25" />
          {/* M/S: Side curve overlay */}
          {msMode && compensatedS && (() => {
            const pathS = compensatedS.map((p, i) => {
              const x = (i / (compensatedS.length - 1)) * W;
              const y = Math.max(0, Math.min(H, dbToY(p.db)));
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(" ");
            return (
              <g>
                <path d={pathS + ` L${W},${H} L0,${H} Z`} fill="#ff8833" opacity=".1" />
                <path d={pathS} fill="none" stroke="#ff8833" strokeWidth="2" opacity=".3" />
                <path d={pathS} fill="none" stroke="#ffaa55" strokeWidth="1.2" />
              </g>
            );
          })()}
          {/* M/S legend */}
          {msMode && (
            <g>
              <text x="6" y="14" fill="#55ccff" fontSize="8" fontFamily={THEME.mono}>MID</text>
              <text x="36" y="14" fill="#ffaa55" fontSize="8" fontFamily={THEME.mono}>SIDE</text>
            </g>
          )}
          {/* Genre target curve with per-point tolerance band */}
          {genre && GENRE_CURVES[genre] && (() => {
            const curve = GENRE_CURVES[genre];

            // Anchor: align target curve to the analyzed spectrum at 1kHz
            const around1k = compensated.filter(p => p.freq > 800 && p.freq < 1200);
            const anchor = around1k.length > 0
              ? around1k.reduce((s, p) => s + p.db, 0) / around1k.length
              : (dataMax + dataMin) / 2;

            // Build center, upper, lower paths using per-point tolerance
            const centerPts = [], upperPts = [], lowerPts = [];
            for (let i = 0; i < compensated.length; i++) {
              const x = (i / (compensated.length - 1)) * W;
              const { db: targetRel, range: tol } = interpolateTargetCurve(curve.points, compensated[i].freq);
              const targetDb = targetRel + anchor;

              const yC = Math.max(0, Math.min(H, dbToY(targetDb)));
              const yU = Math.max(0, Math.min(H, dbToY(targetDb + tol)));
              const yL = Math.max(0, Math.min(H, dbToY(targetDb - tol)));
              centerPts.push(`${x.toFixed(1)},${yC.toFixed(1)}`);
              upperPts.push(`${x.toFixed(1)},${yU.toFixed(1)}`);
              lowerPts.push(`${x.toFixed(1)},${yL.toFixed(1)}`);
            }

            const centerPath = "M" + centerPts.join(" L");
            const upperPath = "M" + upperPts.join(" L");
            const lowerPath = "M" + lowerPts.join(" L");
            const bandPath = `M${upperPts.join(" L")} L${[...lowerPts].reverse().join(" L")} Z`;

            return (
              <g>
                <path d={bandPath} fill={genreColor} opacity=".12" />
                <path d={upperPath} fill="none" stroke={genreColor} strokeWidth=".5" opacity=".3" strokeDasharray="3,3" />
                <path d={lowerPath} fill="none" stroke={genreColor} strokeWidth=".5" opacity=".3" strokeDasharray="3,3" />
                <path d={centerPath} fill="none" stroke={genreColor} strokeWidth="1.8" opacity=".7" />
                {curve.points.filter((_, i) => i % 4 === 0).map(([f, db], i) => {
                  const x = fToX(f);
                  const y = dbToY(db + anchor);
                  if (x < 0 || x > W || y < 0 || y > H) return null;
                  return <circle key={i} cx={x} cy={y} r="2" fill={genreColor} opacity=".5" />;
                })}
              </g>
            );
          })()}
          {/* Freq labels */}
          {freqLabels.map(f => {
            const x = fToX(f);
            const label = f >= 1000 ? `${f/1000}k` : f;
            const isMain = [100, 1000, 10000].includes(f);
            return <text key={f} x={x} y={H + 12} fill={isMain ? "#3a3a55" : "#222238"} fontSize={isMain ? "8" : "7"} fontFamily={THEME.mono} textAnchor="middle">{label}</text>;
          })}
        </g>
        <defs>
          <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#33aaff" stopOpacity=".4" />
            <stop offset="100%" stopColor="#33aaff" stopOpacity=".02" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   UI COMPONENTS
   ════════════════════════════════════════════════════ */

function Vectorscope({ data, size = 190 }) {
  if (!data.length) return null;
  const c = size / 2, scale = c * 0.85;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ background: "#080812", borderRadius: 7 }}>
      <line x1={c} y1="0" x2={c} y2={size} stroke="#151525" strokeWidth=".5" />
      <line x1="0" y1={c} x2={size} y2={c} stroke="#151525" strokeWidth=".5" />
      <line x1="0" y1={size} x2={size} y2="0" stroke="#12122a" strokeWidth=".3" />
      <circle cx={c} cy={c} r={scale * 0.5} fill="none" stroke="#151525" strokeWidth=".5" />
      <circle cx={c} cy={c} r={scale} fill="none" stroke="#151525" strokeWidth=".5" />
      <text x={c+2} y="9" fill={THEME.dim} fontSize="6" fontFamily={THEME.mono}>M</text>
      <text x={size-8} y={c-2} fill={THEME.dim} fontSize="6" fontFamily={THEME.mono}>R</text>
      <text x="2" y={c-2} fill={THEME.dim} fontSize="6" fontFamily={THEME.mono}>L</text>
      {data.map((p, i) => {
        const px = c + p.x * scale, py = c - p.y * scale;
        return (px >= 0 && px <= size && py >= 0 && py <= size)
          ? <circle key={i} cx={px} cy={py} r=".6" fill="#33aaff" opacity=".1" /> : null;
      })}
    </svg>
  );
}

function StereoDisplay3Band({ bands, crossover }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {BANDS_3.map((band, i) => {
        const w = bands[i]?.width || 0;
        const r = bands[i]?.corr || 0;
        const isBad = band.name === "Low" && w > 10;
        const barColor = isBad ? THEME.error : w > 40 ? THEME.warn : band.color;
        return (
          <div key={band.name}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ width: 32, fontSize: 10, color: THEME.sub, fontFamily: THEME.mono, fontWeight: 600 }}>{band.name}</span>
              <div style={{ flex: 1, position: "relative", height: 14, background: "#080812", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#1a1a30" }} />
                <div style={{
                  position: "absolute", left: `${50 - w/2}%`, width: `${Math.max(w, 0.5)}%`,
                  top: 0, bottom: 0, background: barColor, opacity: 0.6, borderRadius: 3,
                }} />
              </div>
              <span style={{ width: 36, fontSize: 9, color: isBad ? THEME.error : THEME.dim, fontFamily: THEME.mono, textAlign: "right" }}>{w}%</span>
              <span style={{ width: 38, fontSize: 8, color: r < 0 ? THEME.error : THEME.dim, fontFamily: THEME.mono }}>r: {r}</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, marginTop: 2 }}>
        ← Mono | Stereo → | Low should be ≈ 0% (mono below {crossover}Hz)
      </div>
    </div>
  );
}

function Chromagram({ chroma, root, mode }) {
  if (!chroma?.length) return null;
  const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  // Major/minor scale degrees (intervals from root)
  const majorScale = new Set([0, 2, 4, 5, 7, 9, 11]);
  const minorScale = new Set([0, 2, 3, 5, 7, 8, 10]);
  const scale = mode === "minor" ? minorScale : majorScale;
  const keyColor = mode === "minor" ? "#aa66ff" : "#33ccaa";

  return (
    <div style={{ background: THEME.card, borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>
      <div style={{ fontSize: 7, color: THEME.sub, fontFamily: THEME.mono, letterSpacing: 1.2, marginBottom: 6 }}>CHROMAGRAM</div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 48 }}>
        {notes.map((note, i) => {
          const pc = (i - root + 12) % 12; // interval from root
          const inScale = scale.has(pc);
          const isRoot = pc === 0;
          const barH = Math.max(3, Math.round(chroma[i] * 44));
          const color = isRoot ? keyColor : inScale ? keyColor + "88" : "#2a2a44";
          return (
            <div key={note} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: "100%", height: barH, background: color, borderRadius: "2px 2px 0 0", transition: "height 0.2s" }} />
              <span style={{ fontSize: 6, color: isRoot ? keyColor : inScale ? THEME.sub : THEME.dim, fontFamily: THEME.mono }}>{note}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit, sub, color }) {
  return (
    <div style={{ flex: "1 1 90px", padding: "7px 9px", background: THEME.card, borderRadius: 6, borderLeft: `3px solid ${color || THEME.border}` }}>
      <div style={{ fontSize: 7, color: THEME.sub, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: THEME.mono, marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, fontFamily: THEME.mono, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 8, color: THEME.sub, marginLeft: 1 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 7, color: THEME.dim, marginTop: 1, fontFamily: THEME.mono }}>{sub}</div>}
    </div>
  );
}

function FeedbackItem({ item }) {
  const colors = { error: THEME.error, warning: THEME.warn, info: THEME.info, good: THEME.good };
  const icons = { error: "✕", warning: "▲", info: "●", good: "✓" };
  return (
    <div style={{ display: "flex", gap: 6, padding: "6px 9px", background: colors[item.type] + "08", borderLeft: `3px solid ${colors[item.type]}`, borderRadius: "0 3px 3px 0", marginBottom: 3 }}>
      <span style={{ color: colors[item.type], fontWeight: 700, fontSize: 9, width: 12, textAlign: "center" }}>{icons[item.type]}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 7, color: colors[item.type], textTransform: "uppercase", letterSpacing: 1, fontFamily: THEME.mono, fontWeight: 600 }}>{item.category}</span>
        <div style={{ fontSize: 10, color: "#9a9ab0", marginTop: 1, lineHeight: 1.35 }}>{item.message}</div>
        {item.tip && <div style={{ fontSize: 8, color: THEME.dim, marginTop: 2, padding: "2px 6px", background: "#ffffff04", borderRadius: 2, lineHeight: 1.35 }}>💡 {item.tip}</div>}
      </div>
    </div>
  );
}

function BandBar({ label, value, color, range, target }) {
  const pct = Math.round(value * 100);
  const tPct = target != null ? Math.round(target * 100) : null;
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: THEME.sub, marginBottom: 1 }}>
        <span style={{ fontFamily: THEME.mono }}>{label}</span>
        <span style={{ fontFamily: THEME.mono }}>{range}</span>
      </div>
      <div style={{ position: "relative", height: 10, background: "#080812", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct * 3.5, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${color}44, ${color})`, borderRadius: 2 }} />
        {tPct != null && (
          <div style={{ position: "absolute", left: `${Math.min(tPct * 3.5, 100)}%`, top: 0, bottom: 0, width: 2, background: "#ffffff55", zIndex: 2 }} />
        )}
        <span style={{ position: "absolute", right: 3, top: 0, fontSize: 7, color: "#fff7", fontFamily: THEME.mono, lineHeight: "10px" }}>{pct}%</span>
      </div>
    </div>
  );
}

function Preferences({ prefs, setPrefs, onClose }) {
  const update = (key, val) => setPrefs(p => ({ ...p, [key]: val }));
  const Slider = ({ label, k, min, max, step, unit }) => (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 1 }}>
        <span>{label}</span><span>{prefs[k]}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={prefs[k]} onChange={e => update(k, +e.target.value)} style={{ width: "100%", accentColor: THEME.accent, height: 4 }} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 18, width: 340, maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: THEME.sub, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>

        {/* Genre */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 2 }}>Genre Target</div>
          <select value={prefs.genre} onChange={e => update("genre", e.target.value)} style={{
            width: "100%", background: THEME.card, color: THEME.text, border: `1px solid ${THEME.border}`,
            borderRadius: 4, padding: "4px 8px", fontSize: 11, fontFamily: THEME.sans, cursor: "pointer", outline: "none",
          }}>
            <option value="">None</option>
            {Object.keys(GENRE_TARGETS).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <Slider label="LUFS Target" k="lufsTarget" min={-16} max={-4} step={0.5} unit=" LUFS" />
        <Slider label="True Peak Ceiling" k="truePeakCeiling" min={-3} max={0} step={0.1} unit=" dBTP" />
        <Slider label="Mono Crossover" k="monoCrossover" min={60} max={200} step={10} unit=" Hz" />
        <Slider label="Spectrum Slope" k="specSlope" min={0} max={4.5} step={1.5} unit=" dB/oct" />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[["showVectorscope", "Vectorscope"], ["showBandWidth", "Stereo Bands"]].map(([k, n]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, cursor: "pointer" }}>
              <input type="checkbox" checked={prefs[k]} onChange={e => update(k, e.target.checked)} style={{ accentColor: THEME.accent }} />{n}
            </label>
          ))}
        </div>

        <button onClick={() => setPrefs(DEFAULT_PREFS)} style={{
          marginTop: 10, width: "100%", padding: 6, background: THEME.card, color: THEME.sub,
          border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 8, fontFamily: THEME.mono, cursor: "pointer",
        }}>Reset to Defaults</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   MAIN APPLICATION
   ════════════════════════════════════════════════════ */

export default function MixAnalyzer() {
  const [stems, setStems] = useState([]);
  const [buffers, setBuffers] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [showPrefs, setShowPrefs] = useState(false);
  const [view, setView] = useState("analysis");
  const fileRef = useRef();
  const audioCtxRef = useRef(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  };

  const processFiles = useCallback(async (files) => {
    setAnalyzing(true);
    const ctx = getAudioContext();
    const results = [], bufs = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`${i + 1}/${files.length}: ${files[i].name}`);
      try {
        const arrayBuf = await files[i].arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        await new Promise(r => setTimeout(r, 50));
        const analysis = analyze(audioBuf, prefs);
        const feedback = generateFeedback(analysis, prefs);
        results.push({ name: files[i].name, analysis, feedback });
        bufs.push(audioBuf);
      } catch (e) {
        results.push({ name: files[i].name, error: e.message });
        bufs.push(null);
      }
    }
    setStems(prev => [...prev, ...results]);
    setBuffers(prev => [...prev, ...bufs]);
    setActiveTab(stems.length);
    setAnalyzing(false);
    setProgress("");
  }, [prefs, stems.length]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith("audio/") || f.name.match(/\.(wav|mp3|flac|ogg|aac|m4a)$/i));
    if (files.length) processFiles(files);
  }, [processFiles]);

  const current = activeTab >= 0 ? stems[activeTab] : null;
  const currentBuffer = activeTab >= 0 ? buffers[activeTab] : null;
  const genreTarget = prefs.genre ? GENRE_TARGETS[prefs.genre] : null;

  const maskingWarnings = useMemo(() => {
    const warnings = [];
    if (stems.length < 2) return warnings;
    for (let i = 0; i < stems.length; i++) {
      for (let j = i + 1; j < stems.length; j++) {
        if (stems[i].error || stems[j].error) continue;
        for (let k = 0; k < BANDS_7.length; k++) {
          if (stems[i].analysis.bandDistribution[k] > 0.18 && stems[j].analysis.bandDistribution[k] > 0.18)
            warnings.push({ a: stems[i].name, b: stems[j].name, band: BANDS_7[k].name, range: `${BANDS_7[k].min}-${BANDS_7[k].max}Hz` });
        }
      }
    }
    return warnings;
  }, [stems]);

  const T = THEME;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.sans }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {showPrefs && <Preferences prefs={prefs} setPrefs={setPrefs} onClose={() => setShowPrefs(false)} />}

      {/* Header */}
      <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 24, height: 24, borderRadius: 5, background: "linear-gradient(135deg, #ff3366, #6644ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>◉</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>MIX ANALYZER</h1>
            <div style={{ fontSize: 7, color: T.sub, fontFamily: T.mono, letterSpacing: 1 }}>
              BS.1770 · TRUE PEAK · FFT · 3-BAND STEREO · {prefs.genre || "GENERAL"}
            </div>
          </div>
        </div>
        <button onClick={() => setShowPrefs(true)} style={{ background: T.card, color: T.sub, border: `1px solid ${T.border}`, borderRadius: 4, padding: "4px 9px", fontSize: 8, cursor: "pointer", fontFamily: T.mono }}>⚙</button>
      </div>

      {/* Drop zone */}
      {!stems.length && !analyzing && (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}
          style={{ margin: 18, padding: "36px 18px", border: `2px dashed ${dragOver ? T.accent : "#1a1a30"}`, borderRadius: 10, textAlign: "center", cursor: "pointer", background: dragOver ? "#6644ff06" : T.card }}>
          <div style={{ fontSize: 26, marginBottom: 5 }}>🎚️</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Drop audio files</div>
          <div style={{ fontSize: 9, color: T.sub, marginTop: 3 }}>WAV · MP3 · FLAC · OGG</div>
          <input ref={fileRef} type="file" multiple accept="audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a" onChange={e => { const f = Array.from(e.target.files); if (f.length) processFiles(f); }} style={{ display: "none" }} />
        </div>
      )}

      {analyzing && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 14, color: T.accent, animation: "pulse 1.5s infinite" }}>◉</div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: T.sub, marginTop: 3 }}>{progress}</div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
        </div>
      )}

      {stems.length > 0 && !analyzing && (
        <div style={{ padding: "0 18px 18px" }}>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 4, padding: "7px 0", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => fileRef.current?.click()} style={{ background: T.card, color: "#7766bb", border: `1px solid ${T.border}`, borderRadius: 3, padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono }}>+ Add</button>
            <input ref={fileRef} type="file" multiple accept="audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a" onChange={e => { const f = Array.from(e.target.files); if (f.length) processFiles(f); }} style={{ display: "none" }} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
              {["analysis", "stereo", "feedback"].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: "3px 7px", fontSize: 7, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: 1,
                  background: view === v ? T.accent + "18" : T.card, color: view === v ? "#bb99ff" : T.sub,
                  border: `1px solid ${view === v ? T.accent + "33" : T.border}`, borderRadius: 3, cursor: "pointer",
                }}>{v}</button>
              ))}
            </div>
            <button onClick={() => { setStems([]); setBuffers([]); setActiveTab(0); }} style={{
              background: "#ff335512", color: "#ff6688", border: "1px solid #ff335528", borderRadius: 3, padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono,
            }}>Clear</button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 10, flexWrap: "wrap" }}>
            {stems.map((s, i) => (
              <button key={i} onClick={() => setActiveTab(i)} style={{
                background: activeTab === i ? T.accent + "18" : T.card, color: activeTab === i ? "#bb99ff" : T.sub,
                border: `1px solid ${activeTab === i ? T.accent + "33" : T.border}`, borderRadius: 3,
                padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono,
                maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{s.name.replace(/\.[^.]+$/, "")}</button>
            ))}
            {stems.length > 1 && (
              <button onClick={() => setActiveTab(-1)} style={{
                background: activeTab === -1 ? "#ff335512" : T.card, color: activeTab === -1 ? "#ff6688" : T.sub,
                border: `1px solid ${activeTab === -1 ? "#ff335528" : T.border}`, borderRadius: 3,
                padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono,
              }}>⚡Mask</button>
            )}
          </div>

          {/* Masking */}
          {activeTab === -1 && (
            <div>
              <h2 style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Masking</h2>
              {!maskingWarnings.length
                ? <div style={{ padding: 8, background: T.good + "08", borderLeft: `3px solid ${T.good}`, borderRadius: "0 3px 3px 0", fontSize: 10, color: "#88ddaa" }}>No significant masking detected.</div>
                : maskingWarnings.map((m, i) => (
                  <div key={i} style={{ padding: "6px 9px", background: T.warn + "08", borderLeft: `3px solid ${T.warn}`, borderRadius: "0 3px 3px 0", marginBottom: 3 }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#ff9966" }}>{m.a.replace(/\.[^.]+$/, "")} × {m.b.replace(/\.[^.]+$/, "")}</div>
                    <div style={{ fontSize: 9, color: "#9a9ab0", marginTop: 1 }}>Competing: <strong>{m.band}</strong> ({m.range})</div>
                  </div>
                ))}
            </div>
          )}

          {/* Stem detail */}
          {activeTab >= 0 && current && !current.error && (
            <div>
              <PlaybackWaveform
                buffer={currentBuffer} audioCtx={audioCtxRef.current}
                waveData={current.analysis.spectralWaveform}
                duration={current.analysis.duration} prefs={prefs} setPrefs={setPrefs}
                bpm={current.analysis.bpm}
              />

              {view === "analysis" && (<>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                  <MetricCard label="INT LUFS" value={current.analysis.lufs} unit="dB" color={T.info} sub={`ST: ${current.analysis.lufsShortTerm}`} />
                  <MetricCard label="TRUE PEAK" value={current.analysis.truePeak} unit="dBTP" color={current.analysis.truePeak > 0 ? T.error : current.analysis.truePeak > -1 ? T.warn : T.good} sub={`Sample: ${current.analysis.samplePeak}`} />
                  <MetricCard label="DR" value={current.analysis.dynamicRange} unit="dB" color="#ffaa00" sub={`LRA: ${current.analysis.lra} LU`} />
                  <MetricCard label="CREST" value={current.analysis.crestFactor} unit="dB" color="#cc44ff" />
                  <MetricCard label="WIDTH" value={current.analysis.stereoWidth} unit="%" color={T.accent} sub={`r: ${current.analysis.correlation}`} />
                  <MetricCard label="BPM" value={current.analysis.bpm} unit="" color="#ff8833" />
                  <MetricCard label="KEY" value={current.analysis.key} unit="" color={current.analysis.keyMode === "minor" ? "#aa66ff" : "#33ccaa"} sub={`conf: ${current.analysis.keyConfidence}`} />
                </div>

                <div style={{ display: "flex", gap: 8, padding: "3px 8px", background: T.card, borderRadius: 3, marginBottom: 12, fontSize: 7, color: T.dim, fontFamily: T.mono, flexWrap: "wrap" }}>
                  <span>{current.analysis.duration}s</span>
                  <span>{current.analysis.sampleRate}Hz</span>
                  <span>{current.analysis.numChannels === 1 ? "Mono" : "Stereo"}</span>
                  <span>RMS: {current.analysis.rmsDb}dB</span>
                  {current.analysis.clippingMs > 0 && <span style={{ color: T.warn }}>Clip: {current.analysis.clippingMs}ms</span>}
                  {prefs.genre && <span style={{ color: T.accent }}>Target: {prefs.genre}</span>}
                </div>

                <SpectrumDisplay points={current.analysis.spectrumPoints} pointsS={current.analysis.spectrumPointsS} slope={prefs.specSlope} genre={prefs.genre} />

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 3 }}>
                    BAND DISTRIBUTION {prefs.genre && `vs ${prefs.genre}`}
                  </div>
                  {BANDS_7.map((band, i) => (
                    <BandBar key={band.name} label={band.name} value={current.analysis.bandDistribution[i]}
                      color={band.color} range={`${band.min}-${band.max}Hz`}
                      target={genreTarget ? genreTarget.bands[i] : null} />
                  ))}
                  {genreTarget && <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, marginTop: 2 }}>White markers = {prefs.genre} target</div>}
                </div>

                <Chromagram chroma={current.analysis.chroma} root={current.analysis.keyRoot} mode={current.analysis.keyMode} />
              </>)}

              {view === "stereo" && (<>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  {prefs.showVectorscope && (
                    <div>
                      <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 3 }}>VECTORSCOPE</div>
                      <Vectorscope data={current.analysis.vectorscope} size={190} />
                    </div>
                  )}
                  {prefs.showBandWidth && (
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 3 }}>3-BAND STEREO</div>
                      <StereoDisplay3Band bands={current.analysis.stereoBands3} crossover={prefs.monoCrossover} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <MetricCard label="Width" value={current.analysis.stereoWidth} unit="%" color={T.accent} />
                  <MetricCard label="Corr" value={current.analysis.correlation} unit="" color={current.analysis.correlation < 0 ? T.error : current.analysis.correlation < 0.3 ? T.warn : T.good} />
                  <MetricCard label="Low W" value={current.analysis.stereoBands3?.[0]?.width || 0} unit="%" color={current.analysis.stereoBands3?.[0]?.width > 10 ? T.error : T.good} sub="Target: <10%" />
                  <MetricCard label="Mid W" value={current.analysis.stereoBands3?.[1]?.width || 0} unit="%" color={T.info} />
                  <MetricCard label="High W" value={current.analysis.stereoBands3?.[2]?.width || 0} unit="%" color="#cc44ff" />
                </div>
              </>)}

              {view === "feedback" && (<>
                <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 4 }}>
                  {prefs.genre || "GENERAL"} MIXING FEEDBACK
                </div>
                <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
                  {[["Errors", "error", T.error], ["Warnings", "warning", T.warn], ["Info", "info", T.info], ["Good", "good", T.good]].map(([label, type, color]) => (
                    <div key={type} style={{ padding: "2px 7px", background: color + "08", borderRadius: 3, fontSize: 8, color, fontFamily: T.mono }}>
                      {current.feedback.filter(f => f.type === type).length} {label}
                    </div>
                  ))}
                </div>
                {current.feedback.map((f, i) => <FeedbackItem key={i} item={f} />)}
              </>)}
            </div>
          )}

          {activeTab >= 0 && current && current.error && (
            <div style={{ padding: 10, background: T.error + "08", borderLeft: `3px solid ${T.error}`, borderRadius: "0 3px 3px 0" }}>
              <div style={{ color: "#ff6688", fontWeight: 600, fontSize: 10 }}>{current.name}</div>
              <div style={{ color: "#8a8a9a", marginTop: 2, fontSize: 9 }}>{current.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
