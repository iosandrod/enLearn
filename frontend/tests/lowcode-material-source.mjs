import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const migrationDirectoryUrl = new URL('../../supabase/migrations/', import.meta.url);
const execFileAsync = promisify(execFile);
let snapshotPromise;

async function readSnapshots() {
  const snapshots = new Map();
  const migrationNames = (await readdir(migrationDirectoryUrl, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
  for (const migrationName of migrationNames) {
    const sql = await readFile(new URL(migrationName, migrationDirectoryUrl), 'utf8');
    const tuplePattern = /\(\s*'(page|form)',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'vue-sfc',\s*'(lowcode\/(?:block|form)-materials\/[^']+\/index\.vue)'\s*,\s*(\$material_[a-f0-9]{12}\$)([\s\S]*?)\4\s*,/g;
    for (const match of sql.matchAll(tuplePattern)) {
      snapshots.set(`${match[1]}/${match[2]}`, match[5]);
    }
    const bomSource = sql.match(/v_source_text\s+text\s*:=\s*\$bom_route_material\$([\s\S]*?)\$bom_route_material\$/i);
    if (bomSource?.[1]) snapshots.set('page/planningBom', bomSource[1].replace(/^\r?\n/, ''));
  }
  if (!snapshots.has('page/tabs')) {
    const archivePath = fileURLToPath(new URL('原始迁移无需执行.rar', migrationDirectoryUrl));
    const archiveEntry = '20260904100000_lowcode_materials.sql';
    const sevenZipCandidates = [
      'C:\\Program Files\\NVIDIA Corporation\\NVIDIA GeForce Experience\\7z.exe',
      '7z'
    ];
    for (const executable of sevenZipCandidates) {
      try {
        const result = await execFileAsync(executable, ['e', '-so', archivePath, archiveEntry], { maxBuffer: 8 * 1024 * 1024 });
        const tuplePattern = /\(\s*'(page|form)',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'vue-sfc',\s*'(lowcode\/(?:block|form)-materials\/[^']+\/index\.vue)'\s*,\s*(\$material_[a-f0-9]{12}\$)([\s\S]*?)\4\s*,/g;
        for (const match of result.stdout.matchAll(tuplePattern)) snapshots.set(`${match[1]}/${match[2]}`, match[5]);
        break;
      } catch {
        // Try the next executable or fall back to local sources below.
      }
    }
  }
  return snapshots;
}

export async function readLowCodeMaterialSource(kind, code) {
  snapshotPromise ??= readSnapshots();
  const snapshots = await snapshotPromise;
  const localDirectory = kind === 'page'
    ? '../../packages/lowcode-framework/src/lowcode/block-materials/'
    : '../../packages/lowcode-framework/src/lowcode/form-materials/';
  const localCode = code.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  try {
    return await readFile(new URL(`${localDirectory}${localCode}/index.vue`, import.meta.url), 'utf8');
  } catch {
    const source = snapshots.get(`${kind}/${code}`);
    if (source) return source;
    throw new Error(`Material source not found: ${kind}/${code}`);
  }
}
