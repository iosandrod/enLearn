import assert from 'node:assert/strict';
import { createZip } from './print-zip';

const zip = createZip([
  { name: 'one.txt', mimeType: 'text/plain', body: Buffer.from('one') },
  { name: 'two.txt', mimeType: 'text/plain', body: Buffer.from('two') }
]);

assert.equal(zip.readUInt32LE(0), 0x04034b50);
assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
assert.equal(zip.readUInt16LE(zip.length - 12), 2);
assert.ok(zip.includes(Buffer.from('one.txt')));
assert.ok(zip.includes(Buffer.from('two.txt')));

console.log('print zip tests passed');
