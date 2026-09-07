-- Store the label designer as one replaceable low-code material and compose
-- the print designer page from that material plus a database-backed toolbar.
set statement_timeout = 0;
begin;

insert into public.lowcode_materials (
  material_kind, code, label, description, category, renderer_type,
  source_path, source_text, source_hash, material_version, aliases,
  sort_order, manifest, dependencies, status, enabled, is_system
) values (
  'page', 'label-designer', '标签设计器', '可嵌入低代码页面的标签打印画布组件。',
  'print', 'vue-sfc', 'lowcode/materials/label-designer.vue',
  $material$
<template>
  <section class="label-designer-material" :aria-busy="busy">
    <div v-if="message" class="label-designer-material__message" role="status">{{ message }}</div>
    <TldrawVue
      ref="designer"
      :show-template-controls="false"
      @ready="handleReady"
      @content-change="markDirty"
    />
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useLowCodeHost } from '/core/host';
import { registerLowCodeMaterialRuntimeController } from '/runtime/material-controller-registry';

const props = defineProps<{ block: Record<string, any>; resolvedData: Record<string, any> }>();
const host = useLowCodeHost();
const designer = ref<any>();
const busy = ref(false);
const dirty = ref(false);
const message = ref('');
let unregisterRuntimeController = () => undefined;
let readyPromiseResolve: (() => void) | undefined;
const readyPromise = new Promise<void>((resolve) => { readyPromiseResolve = resolve; });

function editor() {
  return designer.value?.getEditor?.() ?? null;
}

function clone(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function workspace() {
  return clone(designer.value?.getWorkspaceTemplateConfig?.() ?? {});
}

function snapshot() {
  const instance = editor();
  if (!instance) throw new Error('标签设计器尚未就绪。');
  const shapeIds = instance.getCurrentPageShapeIdsSorted();
  const content = shapeIds.length ? instance.getContentFromCurrentPage(shapeIds) : null;
  return { content: clone(content ?? { shapes: [], bindings: [], assets: [] }), workspace: workspace() };
}

async function waitForEditor() {
  if (!editor()) await readyPromise;
  const instance = editor();
  if (!instance) throw new Error('标签设计器尚未就绪。');
  return instance;
}

async function setData(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('标签设计器 setData 的 value 必须是对象。');
  }
  const data = value as Record<string, any>;
  const instance = await waitForEditor();
  const shapeIds = instance.getCurrentPageShapeIdsSorted();
  instance.store.mergeRemoteChanges(() => instance.run(() => {
    if (shapeIds.length) instance.deleteShapes(shapeIds);
    instance.selectNone();
    if (data.content && typeof data.content === 'object') {
      instance.putContentOntoCurrentPage(clone(data.content), { preservePosition: true, select: false });
    }
  }, { history: 'ignore', ignoreShapeLock: true }));
  if (data.workspace && typeof data.workspace === 'object') {
    designer.value?.applyWorkspaceTemplateConfig?.(clone(data.workspace));
  }
  dirty.value = false;
  return snapshot();
}

async function loadData(options: Record<string, any> = {}) {
  const api = host.getServiceApi();
  const routeId = host.getRoute().query?.templateId;
  const nestedOptions = options && typeof options.options === 'object' ? options.options : {};
  const requestedId = String(options.templateId ?? nestedOptions.templateId ?? routeId ?? props.block.templateId ?? '').trim();
  if (!requestedId) return snapshot();
  const rows = await api.invoke<any[]>('admin', 'listItems', {
    resource: 'print_templates',
    filters: { id: requestedId },
    limit: 1,
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('未找到指定的打印模板。');
  message.value = `已加载模板“${row.name || requestedId}”`;
  return setData({ content: row.content, workspace: row.workspace });
}

async function save() {
  const data = snapshot();
  if (!data.content?.shapes?.length) throw new Error('当前画布没有可保存内容。');
  const api = host.getServiceApi();
  const routeId = host.getRoute().query?.templateId;
  const id = String(props.block.templateId ?? routeId ?? '').trim();
  const payload: Record<string, any> = {
    name: String(props.block.templateName || '标签打印模板'),
    content: data.content,
    workspace: data.workspace,
    status: 'active',
    version: 1,
    metadata: { editor: 'tldraw-vue', source: 'lowcode-label-designer', schemaVersion: 1 },
  };
  const result = await api.invoke<any>('admin', 'saveItem', {
    resource: 'print_templates',
    ...(id ? { id } : {}),
    data: payload,
  });
  dirty.value = false;
  message.value = `模板“${result?.name || payload.name}”已保存`;
  return result;
}

async function resetData() {
  const instance = await waitForEditor();
  const shapeIds = instance.getCurrentPageShapeIdsSorted();
  if (shapeIds.length) instance.run(() => instance.deleteShapes(shapeIds), { history: 'ignore', ignoreShapeLock: true });
  dirty.value = false;
  message.value = '已清空画布';
  return snapshot();
}

async function validate() {
  const data = snapshot();
  const valid = Boolean(data.content?.shapes?.length);
  message.value = valid ? '标签模板校验通过' : '请至少放置一个标签元素';
  return valid;
}

function preview() {
  window.dispatchEvent(new CustomEvent('lowcode:print.preview', { detail: snapshot() }));
  message.value = '已发起打印预览';
  return true;
}

function print() {
  window.print();
  return true;
}

function handleReady() {
  readyPromiseResolve?.();
  readyPromiseResolve = undefined;
  void loadData().catch((error) => { message.value = error instanceof Error ? error.message : '模板加载失败'; });
}

function markDirty() { dirty.value = true; }

onMounted(() => {
  unregisterRuntimeController = registerLowCodeMaterialRuntimeController(String(props.block.id), {
    loadData,
    setData,
    getData: snapshot,
    validate,
    resetData,
    save,
    preview,
    print,
    loadTemplate: loadData,
  });
});

onBeforeUnmount(() => unregisterRuntimeController());
</script>

<style scoped>
.label-designer-material { position: relative; display: flex; height: 100%; min-height: 560px; flex-direction: column; overflow: hidden; background: #fff; }
.label-designer-material__message { position: absolute; z-index: 10; top: 8px; right: 12px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; padding: 5px 9px; color: #334155; font-size: 11px; box-shadow: 0 2px 8px rgb(15 23 42 / 10%); }
.label-designer-material :deep(.app-shell) { height: 100%; min-height: 0; }
</style>
  $material$,
  'label-designer-material-v1', '1.0.0', array['print-designer', 'labelDesigner'], 170,
  '{"implementationKey":"label-designer"}'::jsonb,
  '["/core/host","/runtime/material-controller-registry"]'::jsonb,
  'published', true, true
)
on conflict (material_kind, code) do update set
  label = excluded.label,
  description = excluded.description,
  source_text = excluded.source_text,
  source_hash = excluded.source_hash,
  material_version = excluded.material_version,
  aliases = excluded.aliases,
  status = 'published',
  enabled = true,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'material-prop.label-designer', '标签设计器属性', '标签设计器物料的绑定与模板属性。',
  '{"componentKey":"label-designer","title":"标签设计器属性","fields":[{"field":"__block._vid","target":"block","path":"_vid","label":"组件 ID","component":"vxe-input","valueKind":"string","props":{"disabled":true}},{"field":"templateId","target":"props","path":"templateId","label":"模板 ID","component":"vxe-input","valueKind":"string","defaultValue":""},{"field":"templateName","target":"props","path":"templateName","label":"模板名称","component":"vxe-input","valueKind":"string","defaultValue":"标签打印模板"},{"field":"readonly","target":"props","path":"readonly","label":"只读预览","component":"vxe-switch","valueKind":"boolean","defaultValue":false}],"layout":[{"kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础","blocks":[{"kind":"field","field":"__block._vid"},{"kind":"field","field":"templateId"},{"kind":"field","field":"templateName"},{"kind":"field","field":"readonly"}]}]}],"actions":[]}'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
) values
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'loadData', '加载模板', '从打印模板表加载当前标签模板。',
 $action$async function main() { return await this.$node.call('material.loadData', { options: this.event.payload.nodeAction.options }); }$action$,
 '[{"name":"templateId","type":"string","description":"打印模板 ID。"}]'::jsonb, '返回加载后的标签模板。',
 'await this.executeAction({ node: {{nodeId}}, method: "loadData", templateId: "" });', '{}'::jsonb, false, true, true, 10),
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'setData', '设置画布数据', '替换当前标签画布内容和工作区配置。',
 $action$async function main() { return await this.$node.call('material.setData', { value: this.event.payload.nodeAction.options.data }); }$action$,
 '[{"name":"data","type":"object","required":true,"description":"包含 content 和 workspace 的设计数据。"}]'::jsonb, '返回当前标签设计数据。',
 'await this.executeAction({ node: {{nodeId}}, method: "setData", data: {} });', '{}'::jsonb, false, true, true, 20),
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'getData', '获取画布数据', '读取当前标签画布内容和工作区配置。',
 $action$async function main() { return await this.$node.call('material.getData'); }$action$,
 '[]'::jsonb, '返回当前标签设计数据。',
 'const data = await this.executeAction({ node: {{nodeId}}, method: "getData" });', '{}'::jsonb, false, true, true, 30),
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'validate', '校验模板', '确认标签画布至少包含一个元素。',
 $action$async function main() { return await this.$node.call('material.validate'); }$action$,
 '[]'::jsonb, '校验通过返回 true。',
 'const valid = await this.executeAction({ node: {{nodeId}}, method: "validate" });', '{}'::jsonb, false, true, true, 40),
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'resetData', '新建标签', '清空当前画布创建新的标签模板。',
 $action$async function main() { return await this.$node.call('material.resetData'); }$action$,
 '[]'::jsonb, '返回清空后的标签设计数据。',
 'await this.executeAction({ node: {{nodeId}}, method: "resetData" });', '{}'::jsonb, false, true, true, 50),
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'save', '保存模板', '将当前标签画布保存到打印模板表。',
 $action$async function main() { return await this.$node.call('material.save'); }$action$,
 '[]'::jsonb, '返回保存后的打印模板记录。',
 'const result = await this.executeAction({ node: {{nodeId}}, method: "save" });', '{}'::jsonb, false, true, true, 60),
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'preview', '打印预览', '发起当前标签模板的打印预览事件。',
 $action$async function main() { return await this.$node.call('material.preview'); }$action$,
 '[]'::jsonb, '返回 true。',
 'await this.executeAction({ node: {{nodeId}}, method: "preview" });', '{}'::jsonb, false, true, true, 70),
('labelDesigner', '标签设计器', 'ri-price-tag-3-line', 'print', '打印', '调用浏览器打印当前标签设计页面。',
 $action$async function main() { return await this.$node.call('material.print'); }$action$,
 '[]'::jsonb, '返回 true。',
 'await this.executeAction({ node: {{nodeId}}, method: "print" });', '{}'::jsonb, false, true, true, 80)
on conflict (node_type, action_code) do update set
  node_label = excluded.node_label,
  node_icon = excluded.node_icon,
  label = excluded.label,
  description = excluded.description,
  source_code = excluded.source_code,
  parameters = excluded.parameters,
  returns = excluded.returns,
  insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled,
  is_system = excluded.is_system,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

-- Older deployments registered the same route under this legacy page code.
-- Normalize it before the canonical upsert so the route unique constraint is
-- preserved while the page is replaced by the low-code label designer page.
update public.admin_routes
set page_code = null, updated_at = timezone('utc'::text, now())
where page_code = 'advanced-print-designer';

update public.lowcode_pages
set code = 'print-designer', updated_at = timezone('utc'::text, now())
where code = 'advanced-print-designer'
  and route = '/dashboard/advanced/print-designer'
  and not exists (select 1 from public.lowcode_pages where code = 'print-designer');

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'print-designer', '/dashboard/advanced/print-designer', '打印设计器',
  '由低代码按钮组和标签设计器物料组成的打印设计器。', 'custom', 'blank',
  'published', true,
  $json$
  {
    "schemaVersion": 1,
    "code": "print-designer",
    "route": "/dashboard/advanced/print-designer",
    "title": "打印设计器",
    "description": "低代码标签打印设计器。",
    "pageType": "custom",
    "layout": "blank",
    "status": "published",
    "keepAlive": true,
    "dataSources": {},
    "blocks": [
      {
        "id": "label-designer-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          { "code": "label-new", "label": "新建标签", "icon": "ri-file-add-line", "script": "async function main() { return await this.executeAction({ node: 'label-designer-canvas', method: 'resetData' }); }" },
          { "code": "label-load", "label": "加载模板", "icon": "ri-folder-open-line", "script": "async function main() { return await this.executeAction({ node: 'label-designer-canvas', method: 'loadData' }); }" },
          { "code": "label-save", "label": "保存模板", "status": "primary", "icon": "ri-save-3-line", "script": "async function main() { return await this.executeAction({ node: 'label-designer-canvas', method: 'save' }); }" },
          { "code": "label-validate", "label": "校验", "icon": "ri-shield-check-line", "script": "async function main() { return await this.executeAction({ node: 'label-designer-canvas', method: 'validate' }); }" },
          { "code": "label-preview", "label": "打印预览", "icon": "ri-eye-line", "script": "async function main() { return await this.executeAction({ node: 'label-designer-canvas', method: 'preview' }); }" },
          { "code": "label-print", "label": "打印", "status": "success", "icon": "ri-printer-line", "script": "async function main() { return await this.executeAction({ node: 'label-designer-canvas', method: 'print' }); }" }
        ]
      },
      {
        "id": "label-designer-canvas",
        "kind": "label-designer",
        "materialVersion": "1.0.0",
        "templateName": "标签打印模板"
      }
    ]
  }
  $json$::jsonb,
  1, timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'print-designer'
on conflict (page_id, version) do update set schema = excluded.schema, published_at = excluded.published_at;

update public.admin_routes
set page_code = 'print-designer', updated_at = timezone('utc'::text, now())
where code = 'advanced-print-designer';

select pg_notify('pgrst', 'reload schema');
commit;
