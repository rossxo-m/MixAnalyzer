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

/**
 * Derives key/chroma from the shared FFT result (P5.3).
 * Chroma was accumulated in sharedFFT.js from the same mid FFT bins.
 * The Krumhansl-Kessler correlation and all output math are unchanged.
 */
export function computeKey(shared) {
  const { chroma } = shared;

  // Correlate accumulated chroma against all 24 KK profiles (12 major + 12 minor)
  let bestCorr = -Infinity, bestKey = 0, bestMode = "major";
  for (let root = 0; root < 12; root++) {
    const majProfile = Array.from({ length: 12 }, (_, i) => KK_MAJOR[(i - root + 12) % 12]);
    const minProfile = Array.from({ length: 12 }, (_, i) => KK_MINOR[(i - root + 12) % 12]);
    const chromaArr = Array.from(chroma);
    const cMaj = pearsonCorr(chromaArr, majProfile);
    const cMin = pearsonCorr(chromaArr, minProfile);
    if (cMaj > bestCorr) { bestCorr = cMaj; bestKey = root; bestMode = "major"; }
    if (cMin > bestCorr) { bestCorr = cMin; bestKey = root; bestMode = "minor"; }
  }

  const keyName = NOTE_NAMES[bestKey] + (bestMode === "minor" ? "m" : "");

  // Normalise chroma for visualisation
  const chromaMax = Math.max(...chroma, 1e-10);
  const chromaNorm = Array.from(chroma).map(v => v / chromaMax);

  return { key: keyName, root: bestKey, mode: bestMode, confidence: +bestCorr.toFixed(3), chroma: chromaNorm };
}
