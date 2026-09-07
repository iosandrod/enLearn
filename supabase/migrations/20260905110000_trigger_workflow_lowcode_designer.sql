-- Store the Trigger workflow orchestrator as a low-code page composed of a
-- button group and one flow material. Node and edge editors continue to be
-- resolved from the trigger-workflow.* rows in lowcode_form_definitions.
begin;

insert into public.lowcode_materials (
  material_kind, code, label, description, category, renderer_type,
  source_path, source_text, source_hash, material_version, aliases,
  sort_order, manifest, dependencies, status, enabled, is_system
) values (
  'page', 'trigger-workflow-designer', '触发器编排画布', 'Trigger.dev 触发器编排器的低代码 Flow 物料。',
  'workflow', 'vue-sfc', 'lowcode/materials/trigger-workflow-designer.vue',
  $material$
<template>
  <div class="trigger-workflow-material">
    <span v-if="message" class="trigger-workflow-material__message">{{ message }}</span>
    <TriggerWorkflowEditor
      ref="designer"
      v-model="model"
      height="100%"
      :busy="busy"
      :can-run="canRun"
      :readonly="readonly"
      :minimal="true"
      :node-form-schemas="nodeSchemas"
      :edge-form-schema="edgeSchema"
      @validation="validationIssues = $event"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLowCodeHost } from '/core/host';
import { loadLowCodeFormDefinition } from '/lowcode/form-definition-loader';
import { registerLowCodeMaterialRuntimeController } from '/runtime/material-controller-registry';
const props = defineProps<{ block: Record<string, any>; resolvedData: Record<string, any> }>();
const host = useLowCodeHost();
const designer = ref<any>();
const savedModelId = ref('');
const workflowJob = ref<any>();
const validationIssues = ref<any[]>([]);
const busy = ref(false);
const message = ref('');
const readonly = computed(() => props.block.readonly === true);
const canRun = computed(() => workflowJob.value?.status === 'enabled');
const nodeCodes: Record<string, string> = {
  start: 'trigger-workflow.node.start',
  schedule: 'trigger-workflow.node.schedule',
  webhook: 'trigger-workflow.node.webhook',
  manualApproval: 'trigger-workflow.node.manual-approval',
  condition: 'trigger-workflow.node.condition',
  parallel: 'trigger-workflow.node.parallel',
  task: 'trigger-workflow.node.task',
  triggerAndWait: 'trigger-workflow.node.trigger-and-wait',
  batchTrigger: 'trigger-workflow.node.batch-trigger',
  wait: 'trigger-workflow.node.wait',
  dataSource: 'trigger-workflow.node.data-source',
  transform: 'trigger-workflow.node.transform',
  dataSink: 'trigger-workflow.node.data-sink',
  agent: 'trigger-workflow.node.agent',
  tool: 'trigger-workflow.node.tool',
  memory: 'trigger-workflow.node.memory',
  humanReview: 'trigger-workflow.node.human-review',
  end: 'trigger-workflow.node.end'
};
const nodeSchemas = ref<Record<string, any>>({});
const edgeSchema = ref<any>();
const blank = () => ({
  schemaVersion: 1,
  code: `trigger_workflow_${Date.now().toString(36)}`,
  name: '未命名流程',
  kind: 'custom',
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 380, y: 48 } },
    { id: 'end', type: 'end', name: '结束', position: { x: 380, y: 340 } }
  ],
  edges: [{ id: 'edge_start_end', source: 'start', target: 'end' }]
});
const initialModel = props.block.model && typeof props.block.model === 'object'
  ? props.block.model
  : props.resolvedData?.[String(props.block.sourceKey || 'triggerWorkflowModel')];
const model = ref<any>(initialModel && typeof initialModel === 'object' ? initialModel : blank());
let unregisterRuntimeController = () => undefined;

function readSchema(value: unknown) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as any).nodes) || !Array.isArray((parsed as any).edges)) {
    throw new Error('流程记录不包含有效的触发器编排结构。');
  }
  return parsed;
}

async function loadFormSchemas() {
  const api = host.getServiceApi();
  const entries = await Promise.all(Object.entries(nodeCodes).map(async ([type, code]) => {
    try { return [type, (await loadLowCodeFormDefinition(api, code)).schema] as const; }
    catch { return [type, undefined] as const; }
  }));
  nodeSchemas.value = Object.fromEntries(entries.filter((entry) => entry[1]));
  try { edgeSchema.value = (await loadLowCodeFormDefinition(api, 'trigger-workflow.edge')).schema; }
  catch { edgeSchema.value = undefined; }
}

async function load(options: Record<string, unknown> = {}) {
  const modelId = String(options.modelId || '').trim();
  if (!modelId) return model.value;
  busy.value = true;
  try {
    const record = await host.getServiceApi().invoke<any>('workflow', 'getModel', { modelId });
    if (record.documentType !== 'trigger-workflow') throw new Error('所选记录不是触发器编排流程。');
    savedModelId.value = record.id;
    model.value = readSchema(record.draftSchema);
    designer.value?.loadSchema?.(model.value);
    await refresh();
    message.value = `已加载“${record.name}”`;
    return model.value;
  } finally { busy.value = false; }
}

function setData(value: unknown) {
  model.value = readSchema(value);
  designer.value?.loadSchema?.(model.value);
  return model.value;
}
function getData() { return designer.value?.getSchema?.() ?? model.value; }
function validate() {
  validationIssues.value = designer.value?.validate?.() ?? [];
  return validationIssues.value;
}
function createNew() {
  savedModelId.value = '';
  workflowJob.value = undefined;
  model.value = blank();
  designer.value?.loadSchema?.(model.value);
  message.value = '已新建草稿';
  return model.value;
}
function loadTemplate(kind = 'approval') {
  const next = designer.value?.loadTemplate?.(kind);
  if (next) model.value = next;
  savedModelId.value = '';
  workflowJob.value = undefined;
  message.value = '模板已载入';
  return model.value;
}
function autoLayout() { return designer.value?.autoLayout?.(); }
function compile() {
  const result = designer.value?.compile?.();
  if (!result) throw new Error('流程校验未通过，无法编译。');
  message.value = '流程编译通过';
  return result;
}
async function save() {
  busy.value = true;
  try {
    const schema = getData();
    const errors = (designer.value?.validate?.() ?? []).filter((item: any) => item.level === 'error');
    if (errors.length) throw new Error(`流程存在 ${errors.length} 项错误。`);
    const payload = { code: schema.code, name: schema.name, documentType: 'trigger-workflow', schema };
    const record = savedModelId.value
      ? await host.getServiceApi().invoke<any>('workflow', 'updateModel', { modelId: savedModelId.value, ...payload })
      : await host.getServiceApi().invoke<any>('workflow', 'saveModel', payload);
    savedModelId.value = record.id;
    model.value = { ...schema, id: record.id };
    designer.value?.loadSchema?.(model.value);
    message.value = `已保存“${record.name}”`;
    return record;
  } finally { busy.value = false; }
}
async function enable() {
  if (!savedModelId.value) await save();
  busy.value = true;
  try {
    const definition = designer.value?.buildJob?.();
    if (!definition) throw new Error('当前流程无法编译为作业。');
    let job = await host.getServiceApi().invoke<any>('workflow', 'upsertJob', definition);
    job = await host.getServiceApi().invoke<any>('workflow', 'updateJobStatus', { jobId: job.id, status: 'enabled' });
    workflowJob.value = job;
    message.value = '作业已编译并启用';
    return job;
  } finally { busy.value = false; }
}
async function run() {
  if (!workflowJob.value) await refresh();
  if (workflowJob.value?.status !== 'enabled') throw new Error('请先启用当前流程作业。');
  busy.value = true;
  try {
    const result = await host.getServiceApi().invoke<any>('workflow', 'runJob', {
      jobId: workflowJob.value.id,
      payload: { requestedAt: new Date().toISOString() }
    });
    message.value = '流程已开始运行';
    return result;
  } finally { busy.value = false; }
}
async function refresh() {
  const jobs = await host.getServiceApi().invoke<any[]>('workflow', 'listItems', { itemType: 'jobs' });
  workflowJob.value = jobs.find((item) => item.code === model.value.code);
  message.value = workflowJob.value ? `作业状态：${workflowJob.value.status}` : '当前流程尚未启用';
  return workflowJob.value;
}

onMounted(() => {
  unregisterRuntimeController = registerLowCodeMaterialRuntimeController(String(props.block.id), {
    loadData: load,
    setData,
    getData,
    validate,
    resetData: createNew,
    save,
    autoLayout,
    compile,
    enable,
    run,
    refresh,
    loadTemplate
  });
  void Promise.all([loadFormSchemas(), refresh()]).catch((error) => {
    message.value = error instanceof Error ? error.message : '初始化失败';
  });
});
onBeforeUnmount(() => unregisterRuntimeController());
</script>
<style scoped>
.trigger-workflow-material{position:relative;height:100%;min-height:560px;overflow:hidden}
.trigger-workflow-material__message{position:absolute;right:12px;top:8px;z-index:10;max-width:320px;overflow:hidden;border:1px solid #dbe3ea;border-radius:999px;background:rgb(255 255 255 / 94%);padding:4px 9px;color:#475569;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.trigger-workflow-material :deep(.trigger-editor){height:100%;border-radius:8px}
</style>
  $material$,
  'trigger-workflow-material-v1', '1.0.0', array['trigger-flow'], 101,
  '{"implementationKey":"trigger-workflow-designer"}'::jsonb,
  '["/core/host","/lowcode/form-definition-loader","/runtime/material-controller-registry"]'::jsonb,
  'published', true, true
)
on conflict (material_kind, code) do update set
  label = excluded.label,
  description = excluded.description,
  source_text = excluded.source_text,
  source_hash = excluded.source_hash,
  material_version = excluded.material_version,
  aliases = excluded.aliases,
  manifest = excluded.manifest,
  dependencies = excluded.dependencies,
  status = 'published',
  enabled = true,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'trigger-workflow-designer', '/dashboard/trigger-workflow/designer', '触发器编排器',
  '由数据库按钮组、Trigger Flow 物料和动态节点表单组成的触发器编排器。',
  'custom', 'blank', 'published', true,
  $json$
  {
    "schemaVersion": 1,
    "code": "trigger-workflow-designer",
    "route": "/dashboard/trigger-workflow/designer",
    "title": "触发器编排器",
    "pageType": "custom",
    "layout": "blank",
    "status": "published",
    "keepAlive": true,
    "dataSources": {},
    "scriptPolicy": { "capabilities": ["action.execute", "dialog.confirmLowCodePage", "pageFunction.execute"] },
    "functions": [
      { "name": "newWorkflow", "label": "新建流程", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"resetData\" });" },
      { "name": "loadWorkflow", "label": "加载流程", "enabled": true, "script": "const result = await this.$dialog.confirmLowCodePage({ pageCode: \"trigger-workflow-models\", title: \"加载流程\", confirmLabel: \"加载\", cancelLabel: \"取消\", requireSelection: true, includeEventHistory: false, dialog: { id: \"trigger-workflow-picker-dialog\" } });\nif (!result || result.action !== \"confirm\") return null;\nconst row = result.row || result.selectedRow || result.selectedRows?.[0] || result.payload?.row || result.payload?.selectedRows?.[0];\nif (!row?.id) throw new Error(\"请先选择要加载的流程。\");\nreturn this.executeAction({ node: \"trigger-workflow-flow\", method: \"loadData\", modelId: row.id });" },
      { "name": "saveWorkflow", "label": "保存流程", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"save\" });" },
      { "name": "loadTemplate", "label": "加载模板", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"loadTemplate\", kind: this.event.args?.kind || \"approval\" });" },
      { "name": "autoLayoutWorkflow", "label": "自动布局", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"autoLayout\" });" },
      { "name": "compileWorkflow", "label": "编译", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"compile\" });" },
      { "name": "enableWorkflow", "label": "启用", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"enable\" });" },
      { "name": "runWorkflow", "label": "运行", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"run\" });" },
      { "name": "refreshWorkflow", "label": "刷新", "enabled": true, "script": "return this.executeAction({ node: \"trigger-workflow-flow\", method: \"refresh\" });" }
    ],
    "blocks": [
      {
        "id": "trigger-workflow-toolbar",
        "kind": "buttonGroup",
        "align": "right",
        "gap": 8,
        "actions": [
          { "code": "trigger-workflow-new", "label": "新建流程", "icon": "ri-file-add-line", "script": "return this.executeFunction({ name: \"newWorkflow\", args: {} });" },
          { "code": "trigger-workflow-load", "label": "加载流程", "icon": "ri-folder-open-line", "script": "return this.executeFunction({ name: \"loadWorkflow\", args: {} });" },
          { "code": "trigger-workflow-save", "label": "保存流程", "status": "primary", "icon": "ri-save-3-line", "script": "return this.executeFunction({ name: \"saveWorkflow\", args: {} });" },
          { "code": "trigger-workflow-template-approval", "label": "审批模板", "icon": "ri-user-follow-line", "script": "return this.executeFunction({ name: \"loadTemplate\", args: { kind: \"approval\" } });" },
          { "code": "trigger-workflow-template-sync", "label": "同步模板", "icon": "ri-refresh-line", "script": "return this.executeFunction({ name: \"loadTemplate\", args: { kind: \"dataSync\" } });" },
          { "code": "trigger-workflow-template-ai", "label": "AI 模板", "icon": "ri-robot-2-line", "script": "return this.executeFunction({ name: \"loadTemplate\", args: { kind: \"aiAgent\" } });" },
          { "code": "trigger-workflow-layout", "label": "自动布局", "icon": "ri-flow-chart", "script": "return this.executeFunction({ name: \"autoLayoutWorkflow\", args: {} });" },
          { "code": "trigger-workflow-compile", "label": "编译", "icon": "ri-code-s-slash-line", "script": "return this.executeFunction({ name: \"compileWorkflow\", args: {} });" },
          { "code": "trigger-workflow-enable", "label": "启用", "icon": "ri-rocket-line", "script": "return this.executeFunction({ name: \"enableWorkflow\", args: {} });" },
          { "code": "trigger-workflow-run", "label": "运行", "icon": "ri-play-circle-line", "script": "return this.executeFunction({ name: \"runWorkflow\", args: {} });" },
          { "code": "trigger-workflow-refresh", "label": "刷新", "icon": "ri-restart-line", "script": "return this.executeFunction({ name: \"refreshWorkflow\", args: {} });" }
        ]
      },
      {
        "id": "trigger-workflow-flow",
        "kind": "trigger-workflow-designer",
        "materialVersion": "1.0.0",
        "sourceKey": "triggerWorkflowModel",
        "layout": { "fillRemaining": true }
      }
    ]
  }
  $json$::jsonb,
  1,
  timezone('utc'::text, now())
)
on conflict (route) do update set
  code = excluded.code,
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

update public.admin_routes
set page_code = 'trigger-workflow-designer', updated_at = timezone('utc'::text, now())
where code = 'trigger-workflow-designer';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'trigger-workflow-designer'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
)
select
  'triggerWorkflowDesigner', '触发器编排画布', 'ri-node-tree', action_code, label, description,
  case when action_code = 'loadData'
    then 'async function main() { return await this.$node.call(''material.loadData'', { modelId: this.event.payload.nodeAction?.options?.modelId }); }'
    when action_code = 'loadTemplate'
    then 'async function main() { return await this.$node.call(''material.loadTemplate'', { kind: this.event.payload.nodeAction?.options?.kind || ''approval'' }); }'
    else format('async function main() { return await this.$node.call(''material.%s''); }', action_code)
  end,
  case when action_code = 'loadData'
    then '[{"name":"modelId","label":"流程模型 ID","type":"string","required":true}]'::jsonb
    when action_code = 'loadTemplate'
    then '[{"name":"kind","label":"模板类型","type":"string","required":true}]'::jsonb
    else '[]'::jsonb end,
  returns,
  format('return await this.executeAction({ node: {{nodeId}}, method: "%s"%s });', action_code,
    case
      when action_code = 'loadData' then ', modelId: ""'
      when action_code = 'loadTemplate' then ', kind: "approval"'
      else ''
    end),
  '{}'::jsonb, false, true, true, sort_order
from (values
  ('resetData', '新建流程', '创建空白触发器流程。', '返回新流程模型。', 50),
  ('loadData', '加载流程', '按模型 ID 加载触发器流程。', '返回流程模型。', 55),
  ('save', '保存流程', '保存当前触发器流程模型。', '返回保存记录。', 60),
  ('loadTemplate', '加载模板', '加载审批、同步或 AI 模板。', '返回模板流程模型。', 65),
  ('autoLayout', '自动布局', '自动整理 Trigger Flow 节点。', '返回流程模型。', 70),
  ('compile', '编译流程', '校验并编译当前触发器流程。', '返回执行计划。', 80),
  ('enable', '启用作业', '将流程编译为 Trigger.dev 作业并启用。', '返回作业记录。', 90),
  ('run', '运行作业', '手动运行已启用的作业。', '返回运行记录。', 100),
  ('refresh', '刷新作业', '刷新当前流程的作业状态。', '返回作业记录。', 110)
) as actions(action_code, label, description, returns, sort_order)
on conflict (node_type, action_code) do update set
  node_label = excluded.node_label,
  node_icon = excluded.node_icon,
  label = excluded.label,
  description = excluded.description,
  source_code = excluded.source_code,
  parameters = excluded.parameters,
  returns = excluded.returns,
  insert_text_template = excluded.insert_text_template,
  enabled = true,
  is_system = true,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

select pg_notify('pgrst', 'reload schema');
commit;
