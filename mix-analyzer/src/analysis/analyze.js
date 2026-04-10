import { computeLUFS } from '../dsp/lufs.js';
import { computeTruePeak } from '../dsp/truepeak.js';
import { computeSpectrum } from '../dsp/spectrum.js';
import { computeStereo } from '../dsp/stereo.js';
import { computeBPM } from '../dsp/bpm.js';
import { computeKey } from '../dsp/key.js';

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

export function analyze(buffer, prefs) {
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
