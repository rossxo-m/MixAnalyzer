import { BANDS_3, BANDS_7 } from '../constants.js';

/**
 * Derives spectrum outputs from the shared FFT result (P5.3).
 * All DSP math is identical to the original; only the FFT source has changed
 * from a private loop to the shared pipeline in sharedFFT.js.
 */
export function computeSpectrum(shared) {
  const { avgMagM, avgMagS, freqRes, half, spectralWaveform } = shared;

  // 7-band distribution from averaged mid magnitudes
  const bandEnergies = BANDS_7.map(({ min, max }) => {
    let e = 0;
    for (let i = Math.max(1, Math.floor(min / freqRes)); i <= Math.min(half - 1, Math.ceil(max / freqRes)); i++)
      e += avgMagM[i] * avgMagM[i];
    return e;
  });
  const totalEnergy = bandEnergies.reduce((a, b) => a + b, 0);
  const bandDistribution = bandEnergies.map(e => e / (totalEnergy + 1e-20));

  // Spectrum curve: 1/6-octave smoothed points (mid + side), identical logic to original
  const numPts = 300;
  // sr not available here — derive nyquist from half * freqRes
  const nyquist = half * freqRes;
  const fMin = 20, fMax = Math.min(20000, nyquist);
  const smoothingOctaves = 1 / 6;

  const spectrumPoints = [];
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const centerFreq = fMin * Math.pow(fMax / fMin, t);
    const loFreq = centerFreq * Math.pow(2, -smoothingOctaves / 2);
    const hiFreq = centerFreq * Math.pow(2, +smoothingOctaves / 2);
    const loBin = Math.max(1, Math.floor(loFreq / freqRes));
    const hiBin = Math.min(half - 1, Math.ceil(hiFreq / freqRes));
    let sum = 0, count = 0;
    for (let b = loBin; b <= hiBin; b++) { sum += avgMagM[b]; count++; }
    const avgVal = count > 0 ? sum / count : 1e-20;
    spectrumPoints.push({ freq: centerFreq, db: Math.max(-100, 20 * Math.log10(avgVal + 1e-20)) });
  }

  const spectrumPointsS = [];
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const centerFreq = fMin * Math.pow(fMax / fMin, t);
    const loFreq = centerFreq * Math.pow(2, -smoothingOctaves / 2);
    const hiFreq = centerFreq * Math.pow(2, +smoothingOctaves / 2);
    const loBin = Math.max(1, Math.floor(loFreq / freqRes));
    const hiBin = Math.min(half - 1, Math.ceil(hiFreq / freqRes));
    let sum = 0, count = 0;
    for (let b = loBin; b <= hiBin; b++) { sum += avgMagS[b]; count++; }
    const avgVal = count > 0 ? sum / count : 1e-20;
    spectrumPointsS.push({ freq: centerFreq, db: Math.max(-100, 20 * Math.log10(avgVal + 1e-20)) });
  }

  return { bandDistribution, spectrumPoints, spectrumPointsS, spectralWaveform };
}
