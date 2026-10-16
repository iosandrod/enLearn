import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { build, Platform, Arch } from 'electron-builder';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = resolve('release-desktop');
await build({
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.x64),
  config: { electronDist: dirname(electronPath), directories: { output } }
});
const filename = `EnLearn-Silent-Print-${metadata.version}-x64-setup.exe`;
const data = await readFile(resolve(output, filename));
const sha512 = createHash('sha512').update(data).digest('base64');
await writeFile(resolve(output, 'latest.yml'), `version: ${metadata.version}\nfiles:\n  - url: ${filename}\n    sha512: ${sha512}\n    size: ${data.length}\npath: ${filename}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`);
console.log(`Windows installers and update manifest: ${output}`);
