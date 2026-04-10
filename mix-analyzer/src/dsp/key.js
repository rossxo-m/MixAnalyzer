import { fft } from './fft.js';

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

export function computeKey(buffer) {
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
