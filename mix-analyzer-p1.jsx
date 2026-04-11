import { useState, useRef, useCallback, useMemo } from "react";

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

  // Short-term (3s window)
  const st3 = Math.floor(sr * 3);
  let shortTerm = integrated;
  if (len >= st3) {
    const off = len - st3;
    let pow = 0;
    for (let ch = 0; ch < nCh; ch++) {
      let chP = 0;
      const data = kWeighted[ch];
      for (let i = off; i < off + st3; i++) chP += data[i] * data[i];
      pow += (weights[ch] || 1) * (chP / st3);
    }
    shortTerm = -0.691 + 10 * Math.log10(pow + 1e-20);
  }

  // LRA (loudness range)
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

  if (frameCount > 0) for (let i = 0; i < half; i++) avgMag[i] /= frameCount;

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

  return { bandDistribution, spectrumPoints, spectralWaveform };
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
    spectralWaveform: specData.spectralWaveform,
    stereoBands7: stereoData.bands7,
    stereoBands3: stereoData.bands3,
    vectorscope,
    dynamicRange,
    clippingMs: +((clipSamples / sr) * 1000).toFixed(1),
    duration: +(len / sr).toFixed(1),
    sampleRate: sr, numChannels: nCh,
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
   PLAYBACK with waveform playhead
   ════════════════════════════════════════════════════ */

function PlaybackWaveform({ buffer, audioCtx, waveData, duration, prefs, setPrefs }) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const sourceRef = useRef(null);
  const startTimeRef = useRef(0);
  const animRef = useRef(null);
  const positionRef = useRef(0);
  const playingRef = useRef(false);

  const killSource = useCallback(() => {
    cancelAnimationFrame(animRef.current); animRef.current = null;
    const src = sourceRef.current;
    if (src) { src.onended = null; try { src.disconnect(); } catch(e) {} try { src.stop(0); } catch(e) {} sourceRef.current = null; }
    playingRef.current = false; setPlaying(false);
  }, []);

  const playFrom = useCallback((offset) => {
    if (!buffer || !audioCtx) return;
    killSource();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer; src.connect(audioCtx.destination);
    sourceRef.current = src; startTimeRef.current = audioCtx.currentTime - offset;
    playingRef.current = true; setPlaying(true);
    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null; playingRef.current = false;
        cancelAnimationFrame(animRef.current);
        setPlaying(false); setPosition(0); positionRef.current = 0;
      }
    };
    src.start(0, offset);
    const tick = () => {
      if (!playingRef.current || sourceRef.current !== src) return;
      const elapsed = Math.min(audioCtx.currentTime - startTimeRef.current, buffer.duration);
      positionRef.current = elapsed; setPosition(elapsed);
      if (elapsed < buffer.duration) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [buffer, audioCtx, killSource]);

  const toggle = useCallback(() => {
    if (playingRef.current) killSource(); else playFrom(positionRef.current);
  }, [killSource, playFrom]);

  const seek = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newPos = pct * duration;
    if (playingRef.current) playFrom(newPos);
    else { positionRef.current = newPos; setPosition(newPos); }
  }, [duration, playFrom]);

  if (!buffer || !waveData) return null;

  const W = 760, H = 120;
  const playheadX = (position / duration) * W;
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const isSpectral = prefs.waveMode === "spectral";
  const toggles = prefs.bandToggles;

  return (
    <div style={{ marginBottom: 14 }}>
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

        {/* Band toggles */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {BANDS_3.map((band, i) => (
            <button key={band.name} onClick={() => {
              setPrefs(p => {
                const next = [...p.bandToggles];
                next[i] = !next[i];
                if (!next.some(Boolean)) return p; // Don't allow all off
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
      <div style={{ background: "#080812", borderRadius: 7, padding: "6px 0", cursor: "pointer" }} onClick={seek}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
          <line x1="0" y1={H/2} x2={W} y2={H/2} stroke="#111120" strokeWidth="1" />
          <line x1="0" y1=".5" x2={W} y2=".5" stroke="#ff336615" strokeWidth=".5" strokeDasharray="3,3" />
          <line x1="0" y1={H-.5} x2={W} y2={H-.5} stroke="#ff336615" strokeWidth=".5" strokeDasharray="3,3" />

          {isSpectral ? (
            // ── Spectral waveform: RGB color blend by frequency content ──
            // Each column's color is a continuous blend of Low (red/warm), Mid (green),
            // High (blue) proportional to their energy — like MiniMeters RGB mode
            waveData.map((frame, i) => {
              const x = (i / waveData.length) * W;
              const bw = Math.max(0.8, W / waveData.length);
              const amplitude = frame.rms * H / 2;
              if (amplitude < 0.3) return null;

              // Get weighted band proportions (respecting toggles)
              let low = toggles[0] ? frame.low : 0;
              let mid = toggles[1] ? frame.mid : 0;
              let high = toggles[2] ? frame.high : 0;
              const sum = low + mid + high;
              if (sum < 0.001) return null;
              // Normalize so visible bands sum to 1
              low /= sum; mid /= sum; high /= sum;

              // RGB blend: Low = warm red/orange, Mid = green/cyan, High = blue/purple
              // Low:  R=255, G=80,  B=60
              // Mid:  R=60,  G=210, B=100
              // High: R=70,  G=130, B=255
              const r = Math.round(low * 255 + mid * 60  + high * 70);
              const g = Math.round(low * 80  + mid * 210 + high * 130);
              const b = Math.round(low * 60  + mid * 100 + high * 255);
              const color = `rgb(${r},${g},${b})`;

              // Brighter core (RMS), dimmer envelope (peak)
              const peakH = Math.max(frame.mx, -frame.mn) * H / 2;

              return (
                <g key={i}>
                  {/* Peak envelope — dimmer */}
                  <line x1={x} y1={H/2 - peakH} x2={x} y2={H/2 + peakH}
                    stroke={color} strokeWidth={bw} opacity=".18" />
                  {/* RMS body — full color */}
                  <line x1={x} y1={H/2 - amplitude} x2={x} y2={H/2 + amplitude}
                    stroke={color} strokeWidth={bw} opacity=".7" />
                </g>
              );
            })
          ) : (
            // ── Uniform waveform ──
            waveData.map((frame, i) => {
              const x = (i / waveData.length) * W;
              const bw = Math.max(0.65, W / waveData.length);
              return (
                <g key={i}>
                  <line x1={x} y1={H/2 - frame.mx*H/2} x2={x} y2={H/2 - frame.mn*H/2} stroke="#6644ff1c" strokeWidth={bw} />
                  <line x1={x} y1={H/2 - frame.rms*H/2} x2={x} y2={H/2 + frame.rms*H/2} stroke="#6644ff" strokeWidth={bw} opacity=".5" />
                </g>
              );
            })
          )}

          <rect x="0" y="0" width={Math.max(0, playheadX)} height={H} fill="#6644ff" opacity=".04" />
          <line x1={playheadX} y1="0" x2={playheadX} y2={H} stroke="#fff" strokeWidth="1.5" opacity=".8" />
          <circle cx={playheadX} cy={H/2} r="3" fill="#fff" opacity=".85" />
        </svg>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SPECTRUM DISPLAY with slope compensation
   ════════════════════════════════════════════════════ */

function SpectrumDisplay({ points, slope, genre }) {
  if (!points?.length) return null;
  const W = 760, H = 180;
  const fMin = points[0]?.freq || 20, fMax = points[points.length - 1]?.freq || 20000;
  const target = genre ? GENRE_TARGETS[genre] : null;

  // Apply slope compensation
  const compensated = points.map(p => {
    const octavesFromRef = Math.log2(p.freq / 1000);
    return { freq: p.freq, db: p.db + octavesFromRef * slope };
  });

  // Auto-range: find actual dB range, ensure minimum 48dB span for useful display
  let dataMin = Infinity, dataMax = -Infinity;
  for (const p of compensated) {
    if (p.db > dataMax) dataMax = p.db;
    if (p.db < dataMin && p.db > -100) dataMin = p.db;
  }
  // Ensure at least 48dB of display range
  const minSpan = 48;
  if (dataMax - dataMin < minSpan) {
    const center = (dataMax + dataMin) / 2;
    dataMax = center + minSpan / 2;
    dataMin = center - minSpan / 2;
  }
  // Round to nice grid values, pad by 6dB
  const dbMax = Math.ceil(dataMax / 6) * 6 + 6;
  const dbMin = Math.floor(dataMin / 6) * 6 - 6;
  const dbRange = dbMax - dbMin || 1; // prevent division by zero

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
        <span style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1.5 }}>SPECTRUM</span>
        <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>
          1/6 oct smooth · slope {slope}dB/oct · {dbMin}→{dbMax}dB
        </span>
      </div>
      <svg viewBox={`0 0 ${W + 30} ${H + 18}`} width="100%" style={{ display: "block" }}>
        <g>
          {/* dB grid */}
          {gridLines.map(db => {
            const y = dbToY(db);
            const isMajor = db % 12 === 0;
            return (
              <g key={db}>
                <line x1="0" y1={y} x2={W} y2={y} stroke={isMajor ? "#1a1a2e" : "#0e0e1c"} strokeWidth={isMajor ? ".8" : ".4"} />
                <text x={W + 3} y={y + 3} fill={isMajor ? "#3a3a55" : "#222238"} fontSize="7" fontFamily={THEME.mono}>{db}</text>
              </g>
            );
          })}
          {/* Freq grid */}
          {freqGrid.map(f => {
            const x = fToX(f);
            return <line key={f} x1={x} y1={0} x2={x} y2={H} stroke="#0e0e1c" strokeWidth=".4" />;
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
                <path d={bandPath} fill="#ffcc44" opacity=".1" />
                <path d={upperPath} fill="none" stroke="#ffcc44" strokeWidth=".5" opacity=".25" strokeDasharray="3,3" />
                <path d={lowerPath} fill="none" stroke="#ffcc44" strokeWidth=".5" opacity=".25" strokeDasharray="3,3" />
                <path d={centerPath} fill="none" stroke="#ffcc44" strokeWidth="1.5" opacity=".6" />
                {curve.points.filter((_, i) => i % 4 === 0).map(([f, db], i) => {
                  const x = fToX(f);
                  const y = dbToY(db + anchor);
                  if (x < 0 || x > W || y < 0 || y > H) return null;
                  return <circle key={i} cx={x} cy={y} r="1.8" fill="#ffcc44" opacity=".4" />;
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
              />

              {view === "analysis" && (<>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                  <MetricCard label="INT LUFS" value={current.analysis.lufs} unit="dB" color={T.info} sub={`ST: ${current.analysis.lufsShortTerm}`} />
                  <MetricCard label="TRUE PEAK" value={current.analysis.truePeak} unit="dBTP" color={current.analysis.truePeak > 0 ? T.error : current.analysis.truePeak > -1 ? T.warn : T.good} sub={`Sample: ${current.analysis.samplePeak}`} />
                  <MetricCard label="DR" value={current.analysis.dynamicRange} unit="dB" color="#ffaa00" sub={`LRA: ${current.analysis.lra} LU`} />
                  <MetricCard label="CREST" value={current.analysis.crestFactor} unit="dB" color="#cc44ff" />
                  <MetricCard label="WIDTH" value={current.analysis.stereoWidth} unit="%" color={T.accent} sub={`r: ${current.analysis.correlation}`} />
                </div>

                <div style={{ display: "flex", gap: 8, padding: "3px 8px", background: T.card, borderRadius: 3, marginBottom: 12, fontSize: 7, color: T.dim, fontFamily: T.mono, flexWrap: "wrap" }}>
                  <span>{current.analysis.duration}s</span>
                  <span>{current.analysis.sampleRate}Hz</span>
                  <span>{current.analysis.numChannels === 1 ? "Mono" : "Stereo"}</span>
                  <span>RMS: {current.analysis.rmsDb}dB</span>
                  {current.analysis.clippingMs > 0 && <span style={{ color: T.warn }}>Clip: {current.analysis.clippingMs}ms</span>}
                  {prefs.genre && <span style={{ color: T.accent }}>Target: {prefs.genre}</span>}
                </div>

                <SpectrumDisplay points={current.analysis.spectrumPoints} slope={prefs.specSlope} genre={prefs.genre} />

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
