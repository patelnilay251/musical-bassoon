// 16-bit PCM WAV from float channels in -1..1.

export function encodeWAV(channels, rate = 44100) {
  const n = channels[0].length;
  const C = channels.length;
  const data = n * C * 2;
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(C, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * C * 2, 28);
  buf.writeUInt16LE(C * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < C; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  return buf;
}
