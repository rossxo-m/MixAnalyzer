export function computeTruePeak(buffer) {
  let max = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    // Check edge samples that the Catmull-Rom loop can't cover
    if (data.length > 0 && Math.abs(data[0]) > max) max = Math.abs(data[0]);
    if (data.length > 1 && Math.abs(data[data.length - 1]) > max) max = Math.abs(data[data.length - 1]);
    if (data.length > 2 && Math.abs(data[data.length - 2]) > max) max = Math.abs(data[data.length - 2]);
    for (let i = 1; i < data.length - 2; i++) {
      let abs = Math.abs(data[i]);
      if (abs > max) max = abs;
      const s0 = data[i-1], s1 = data[i], s2 = data[i+1], s3 = data[i+2];
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const v = Math.abs(0.5 * ((2*s1) + (-s0+s2)*t + (2*s0-5*s1+4*s2-s3)*t*t + (-s0+3*s1-3*s2+s3)*t*t*t));
        if (v > max) max = v;
      }
    }
  }
  return +(20 * Math.log10(max + 1e-20)).toFixed(2);
}
