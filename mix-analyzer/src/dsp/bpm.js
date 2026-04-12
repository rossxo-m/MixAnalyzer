import { fft } from './fft.js';

export function computeBPM(buffer) {
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
  // Use loop instead of spread to avoid stack overflow on long tracks
  let maxO = 1e-10;
  for (let h = 0; h < numFrames; h++) { if (onset[h] > maxO) maxO = onset[h]; }
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

  let bpm = fps * 60 / bestLag;
  if (bpm < 100 && bpm * 2 <= 200) bpm *= 2;
  return Math.round(bpm * 2) / 2;
}
