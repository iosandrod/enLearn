import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd().toLowerCase().endsWith('api') ? '..' : '.');
const sourcePath = resolve(repoRoot, 'packages/lowcode-framework/src/lowcode/block-materials/planning-bom/index.vue');
const targetPath = resolve(repoRoot, 'supabase/migrations/20260908032000_planning_bom_vxe_tree_material.sql');

async function main() {
  const source = await readFile(sourcePath, 'utf8');
  const tag = '$bom_route_material_v3$';
  if (source.includes(tag)) throw new Error(`Source unexpectedly contains ${tag}`);

const sql = `begin;

do $migration$
declare
  v_source_text text := ${tag}
${source}
${tag};
begin
  update public.lowcode_materials
  set source_text = v_source_text,
      source_hash = encode(digest(convert_to(v_source_text, 'UTF8'), 'sha256'), 'hex'),
      material_version = '1.3.0',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'page'
    and code = 'planningBom';

  if not found then
    raise exception 'Low-code page material planningBom does not exist.';
  end if;
end
$migration$;

select pg_notify('pgrst', 'reload schema');
commit;
`;

  await writeFile(targetPath, sql, 'utf8');
  console.log(JSON.stringify({ targetPath, bytes: Buffer.byteLength(sql) }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
