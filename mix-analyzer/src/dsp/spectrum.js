import { fft } from './fft.js';
import { BANDS_3, BANDS_7 } from '../constants.js';

export function computeSpectrum(buffer) {
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

  // Hoist FFT buffers outside the hot loop to avoid per-hop GC pressure
  const re = new Float64Array(N), im = new Float64Array(N);
  const reS = new Float64Array(N), imS = new Float64Array(N);

  for (let h = 0; h < numHops; h++) {
    const off = h * hop;
    if (off + N > len) break;

    // Only run FFT when this hop is needed by at least one consumer
    const needsSpectrum = (h % frameStep === 0);
    const needsWaveform = (h % waveStep === 0);
    if (!needsSpectrum && !needsWaveform) continue;

    for (let i = 0; i < N; i++) { re[i] = ((L[off + i] + R[off + i]) / 2) * win[i]; im[i] = 0; }
    fft(re, im);

    // Accumulate average spectrum (sampled frames)
    if (needsSpectrum) {
      for (let i = 0; i < half; i++) avgMag[i] += Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      // Side spectrum: (L-R)/2
      for (let i = 0; i < N; i++) { reS[i] = ((L[off + i] - R[off + i]) / 2) * win[i]; imS[i] = 0; }
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
