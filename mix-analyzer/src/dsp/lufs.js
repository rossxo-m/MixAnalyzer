/**
 * applyBiquadInPlace — same IIR biquad as before, but writes into a pre-allocated
 * destination buffer instead of allocating one. Eliminates 2 of 4 large Float32Array
 * allocations per computeLUFS() call (P5.4). Filter math is bit-for-bit identical.
 */
function applyBiquadInPlace(src, dst, b0, b1, b2, a1, a2) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    dst[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
}

function kWeightFilter(samples, sampleRate, work, out) {
  // Stage 1: High shelf (+4dB @ 1681Hz) — reads samples, writes work
  const A = Math.pow(10, 3.9998 / 40);
  const w0 = 2 * Math.PI * 1681.97 / sampleRate;
  const sinW = Math.sin(w0), cosW = Math.cos(w0);
  const alpha = sinW / (2 * 0.7072), sqrtA = Math.sqrt(A);
  const b0 = A * ((A + 1) + (A - 1) * cosW + 2 * sqrtA * alpha);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
  const b2 = A * ((A + 1) + (A - 1) * cosW - 2 * sqrtA * alpha);
  const a0 = (A + 1) - (A - 1) * cosW + 2 * sqrtA * alpha;
  const a1 = 2 * ((A - 1) - (A + 1) * cosW);
  const a2 = (A + 1) - (A - 1) * cosW - 2 * sqrtA * alpha;
  applyBiquadInPlace(samples, work, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);

  // Stage 2: High-pass (RLB @ 38Hz) — reads work, writes out
  const w2 = 2 * Math.PI * 38.14 / sampleRate;
  const alpha2 = Math.sin(w2) / (2 * 0.5003);
  const hpB0 = (1 + Math.cos(w2)) / 2;
  const hpB1 = -(1 + Math.cos(w2));
  const hpB2 = (1 + Math.cos(w2)) / 2;
  const hpA0 = 1 + alpha2;
  const hpA1 = -2 * Math.cos(w2);
  const hpA2 = 1 - alpha2;
  applyBiquadInPlace(work, out, hpB0/hpA0, hpB1/hpA0, hpB2/hpA0, hpA1/hpA0, hpA2/hpA0);
}

export function computeLUFS(buffer) {
  const sr = buffer.sampleRate, nCh = buffer.numberOfChannels, len = buffer.length;

  // Pre-allocate one work buffer + one output buffer per channel (2 total vs 4 before)
  const work = new Float32Array(len);
  const kWeighted = [];
  for (let ch = 0; ch < nCh; ch++) {
    const out = new Float32Array(len);
    kWeightFilter(buffer.getChannelData(ch), sr, work, out);
    kWeighted.push(out);
  }

  const weights = [1, 1, 1, 1.41, 1.41];
  const blockSize = Math.floor(sr * 0.4), stepSize = Math.floor(sr * 0.1);
  const blockLoudness = [];

  for (let s = 0; s + blockSize <= len; s += stepSize) {
    let power = 0;
    for (let ch = 0; ch < nCh; ch++) {
      let chPow = 0;
      const data = kWeighted[ch];
      for (let i = s; i < s + blockSize; i++) chPow += data[i] * data[i];
      power += (weights[ch] || 1) * (chPow / blockSize);
    }
    blockLoudness.push(-0.691 + 10 * Math.log10(power + 1e-20));
  }

  if (!blockLoudness.length) return { integrated: -70, shortTerm: -70, lra: 0 };

  // Absolute gate at -70 LUFS
  let gated = blockLoudness.filter(l => l > -70);
  if (!gated.length) return { integrated: -70, shortTerm: -70, lra: 0 };

  // Relative gate at power-domain mean - 10 LU (BS.1770-4 §2.8)
  let powerSum = 0;
  for (const l of gated) powerSum += Math.pow(10, l / 10);
  const relativeThreshold = 10 * Math.log10(powerSum / gated.length) - 10;
  // Apply both gates sequentially (abs then rel) per BS.1770-4
  const finalGated = gated.filter(l => l > relativeThreshold);
  // Integrated loudness = power-domain mean of surviving blocks (the -0.691 offset is
  // already baked into each block value, so 10·log10(mean 10^(L/10)) gives correct LUFS).
  let finalPowerSum = 0;
  for (const l of finalGated) finalPowerSum += Math.pow(10, l / 10);
  const integrated = finalGated.length ? 10 * Math.log10(finalPowerSum / finalGated.length) : -70;

  // LRA + short-term max
  const stBlocks = [];
  const stSize = Math.floor(sr * 3), stStep = Math.floor(sr);
  for (let s = 0; s + stSize <= len; s += stStep) {
    let pow = 0;
    for (let ch = 0; ch < nCh; ch++) {
      let chP = 0;
      const data = kWeighted[ch];
      for (let i = s; i < s + stSize; i++) chP += data[i] * data[i];
      pow += (weights[ch] || 1) * (chP / stSize);
    }
    stBlocks.push(-0.691 + 10 * Math.log10(pow + 1e-20));
  }
  const absGated = stBlocks.filter(l => l > -70);
  let shortTerm = integrated;
  for (const l of absGated) { if (l > shortTerm) shortTerm = l; }
  let stPowerSum = 0;
  for (const l of absGated) stPowerSum += Math.pow(10, l / 10);
  const relMean = absGated.length ? 10 * Math.log10(stPowerSum / absGated.length) : -70;
  const relGated = absGated.filter(l => l > relMean - 20).sort((a, b) => a - b);
  const p10 = relGated[Math.floor(relGated.length * 0.1)] || -70;
  const p95 = relGated[Math.floor(relGated.length * 0.95)] || -70;

  return {
    integrated: +integrated.toFixed(1),
    shortTerm: +shortTerm.toFixed(1),
    lra: +(p95 - p10).toFixed(1),
  };
}
