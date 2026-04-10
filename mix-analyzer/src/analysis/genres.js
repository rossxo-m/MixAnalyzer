import { BANDS_7 } from '../constants.js';

// High-resolution target curves: [freq, dBRelative, ±rangedB] triplets
// dB values are relative to the 1kHz reference level of the analyzed track
// Range values define the acceptable tolerance band (wider at extremes, tighter in mids)
// Derived from analysis of commercial masters (iZotope TBC methodology):
// - EDM drops approximate pink noise (flat at 3dB/oct slope)
// - Modern masters show ~4.5dB/oct natural rolloff
// - Tolerance is WIDER at frequency extremes (sub, air) and TIGHTER in mids
export const GENRE_CURVES = {
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
export function interpolateTargetCurve(curvePoints, freq) {
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
export const GENRE_TARGETS = {};
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
