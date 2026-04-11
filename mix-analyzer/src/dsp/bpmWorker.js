/**
 * BPM Worker (P5.5)
 *
 * Receives channel data + sampleRate via postMessage, computes BPM,
 * posts result back. Runs entirely off the main thread.
 *
 * Message in:  { channelL: Float32Array, channelR: Float32Array|null, sampleRate: number }
 * Message out: { bpm: number }
 *
 * The FFT used here is self-contained (copy of fft.js) because Workers
 * cannot import ES modules in all environments without extra Vite config.
 * When Vite's worker: { format: 'es' } is confirmed working this can be
 * replaced with a standard import.
 */

// ── Inline Cooley-Tukey FFT (identical to src/dsp/fft.js) ──────────────────
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

// ── computeBPM (identical logic to src/dsp/bpm.js) ─────────────────────────
function computeBPM(L, R, sr) {
  const len = L.length;
  const hop = 256, frameN = 1024;
  const win = new Float32Array(frameN);
  for (let i = 0; i < frameN; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameN - 1)));
  const freqRes = sr / frameN;
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

  const onset = new Float32Array(numFrames);
  for (let h = 1; h < numFrames; h++) onset[h] = Math.max(0, energy[h] - energy[h - 1]);
  let maxO = 1e-10;
  for (let h = 0; h < numFrames; h++) { if (onset[h] > maxO) maxO = onset[h]; }
  for (let h = 0; h < numFrames; h++) onset[h] /= maxO;

  const fps = sr / hop;
  const lagMin = Math.floor(fps * 60 / 220);
  const lagMax = Math.ceil(fps * 60 / 50);
  const acLen = Math.min(numFrames, lagMax * 2);
  const ac = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    for (let h = 0; h + lag < acLen; h++) sum += onset[h] * onset[h + lag];
    ac[lag] = sum / (acLen - lag);
  }

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

  const doubleLag = bestLag * 2;
  if (doubleLag <= lagMax && score[doubleLag] > bestScore * 0.85) bestLag = doubleLag;

  const bpm = fps * 60 / bestLag;
  return Math.round(bpm * 2) / 2;
}

// ── Worker message handler ───────────────────────────────────────────────────
self.onmessage = function({ data }) {
  const { channelL, channelR, sampleRate } = data;
  const R = channelR ?? channelL; // mono fallback
  const bpm = computeBPM(channelL, R, sampleRate);
  // Transfer channelL/R back so the caller can reuse or GC them efficiently
  self.postMessage({ bpm }, [channelL.buffer, ...(channelR ? [channelR.buffer] : [])]);
};
