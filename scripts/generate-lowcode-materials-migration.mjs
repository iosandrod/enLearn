import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frameworkRoot = resolve(repoRoot, 'packages/lowcode-framework/src');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260904100000_lowcode_materials.sql',
);
const adapterSourcePath = resolve(
  frameworkRoot,
  'lowcode/material-runtime/material-adapters.ts',
);

const materialGroups = [
  {
    kind: 'page',
    category: 'page',
    root: resolve(frameworkRoot, 'lowcode/block-materials'),
  },
  {
    kind: 'form',
    category: 'form',
    root: resolve(frameworkRoot, 'lowcode/form-materials'),
  },
];

const generatedSfcSources = {
  'form/lc-basic-control': `<template>
  <component
    :is="control"
    v-bind="field.props"
    :model-value="modelValue"
    @update:model-value="(value) => emit('update:modelValue', value)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Rate, Slider, Stepper } from '../../../components/LegacyWidgets';
import type { LowCodeFormMaterialProps } from '../types';

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: unknown];
}>();
const controls = {
  'lc-rate': Rate,
  'lc-slider': Slider,
  'lc-stepper': Stepper,
};
const control = computed(() =>
  controls[props.field.component as keyof typeof controls] ?? Stepper
);
</script>
`,
};

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return `array[${values.map(sqlString).join(', ')}]::text[]`;
}

function dollarQuoted(value, hash) {
  const delimiter = `$material_${hash.slice(0, 12)}$`;
  if (value.includes(delimiter)) throw new Error(`Unexpected delimiter collision: ${delimiter}`);
  return `${delimiter}${value}${delimiter}`;
}

function readAdapterMetadata(source) {
  const page = new Map();
  const pageBlock = source.match(/export const lowCodeBlockMaterialAdapters[\s\S]*?= \{([\s\S]*?)\n\};/);
  for (const match of pageBlock?.[1]?.matchAll(/\n  ([A-Za-z][A-Za-z0-9]*): \{([\s\S]*?)\n  \},/g) ?? []) {
    const body = match[2];
    const code = body.match(/\btype:\s*'([^']+)'/)?.[1];
    const label = body.match(/\blabel:\s*'([^']+)'/)?.[1];
    if (!code || !label) continue;
    const aliasesSource = body.match(/\baliases:\s*\[([^\]]*)\]/)?.[1] ?? '';
    page.set(match[1], {
      code,
      label,
      version: body.match(/\bmaterialVersion:\s*'([^']+)'/)?.[1] ?? '1.0.0',
      order: Number(body.match(/\border:\s*(\d+)/)?.[1] ?? 0),
      aliases: [...aliasesSource.matchAll(/'([^']+)'/g)].map((item) => item[1]),
    });
  }

  const form = new Map();
  const formBlock = source.match(/const formMaterials:[\s\S]*?= \[([\s\S]*?)\n\];/);
  for (const match of formBlock?.[1]?.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\[([^\]]*)\]\s*,\s*(\d+)\s*\]/g) ?? []) {
    form.set(match[1], {
      code: match[1],
      label: match[2],
      version: '1.0.0',
      order: Number(match[4]),
      aliases: [...match[3].matchAll(/'([^']+)'/g)].map((item) => item[1]),
    });
  }

  return { page, form };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function readDependencies(source) {
  return [...new Set(
    [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]),
  )].sort();
}

async function loadMaterials(adapterMetadata) {
  const materials = [];
  const migrationSnapshots = await readMigrationSnapshots();

  for (const group of materialGroups) {
    const entries = await readdir(group.root, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const componentPath = resolve(group.root, entry.name, 'index.vue');

      const generatedKey = `${group.kind}/${entry.name}`;
      const snapshotKey = `${group.kind}/${group.kind === 'page' ? toCamelCase(entry.name) : entry.name}`;
      const snapshot = migrationSnapshots.get(generatedKey) ?? migrationSnapshots.get(snapshotKey);
      const generatedSource = generatedSfcSources[generatedKey];
      let componentSource;
      try {
        componentSource = await readFile(componentPath, 'utf8');
      } catch {
        componentSource = snapshot?.sourceText ?? generatedSource;
      }
      if (!componentSource) continue;

      const sourcePath = snapshot?.sourcePath ??
        relative(frameworkRoot, componentPath).replaceAll('\\', '/');
      const metadata = adapterMetadata[group.kind].get(
        group.kind === 'page' ? toCamelCase(entry.name) : entry.name,
      );
      if (!metadata) {
        throw new Error(`Could not read adapter metadata for ${sourcePath}`);
      }
      const sourceHash = createHash('sha256').update(componentSource).digest('hex');
      materials.push({
        ...metadata,
        kind: group.kind,
        category: group.category,
        sourcePath,
        sourceText: componentSource,
        sourceHash,
        dependencies: readDependencies(componentSource),
      });
    }
  }

  return materials.sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.order - right.order || left.code.localeCompare(right.code),
  );
}

/**
 * Once a material's source file has been retired, keep the migration
 * generator reproducible by reading its last canonical SFC snapshot from the
 * generated SQL.  This is intentionally a one-way fallback: a present Vue
 * file always wins, while deleted files remain recoverable from the database
 * migration until the catalog is fully deployed.
 */
async function readMigrationSnapshots() {
  let sql;
  try {
    sql = await readFile(migrationPath, 'utf8');
  } catch {
    return new Map();
  }

  const snapshots = new Map();
  const tuplePattern = /\(\s*'(page|form)',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'vue-sfc',\s*'(lowcode\/(?:block|form)-materials\/[^']+\/index\.vue)'\s*,\s*(\$material_[a-f0-9]{12}\$)([\s\S]*?)\4\s*,/g;
  for (const match of sql.matchAll(tuplePattern)) {
    snapshots.set(`${match[1]}/${match[2]}`, {
      sourcePath: match[3],
      sourceText: match[5],
    });
  }
  return snapshots;
}

function renderMaterialInsert(material) {
  const manifest = {
    implementationKey: material.code,
    sourcePath: material.sourcePath,
  };
  const source = dollarQuoted(material.sourceText, material.sourceHash);
  return `(
    ${sqlString(material.kind)},
    ${sqlString(material.code)},
    ${sqlString(material.label)},
    ${sqlString(material.category)},
    'vue-sfc',
    ${sqlString(material.sourcePath)},
    ${source},
    ${sqlString(material.sourceHash)},
    ${sqlString(material.version)},
    ${sqlArray(material.aliases)},
    ${material.order},
    ${sqlString(JSON.stringify(manifest))}::jsonb,
    ${sqlString(JSON.stringify(material.dependencies))}::jsonb,
    'published',
    true,
    true
  )`;
}

function renderMigration(materials) {
  const inserts = materials.map(renderMaterialInsert).join(',\n');
  return `-- Generated by scripts/generate-lowcode-materials-migration.mjs.
-- The table is the canonical catalog and source store for Page and Form materials.

create table if not exists public.lowcode_materials (
  id uuid primary key default gen_random_uuid(),
  material_kind text not null check (material_kind in ('page', 'form')),
  code text not null,
  label text not null,
  description text,
  category text not null,
  renderer_type text not null default 'vue-sfc'
    check (renderer_type in ('code', 'schema', 'vue-sfc')),
  source_path text not null,
  source_text text not null,
  source_hash text not null,
  material_version text not null default '1.0.0',
  aliases text[] not null default '{}',
  sort_order integer not null default 0,
  manifest jsonb not null default '{}'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'deprecated', 'disabled')),
  enabled boolean not null default true,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint lowcode_materials_code_check
    check (code ~ '^[A-Za-z][A-Za-z0-9._-]*$'),
  constraint lowcode_materials_manifest_check
    check (jsonb_typeof(manifest) = 'object'),
  constraint lowcode_materials_dependencies_check
    check (jsonb_typeof(dependencies) = 'array'),
  unique (material_kind, code)
);

create index if not exists idx_lowcode_materials_catalog
  on public.lowcode_materials (material_kind, enabled, status, sort_order, code);

drop trigger if exists set_lowcode_materials_updated_at on public.lowcode_materials;
create trigger set_lowcode_materials_updated_at
before update on public.lowcode_materials
for each row execute function public.set_updated_at();

alter table public.lowcode_materials enable row level security;

drop policy if exists "Authenticated users can read published low-code materials"
  on public.lowcode_materials;
create policy "Authenticated users can read published low-code materials"
on public.lowcode_materials for select to authenticated
using (enabled and status = 'published');

drop policy if exists "Permission holders can manage low-code materials"
  on public.lowcode_materials;
create policy "Permission holders can manage low-code materials"
on public.lowcode_materials for all to authenticated
using (public.has_app_permission('lowcode.pages.manage'))
with check (public.has_app_permission('lowcode.pages.manage'));

grant select, insert, update, delete
  on public.lowcode_materials to authenticated, service_role;

insert into public.lowcode_materials (
  material_kind,
  code,
  label,
  category,
  renderer_type,
  source_path,
  source_text,
  source_hash,
  material_version,
  aliases,
  sort_order,
  manifest,
  dependencies,
  status,
  enabled,
  is_system
)
values
${inserts}
on conflict (material_kind, code) do update set
  label = excluded.label,
  category = excluded.category,
  renderer_type = excluded.renderer_type,
  source_path = excluded.source_path,
  source_text = excluded.source_text,
  source_hash = excluded.source_hash,
  material_version = excluded.material_version,
  aliases = excluded.aliases,
  sort_order = excluded.sort_order,
  manifest = excluded.manifest,
  dependencies = excluded.dependencies,
  status = excluded.status,
  enabled = excluded.enabled,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());
`;
}

const adapterSource = await readFile(adapterSourcePath, 'utf8');
const adapterMetadata = readAdapterMetadata(adapterSource);
const materials = await loadMaterials(adapterMetadata);
const pageCount = materials.filter((item) => item.kind === 'page').length;
const formCount = materials.filter((item) => item.kind === 'form').length;
if (pageCount !== 17 || formCount !== 18) {
  throw new Error(`Expected 17 Page and 18 Form materials, found ${pageCount} and ${formCount}.`);
}

await writeFile(migrationPath, renderMigration(materials), 'utf8');
console.log(`Generated ${relative(repoRoot, migrationPath)} with ${materials.length} materials.`);
