import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  const root = resolve(process.cwd().toLowerCase().endsWith('api') ? '..' : '.');
  const source = await readFile(resolve(root, 'packages/lowcode-framework/src/lowcode/block-materials/planning-bom/index.vue'), 'utf8');
  const tag = '$bom_route_material_v4$';
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
      material_version = '1.4.0',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'page' and code = 'planningBom';
  if not found then raise exception 'Low-code page material planningBom does not exist.'; end if;
end
$migration$;
select pg_notify('pgrst', 'reload schema');
commit;
`;
  const target = resolve(root, 'supabase/migrations/20260908035000_planning_bom_create_route_action.sql');
  await writeFile(target, sql, 'utf8');
  console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql) }));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
