import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20260904100000_lowcode_materials.sql', import.meta.url);
let snapshotPromise;

async function readSnapshots() {
  const sql = await readFile(migrationUrl, 'utf8');
  const snapshots = new Map();
  const tuplePattern = /\(\s*'(page|form)',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'vue-sfc',\s*'(lowcode\/(?:block|form)-materials\/[^']+\/index\.vue)'\s*,\s*(\$material_[a-f0-9]{12}\$)([\s\S]*?)\4\s*,/g;
  for (const match of sql.matchAll(tuplePattern)) {
    snapshots.set(`${match[1]}/${match[2]}`, match[5]);
  }
  return snapshots;
}

export async function readLowCodeMaterialSource(kind, code) {
  snapshotPromise ??= readSnapshots();
  const snapshots = await snapshotPromise;
  const source = snapshots.get(`${kind}/${code}`);
  if (!source) throw new Error(`Material source not found: ${kind}/${code}`);
  return source;
}
