begin;

-- The entity designer is now a database-defined page.  Its tab/form layout is
-- kept in lowcode_pages; the ER canvas itself is a reusable lowcode_materials row.
insert into public.lowcode_materials (
  material_kind, code, label, description, category, renderer_type,
  source_path, source_text, source_hash, material_version, aliases,
  sort_order, manifest, dependencies, status, enabled, is_system
)
values (
  'page', 'entity-design-flow', '实体关系画布', '实体设计器中心 ER 画布物料。', 'entity', 'vue-sfc',
  'lowcode/block-materials/entity-design-flow/index.vue',
  $material_c42b7ad9e2b9$<template>
  <section class="entity-design-flow-material" :style="{ minHeight: `${height}px` }">
    <div class="entity-design-flow-material__toolbar">
      <strong>{{ block.title || '实体关系画布' }}</strong>
      <span>{{ tables.length }} 张表 · {{ relations.length }} 条关系</span>
    </div>
    <div class="entity-design-flow-material__canvas">
      <article
        v-for="table in tables"
        :key="table.id"
        class="entity-design-flow-material__table"
        :style="{ left: `${table.position_x || 40}px`, top: `${table.position_y || 40}px` }"
        @click="selectTable(table)"
      >
        <header><strong>{{ table.title || table.table_name }}</strong><small>{{ table.full_name || table.table_name }}</small></header>
        <div v-for="column in table.columns || []" :key="column.id || column.column_name" class="entity-design-flow-material__column">
          <span>{{ column.column_name }}</span><em>{{ column.data_type }}</em>
        </div>
      </article>
      <p v-if="!tables.length" class="entity-design-flow-material__empty">暂无实体表，请先创建或加载实体。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LowCodePageEntityDesignFlowBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageEntityDesignFlowBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
type EntityColumn = Record<string, any> & { id?: string | number; column_name?: string; data_type?: string };
type EntityTable = Record<string, any> & {
  id: string | number;
  title?: string;
  table_name?: string;
  full_name?: string;
  position_x?: number | string;
  position_y?: number | string;
  columns?: EntityColumn[];
};
const block = computed(() => props.block);
const graph = computed<Record<string, unknown>>(() => {
  const value = props.resolvedData[block.value.sourceKey ?? ''];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
});
const tables = computed<EntityTable[]>(() =>
  Array.isArray(graph.value.tables)
    ? graph.value.tables.filter((table): table is EntityTable =>
      Boolean(table) && typeof table === 'object' && !Array.isArray(table))
    : [],
);
const relations = computed<Record<string, any>[]>(() =>
  Array.isArray(graph.value.relations)
    ? graph.value.relations.filter((relation): relation is Record<string, any> =>
      Boolean(relation) && typeof relation === 'object' && !Array.isArray(relation))
    : [],
);
const height = computed(() => Number(block.value.height) || 560);

function selectTable(table: EntityTable) {
  emit('runtimeEvent', {
    name: 'entityDesign.tableSelect',
    blockId: block.value.id,
    blockKind: block.value.kind,
    timestamp: Date.now(),
    payload: { row: table },
  });
}
</script>

<style scoped>
.entity-design-flow-material { position: relative; overflow: auto; min-width: 640px; border: 1px solid #dfe5ec; border-radius: 10px; background: #f7f9fc; }
.entity-design-flow-material__toolbar { position: sticky; z-index: 2; top: 0; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #dfe5ec; background: rgb(255 255 255 / 94%); padding: 10px 14px; }
.entity-design-flow-material__toolbar span, .entity-design-flow-material__empty { color: #667085; font-size: 12px; }
.entity-design-flow-material__canvas { position: relative; min-height: 500px; background-image: linear-gradient(#94a3b829 1px, transparent 1px), linear-gradient(90deg, #94a3b829 1px, transparent 1px); background-size: 28px 28px; }
.entity-design-flow-material__table { position: absolute; width: 250px; overflow: hidden; border: 1px solid #b8c7dc; border-radius: 8px; background: #fff; box-shadow: 0 8px 18px rgb(15 23 42 / 10%); cursor: pointer; }
.entity-design-flow-material__table header { display: grid; gap: 2px; border-bottom: 1px solid #dfe5ec; background: #eef6ff; padding: 9px 11px; }
.entity-design-flow-material__table header small { color: #667085; font-size: 10px; }
.entity-design-flow-material__column { display: flex; justify-content: space-between; border-bottom: 1px solid #eef2f6; padding: 6px 11px; color: #344054; font-size: 11px; }
.entity-design-flow-material__column em { color: #667085; font-style: normal; }
.entity-design-flow-material__empty { padding: 40px; text-align: center; }
</style>
$material_c42b7ad9e2b9$,
  'c42b7ad9e2b9fc1f1ce49540711412448da72f8123c9a4bbe7ec24ca4db9ce01', '1.0.0', array['entityFlow'], 145,
  '{"implementationKey":"entity-design-flow","sourcePath":"lowcode/block-materials/entity-design-flow/index.vue"}'::jsonb,
  '[]'::jsonb, 'published', true, true
)
on conflict (material_kind, code) do update set
  label = excluded.label, description = excluded.description, category = excluded.category,
  source_path = excluded.source_path, source_text = excluded.source_text,
  source_hash = excluded.source_hash, material_version = excluded.material_version,
  aliases = excluded.aliases, sort_order = excluded.sort_order, manifest = excluded.manifest,
  dependencies = excluded.dependencies, status = excluded.status, enabled = excluded.enabled,
  is_system = excluded.is_system, updated_at = timezone('utc'::text, now());

update public.lowcode_materials
set source_hash = encode(digest(convert_to(source_text, 'UTF8'), 'sha256'), 'hex')
where material_kind = 'page' and code = 'entity-design-flow';

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
)
values (
  'entity_design', '/dashboard/entity-design', '实体设计器',
  '以低代码配置管理实体、字段、关系与 ER 画布。', 'custom', 'dashboard', 'published', true,
  $page_entity_design$
{
  "schemaVersion":1,
  "code":"entity_design",
  "route":"/dashboard/entity-design",
  "title":"实体设计器",
  "pageType":"custom",
  "description":"以低代码配置管理实体、字段、关系与 ER 画布。",
  "layout":"dashboard",
  "status":"published",
  "keepAlive":true,
  "dataSources":{
    "entityGraph":{"key":"entityGraph","label":"实体关系图","sourceType":"custom","serviceName":"entityDesign","serviceMethod":"listDesign","autoLoad":true},
    "entityTables":{"key":"entityTables","label":"实体列表","sourceType":"custom","serviceName":"entityDesign","serviceMethod":"listItems","postData":{"resource":"entity_design_tables","tableName":"entity_design_tables","limit":500},"autoLoad":true},
    "entityColumns":{"key":"entityColumns","label":"字段列表","sourceType":"custom","serviceName":"entityDesign","serviceMethod":"listItems","postData":{"resource":"entity_design_columns","tableName":"entity_design_columns","filters":{"table_id":"__none__"},"limit":1000},"autoLoad":false},
    "entityRelations":{"key":"entityRelations","label":"关系列表","sourceType":"custom","serviceName":"entityDesign","serviceMethod":"listItems","postData":{"resource":"entity_design_relations","tableName":"entity_design_relations","limit":1000},"autoLoad":true}
  },
  "eventHandlers":[
    {"event":"grid.rowCurrentChange","blockId":"entity_tables_grid","directives":[{"type":"formValues","blockId":"entity_table_form","values":{"id":"{{ event.row.id }}","code":"{{ event.row.code }}","schema_name":"{{ event.row.schema_name }}","table_name":"{{ event.row.table_name }}","title":"{{ event.row.title }}","description":"{{ event.row.description }}","primary_key":"{{ event.row.primary_key }}"}},{"type":"searchFilters","sourceKey":"entityColumns","mode":"replace","values":{"table_id":"{{ event.row.id }}"}},{"type":"refreshSources","sourceKeys":["entityColumns"]}]},
    {"event":"entityDesign.tableSelect","blockId":"entity_design_flow","directives":[{"type":"formValues","blockId":"entity_table_form","values":{"id":"{{ event.row.id }}","code":"{{ event.row.code }}","schema_name":"{{ event.row.schema_name }}","table_name":"{{ event.row.table_name }}","title":"{{ event.row.title }}","description":"{{ event.row.description }}","primary_key":"{{ event.row.primary_key }}"}},{"type":"searchFilters","sourceKey":"entityColumns","mode":"replace","values":{"table_id":"{{ event.row.id }}"}},{"type":"refreshSources","sourceKeys":["entityColumns"]}]},
    {"event":"grid.rowCurrentChange","blockId":"entity_columns_grid","directives":[{"type":"formValues","blockId":"entity_column_form","values":{"id":"{{ event.row.id }}","table_id":"{{ event.row.table_id }}","column_name":"{{ event.row.column_name }}","label":"{{ event.row.label }}","data_type":"{{ event.row.data_type }}","storage_kind":"{{ event.row.storage_kind }}","expression":"{{ event.row.expression }}","default_value":"{{ event.row.default_value }}","is_required":"{{ event.row.is_required }}","is_unique":"{{ event.row.is_unique }}"}}]}
  ],
  "blocks":[
    {"id":"entity_toolbar","kind":"buttonGroup","title":"实体操作","align":"left","gap":8,"actions":[{"code":"new","label":"新建实体","type":"button","status":"primary","directives":[{"type":"formValues","blockId":"entity_table_form","values":{"id":"","code":"","schema_name":"public","table_name":"","title":"","description":"","primary_key":"id"}}]},{"code":"refresh","label":"刷新","type":"button","directives":[{"type":"refreshSources","sourceKeys":["entityGraph","entityTables","entityRelations"]}]}],"materialVersion":"1.0.0"},
    {"id":"entity_workspace","kind":"container","columns":3,"columnSpans":[5,10,5],"gap":12,"blocks":[
      {"id":"entity_left_tabs","kind":"tabs","title":"实体","defaultKey":"list","tabs":[{"key":"list","label":"实体列表","blocks":[{"id":"entity_tables_grid","kind":"grid","sourceKey":"entityTables","tableType":"main","schema":{"grid":{"border":true,"stripe":true,"height":"100%","rowConfig":{"keyField":"id","isCurrent":true},"columns":[{"type":"seq","title":"序号","width":60},{"field":"title","title":"名称","minWidth":140},{"field":"table_name","title":"表名","minWidth":160},{"field":"status","title":"状态","width":90}]}}}]},{"key":"form","label":"实体表单","blocks":[{"id":"entity_table_form","kind":"form","title":"实体信息","dataSource":{"key":"entity_table_form","sourceType":"custom","serviceName":"entityDesign","serviceMethod":"saveTable","saveServiceName":"entityDesign","saveMethod":"saveTable","postData":{}},"schema":{"columns":1,"fields":[{"field":"id","label":"ID","component":"vxe-input","props":{"disabled":true}},{"field":"code","label":"实体编码","component":"vxe-input","rules":[{"required":true,"message":"请输入实体编码"}]},{"field":"schema_name","label":"Schema","component":"vxe-input"},{"field":"table_name","label":"表名","component":"vxe-input","rules":[{"required":true,"message":"请输入表名"}]},{"field":"title","label":"名称","component":"vxe-input","rules":[{"required":true,"message":"请输入实体名称"}]},{"field":"description","label":"描述","component":"vxe-textarea"},{"field":"primary_key","label":"主键","component":"vxe-input","defaultValue":"id"}],"actions":[{"code":"submit","label":"保存实体","type":"submit","status":"primary"}]},"initialValues":{"schema_name":"public","primary_key":"id"}}]}],"materialVersion":"1.0.0"},
      {"id":"entity_design_flow","kind":"entity-design-flow","title":"实体关系画布","height":620,"sourceKey":"entityGraph","materialVersion":"1.0.0"},
      {"id":"entity_right_tabs","kind":"tabs","title":"字段与关系","defaultKey":"columns","tabs":[{"key":"columns","label":"字段列表","blocks":[{"id":"entity_columns_grid","kind":"grid","sourceKey":"entityColumns","tableType":"detail","schema":{"grid":{"border":true,"stripe":true,"height":"100%","rowConfig":{"keyField":"id","isCurrent":true},"columns":[{"type":"seq","title":"序号","width":60},{"field":"column_name","title":"字段","minWidth":140},{"field":"label","title":"名称","minWidth":120},{"field":"data_type","title":"类型","width":100}]}}},{"id":"entity_column_form","kind":"form","title":"字段表单","dataSource":{"key":"entity_column_form","sourceType":"custom","serviceName":"entityDesign","serviceMethod":"saveColumn","saveServiceName":"entityDesign","saveMethod":"saveColumn","postData":{}},"schema":{"columns":1,"fields":[{"field":"id","label":"ID","component":"vxe-input","props":{"disabled":true}},{"field":"table_id","label":"实体 ID","component":"vxe-input","props":{"disabled":true}},{"field":"column_name","label":"字段名","component":"vxe-input","rules":[{"required":true,"message":"请输入字段名"}]},{"field":"label","label":"字段名称","component":"vxe-input"},{"field":"data_type","label":"数据类型","component":"vxe-input"},{"field":"storage_kind","label":"存储类型","component":"vxe-select","options":[{"label":"物理","value":"physical"},{"label":"虚拟","value":"virtual"}]},{"field":"expression","label":"表达式","component":"vxe-textarea"},{"field":"default_value","label":"默认值","component":"vxe-input"},{"field":"is_required","label":"必填","component":"vxe-switch"},{"field":"is_unique","label":"唯一","component":"vxe-switch"}],"actions":[{"code":"submit","label":"保存字段","type":"submit","status":"primary"}]}}]},{"key":"relations","label":"关系列表","blocks":[{"id":"entity_relations_grid","kind":"grid","sourceKey":"entityRelations","tableType":"detail","schema":{"grid":{"border":true,"stripe":true,"height":"100%","rowConfig":{"keyField":"id"},"columns":[{"type":"seq","title":"序号","width":60},{"field":"source_column_name","title":"源字段","minWidth":140},{"field":"target_column_name","title":"目标字段","minWidth":140},{"field":"relation_type","title":"关系类型","width":110}]}}}]}],"materialVersion":"1.0.0"}
    ]}
  ]
}
  $page_entity_design$::jsonb, 1, timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route, title = excluded.title, description = excluded.description,
  page_type = excluded.page_type, layout = excluded.layout, status = excluded.status,
  keep_alive = excluded.keep_alive, schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.published_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'entity_design'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');
commit;
