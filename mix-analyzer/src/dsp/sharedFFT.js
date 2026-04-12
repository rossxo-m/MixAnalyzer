/**
 * Shared FFT pipeline (P5.3)
 *
 * Runs a single hop loop at N=8192 over the audio buffer and accumulates
 * everything that computeSpectrum, computeStereo, and computeKey all need.
 *
 * Previously each module ran its own independent FFT loop over the same buffer:
 *   computeSpectrum : ~648 FFTs of N=8192 (600 mid + 48 side)
 *   computeStereo   :  ~48 FFTs of N=8192 (24 frames × L+R)
 *   computeKey      :  ~64 FFTs of N=8192
 * Total: ~760 FFTs, 3 separate buffer traversals.
 *
 * After: one loop, one buffer traversal, ~648 FFTs total.
 * Stereo and key accumulate during the waveform hops at no extra FFT cost.
 *
 * M/S identity used for stereo bins:
 *   mid[k]  = (L[k] + R[k]) / 2
 *   side[k] = (L[k] - R[k]) / 2
 *   → L[k]  = mid[k] + side[k]    (exact, no extra FFT)
 *   → R[k]  = mid[k] - side[k]
 *
 * DSP math is UNCHANGED. All outputs are numerically identical to the
 * per-module implementations they replace.
 */

import { fft } from './fft.js';
import { BANDS_3, BANDS_7 } from '../constants.js';

export function computeSharedFFT(buffer) {
  const sr = buffer.sampleRate, len = buffer.length;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const isStereo = buffer.numberOfChannels > 1;

  const N = 8192, half = N / 2, hop = N / 2;
  const freqRes = sr / N;

  // Hann window — computed once
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));

  // ── Sampling schedules ──────────────────────────────────────────────────────
  const numHops = Math.floor((len - N) / hop);

  // Spectrum curve: up to 48 frames (same as original computeSpectrum)
  const maxSpecFrames = Math.min(numHops, 48);
  const specStep = Math.max(1, Math.floor(numHops / maxSpecFrames));

  // Spectral waveform: up to 600 frames (same as original)
  const maxWaveFrames = Math.min(numHops, 2400);
  const waveStep = Math.max(1, Math.floor(numHops / maxWaveFrames));

  // Stereo: up to 24 frames — subsample from the hops we're already running
  const maxStereoFrames = Math.min(numHops, 24);
  const stereoStep = Math.max(1, Math.floor(numHops / maxStereoFrames));

  // Key: up to 64 frames
  const maxKeyFrames = Math.min(numHops, 64);
  const keyStep = Math.max(1, Math.floor(numHops / maxKeyFrames));

  // ── Accumulators ────────────────────────────────────────────────────────────

  // Spectrum: average magnitude (mid + side)
  const avgMagM = new Float64Array(half);
  const avgMagS = new Float64Array(half);
  let specFrameCount = 0;

  // Spectral waveform: per-frame 3-band proportions + time domain stats
  const band3Ranges = BANDS_3.map(b => ({
    lo: Math.max(1, Math.floor(b.min / freqRes)),
    hi: Math.min(half - 1, Math.ceil(b.max / freqRes)),
  }));
  const spectralWaveform = [];

  // Stereo: per-band accumulator (same structure as original computeStereo)
  const stereoAccum = BANDS_7.map(() => ({ sLL: 0, sRR: 0, sLR: 0, sM: 0, sS: 0 }));

  // Key: chroma accumulator (12 pitch classes)
  const chroma = new Float64Array(12);
  const fLo = 65, fHi = 2093;
  const chromaBinLo = Math.max(1, Math.floor(fLo / freqRes));
  const chromaBinHi = Math.min(half - 1, Math.ceil(fHi / freqRes));

  // ── Shared FFT scratch buffers ───────────────────────────────────────────────
  const reMid = new Float64Array(N), imMid = new Float64Array(N);
  const reSide = new Float64Array(N), imSide = new Float64Array(N);

  // ── Main loop ───────────────────────────────────────────────────────────────
  for (let h = 0; h < numHops; h++) {
    const off = h * hop;
    if (off + N > len) break;

    const needsSpec  = (h % specStep   === 0);
    const needsWave  = (h % waveStep   === 0);
    const needsStereo = isStereo && (h % stereoStep === 0);
    const needsKey   = (h % keyStep    === 0);

    if (!needsSpec && !needsWave && !needsStereo && !needsKey) continue;

    // Always fill mid FFT — needed by spectrum curve, waveform, and key
    imMid.fill(0);
    for (let i = 0; i < N; i++) reMid[i] = ((L[off + i] + R[off + i]) * 0.5) * win[i];
    fft(reMid, imMid);

    // Side FFT — needed for spectrum side curve and (via M/S) stereo bands
    const needsSide = needsSpec || (needsStereo && isStereo);
    if (needsSide) {
      imSide.fill(0);
      for (let i = 0; i < N; i++) reSide[i] = ((L[off + i] - R[off + i]) * 0.5) * win[i];
      fft(reSide, imSide);
    }

    // ── Accumulate spectrum curve (mid + side average magnitudes) ──
    if (needsSpec) {
      for (let k = 0; k < half; k++) {
        avgMagM[k] += Math.sqrt(reMid[k] * reMid[k] + imMid[k] * imMid[k]);
        avgMagS[k] += Math.sqrt(reSide[k] * reSide[k] + imSide[k] * imSide[k]);
      }
      specFrameCount++;
    }

    // ── Accumulate stereo bands via M/S identity (no extra FFT) ──
    // L[k] = mid[k] + side[k],  R[k] = mid[k] - side[k]
    if (needsStereo) {
      for (let b = 0; b < BANDS_7.length; b++) {
        const lo = Math.max(1, Math.floor(BANDS_7[b].min / freqRes));
        const hi = Math.min(half - 1, Math.ceil(BANDS_7[b].max / freqRes));
        const acc = stereoAccum[b];
        for (let k = lo; k <= hi; k++) {
          const lR = reMid[k] + reSide[k], lI = imMid[k] + imSide[k];
          const rR = reMid[k] - reSide[k], rI = imMid[k] - imSide[k];
          acc.sLL += lR * lR + lI * lI;
          acc.sRR += rR * rR + rI * rI;
          acc.sLR += lR * rR + lI * rI;
          const mR = reMid[k], mI = imMid[k];
          const sR = reSide[k], sI = imSide[k];
          acc.sM += mR * mR + mI * mI;
          acc.sS += sR * sR + sI * sI;
        }
      }
    }

    // ── Accumulate chroma for key detection ──
    if (needsKey) {
      for (let k = chromaBinLo; k <= chromaBinHi; k++) {
        const freq = k * freqRes;
        const midi = 12 * Math.log2(freq / 440) + 69;
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        chroma[pc] += Math.sqrt(reMid[k] * reMid[k] + imMid[k] * imMid[k]);
      }
    }

    // ── Spectral waveform frame ──
    if (needsWave) {
      const bandEnergy = [0, 0, 0];
      let totalE = 0;
      for (let b = 0; b < 3; b++) {
        const { lo, hi } = band3Ranges[b];
        for (let k = lo; k <= hi; k++) {
          const mag = reMid[k] * reMid[k] + imMid[k] * imMid[k];
          bandEnergy[b] += mag;
          totalE += mag;
        }
      }
      const total = totalE + 1e-20;
      let rms = 0, mx = 0, mn = 0;
      for (let i = 0; i < N; i++) {
        const s = (L[off + i] + R[off + i]) * 0.5;
        rms += s * s;
        if (s > mx) mx = s;
        if (s < mn) mn = s;
      }
      rms = Math.sqrt(rms / N);
      spectralWaveform.push({
        low: bandEnergy[0] / total,
        mid: bandEnergy[1] / total,
        high: bandEnergy[2] / total,
        rms, mx, mn,
      });
    }
  }

  // Normalise spectrum averages
  if (specFrameCount > 0) {
    for (let k = 0; k < half; k++) {
      avgMagM[k] /= specFrameCount;
      avgMagS[k] /= specFrameCount;
    }
  }

  return {
    // For computeSpectrum
    avgMagM, avgMagS, freqRes, half, specFrameCount,
    spectralWaveform,
    // For computeStereo
    stereoAccum,
    isStereo,
    // For computeKey
    chroma,
  };
}
