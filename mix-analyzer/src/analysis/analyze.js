import { computeLUFS } from '../dsp/lufs.js';
import { computeTruePeak } from '../dsp/truepeak.js';
import { computeSharedFFT } from '../dsp/sharedFFT.js';
import { computeSpectrum } from '../dsp/spectrum.js';
import { computeStereo } from '../dsp/stereo.js';
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

export function analyze(buffer, _prefs) { // _prefs reserved — Phase 7 will use for genre/target overrides
  const sr = buffer.sampleRate, nCh = buffer.numberOfChannels, len = buffer.length;
  const L = buffer.getChannelData(0), R = nCh > 1 ? buffer.getChannelData(1) : L;

  // Combined single-pass scan: peak, RMS, stereo correlation, clipping
  // Replaces 4 separate full-buffer loops — same accumulators, identical outputs
  const isStereo = nCh > 1;
  let peak = 0, sumSq = 0, sLR = 0, sLL = 0, sRR = 0, clipSamples = 0;
  for (let i = 0; i < len; i++) {
    const l = L[i], r = isStereo ? R[i] : L[i];
    const aL = l < 0 ? -l : l, aR = r < 0 ? -r : r;
    if (aL > peak) peak = aL;
    if (aR > peak) peak = aR;
    const m = (l + r) * 0.5;
    sumSq += m * m;
    sLL += l * l; sRR += r * r; sLR += l * r;
    if (aL >= 0.9999) clipSamples++;
    if (isStereo && aR >= 0.9999) clipSamples++;
  }
  const samplePeak = +(20 * Math.log10(peak + 1e-20)).toFixed(1);
  const rmsDb = +(20 * Math.log10(Math.sqrt(sumSq / len) + 1e-20)).toFixed(1);
  const correlation = +(sLR / (Math.sqrt(sLL * sRR) + 1e-20)).toFixed(3);
  const stereoWidth = +(((1 - correlation) / 2) * 100).toFixed(1);

  const truePeak = computeTruePeak(buffer);
  const lufsData = computeLUFS(buffer);

  // Shared FFT pipeline: one buffer traversal feeds spectrum, stereo, and key (P5.3)
  const shared = computeSharedFFT(buffer);
  const specData = computeSpectrum(shared);
  const stereoData = computeStereo(shared);
  const keyData = computeKey(shared);
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
    spectrumPointsS: specData.spectrumPointsS,
    spectralWaveform: specData.spectralWaveform,
    stereoBands7: stereoData.bands7,
    stereoBands3: stereoData.bands3,
    vectorscope,
    dynamicRange,
    clippingMs: +((clipSamples / sr) * 1000).toFixed(1),
    duration: +(len / sr).toFixed(1),
    sampleRate: sr, numChannels: nCh,
    bpm: null, // populated asynchronously via analyzeBPM()
    key: keyData.key, keyRoot: keyData.root, keyMode: keyData.mode,
    keyConfidence: keyData.confidence, chroma: keyData.chroma,
  };
}

/**
 * analyzeBPM — runs computeBPM in a Web Worker so the main thread is never blocked.
 * Returns a Promise<number> that resolves with the BPM value.
 *
 * Channel data is transferred (zero-copy) to the Worker and back.
 * The caller should patch their analysis state when the Promise resolves.
 */
export function analyzeBPM(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../dsp/bpmWorker.js', import.meta.url), { type: 'classic' });

    const L = buffer.getChannelData(0);
    const hasR = buffer.numberOfChannels > 1;
    const R = hasR ? buffer.getChannelData(1) : null;

    // Copy channel data — we can't transfer the AudioBuffer's internal buffers directly
    // (they're not detachable), so we clone into new Float32Arrays for transfer.
    const channelL = new Float32Array(L);
    const channelR = hasR ? new Float32Array(R) : null;

    const transferList = [channelL.buffer];
    if (channelR) transferList.push(channelR.buffer);

    worker.onmessage = ({ data }) => {
      worker.terminate();
      resolve(data.bpm);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };

    worker.postMessage(
      { channelL, channelR, sampleRate: buffer.sampleRate },
      transferList,
    );
  });
}


