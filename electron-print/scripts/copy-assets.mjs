import { cp, mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

await mkdir(new URL('../dist/renderer/', import.meta.url), { recursive: true });
await cp(new URL('../renderer/', import.meta.url), new URL('../dist/renderer/', import.meta.url), { recursive: true });

// A small native PNG tray icon; no runtime image/font dependencies.
const raw = Buffer.alloc(32 * (1 + 32 * 4));
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  const offset = y * 129 + 1 + x * 4;
  const ink = ((y >= 6 && y <= 12 && x >= 9 && x <= 22) || (y >= 14 && y <= 23 && x >= 6 && x <= 25) || (y >= 23 && y <= 27 && x >= 10 && x <= 21));
  raw.set(ink ? [255, 255, 255, 255] : [37, 99, 235, 255], offset);
}
const header = Buffer.alloc(13); header.writeUInt32BE(32, 0); header.writeUInt32BE(32, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
await writeFile(new URL('../dist/renderer/tray.png', import.meta.url), png);
function chunk(name, data) {
  const body = Buffer.concat([Buffer.from(name), data]);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  let checksum = 0xffffffff;
  for (const byte of body) { checksum ^= byte; for (let i = 0; i < 8; i++) checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0); }
  const crc = Buffer.alloc(4); crc.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, crc]);
}
