-- Approval workflow designer low-code page and node inspector definitions.
-- The flow itself is a database-backed page material; every inspector schema
-- is independently replaceable through lowcode_form_definitions.
begin;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values
('approval-workflow.node.approval', '审批节点配置', '审批节点运行配置。', '{"fields":[{"field":"assigneeStrategy","label":"审批人策略","component":"lc-monaco-editor","props":{"language":"json","dialogTitle":"编辑审批人策略"}},{"field":"completionStrategy","label":"完成策略","component":"vxe-select","props":{"options":[{"label":"全部通过","value":"all"},{"label":"任一通过","value":"any"}]}},{"field":"allowReject","label":"允许驳回","component":"vxe-switch"}],"actions":[]}'::jsonb, true),
('approval-workflow.node.sign', '会签节点配置', '会签节点运行配置。', '{"fields":[{"field":"assigneeStrategy","label":"审批人策略","component":"lc-monaco-editor","props":{"language":"json"}},{"field":"sequential","label":"顺序会签","component":"vxe-switch"},{"field":"allowReject","label":"允许驳回","component":"vxe-switch"}],"actions":[]}'::jsonb, true),
('approval-workflow.node.or-sign', '或签节点配置', '或签节点运行配置。', '{"fields":[{"field":"assigneeStrategy","label":"审批人策略","component":"lc-monaco-editor","props":{"language":"json"}},{"field":"allowReject","label":"允许驳回","component":"vxe-switch"}],"actions":[]}'::jsonb, true),
('approval-workflow.node.cc', '抄送节点配置', '抄送节点运行配置。', '{"fields":[{"field":"assigneeStrategy","label":"抄送人策略","component":"lc-monaco-editor","props":{"language":"json"}}],"actions":[]}'::jsonb, true),
('approval-workflow.node.condition', '条件节点配置', '条件节点运行配置。', '{"fields":[{"field":"expression","label":"表达式","component":"vxe-textarea"}],"actions":[]}'::jsonb, true),
('approval-workflow.node.parallel-gateway', '并行网关配置', '并行网关运行配置。', '{"fields":[{"field":"joinStrategy","label":"汇聚策略","component":"vxe-select","props":{"options":[{"label":"全部完成","value":"all"},{"label":"任一完成","value":"any"}]}}],"actions":[]}'::jsonb, true),
('approval-workflow.node.service-task', '服务节点配置', '服务节点运行配置。', '{"fields":[{"field":"serviceName","label":"服务名","component":"vxe-input"},{"field":"serviceMethod","label":"方法名","component":"vxe-input"}],"actions":[]}'::jsonb, true),
('approval-workflow.node.timer', '定时节点配置', '定时节点运行配置。', '{"fields":[{"field":"delaySeconds","label":"延迟秒数","component":"vxe-number-input"},{"field":"action","label":"超时动作","component":"vxe-select","props":{"options":[{"label":"继续","value":"continue"},{"label":"取消","value":"cancel"}]}}],"actions":[]}'::jsonb, true),
('approval-workflow.node.sub-process', '子流程节点配置', '子流程节点运行配置。', '{"fields":[{"field":"definitionCode","label":"流程编码","component":"vxe-input"}],"actions":[]}'::jsonb, true),
('approval-workflow.node.start', '开始节点配置', '开始节点配置。', '{"fields":[{"field":"trigger","label":"触发方式","component":"vxe-input"}],"actions":[]}'::jsonb, true),
('approval-workflow.node.end', '结束节点配置', '结束节点配置。', '{"fields":[{"field":"result","label":"结束结果","component":"vxe-input"}],"actions":[]}'::jsonb, true),
('approval-workflow.edge', '流程连线配置', '流程连线条件配置。', '{"fields":[{"field":"name","label":"连线名称","component":"vxe-input"}],"actions":[]}'::jsonb, true)
on conflict (code) do update set name = excluded.name, description = excluded.description, schema = excluded.schema, enabled = true, updated_at = timezone('utc'::text, now());

insert into public.lowcode_materials (
  material_kind, code, label, description, category, renderer_type,
  source_path, source_text, source_hash, material_version, aliases,
  sort_order, manifest, dependencies, status, enabled, is_system
) values (
  'page', 'approval-workflow-designer', '审批流画布', '审批流设计器的低代码画布物料。',
  'workflow', 'vue-sfc', 'lowcode/materials/approval-workflow-designer.vue',
  $material$
<template>
  <div class="approval-workflow-material">
    <span v-if="message" class="approval-workflow-material__message">{{ message }}</span>
    <ApprovalDesigner ref="designer" v-model="model" :node-form-schemas="nodeSchemas" :readonly="readonly" :show-header="false" :minimal="true" />
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLowCodeHost } from '/core/host';
import { loadLowCodeFormDefinition } from '/lowcode/form-definition-loader';
const props = defineProps<{ block: Record<string, any>; resolvedData: Record<string, any> }>();
const host = useLowCodeHost();
const designer = ref<any>();
const savedModelId = ref('');
const message = ref('');
const readonly = computed(() => props.block.readonly === true);
const nodeCodes: Record<string, string> = {
  start: 'approval-workflow.node.start', end: 'approval-workflow.node.end',
  approval: 'approval-workflow.node.approval', sign: 'approval-workflow.node.sign',
  orSign: 'approval-workflow.node.or-sign', cc: 'approval-workflow.node.cc',
  condition: 'approval-workflow.node.condition', parallelGateway: 'approval-workflow.node.parallel-gateway',
  serviceTask: 'approval-workflow.node.service-task', timer: 'approval-workflow.node.timer',
  subProcess: 'approval-workflow.node.sub-process'
};
const nodeSchemas = ref<Record<string, any>>({});
const blank = () => ({ schemaVersion: 1, code: 'approval_workflow', name: '审批流程', documentType: 'document', status: 'draft', variables: [], nodes: [
  { id: 'start', type: 'start', name: '开始', position: { x: 330, y: 48 } },
  { id: 'approval', type: 'approval', name: '审批', position: { x: 330, y: 190 }, config: { assigneeStrategy: { type: 'initiatorManager', level: 1 }, allowReject: true } },
  { id: 'end', type: 'end', name: '结束', position: { x: 330, y: 332 } }
], edges: [{ id: 'e1', source: 'start', target: 'approval' }, { id: 'e2', source: 'approval', target: 'end' }] });
const model = ref<any>(blank());
async function load() {
  const api = host.getServiceApi();
  const entries = await Promise.all(Object.entries(nodeCodes).map(async ([type, code]) => [type, (await loadLowCodeFormDefinition(api, code)).schema]));
  nodeSchemas.value = Object.fromEntries(entries);
  const id = String(host.getRoute().params?.code ?? '').trim();
  if (!id) return;
  const record = await api.invoke<any>('workflow', 'getModel', { modelId: id });
  savedModelId.value = record.id;
  model.value = record.draftSchema;
}
function createNew() { savedModelId.value = ''; model.value = blank(); message.value = '已新建草稿'; }
function autoLayout() { designer.value?.autoLayout?.(); }
async function save() {
  const api = host.getServiceApi();
  const schema = designer.value?.getSchema?.() ?? model.value;
  const issues = designer.value?.validate?.() ?? [];
  if (issues.some((item: any) => item.level === 'error')) { message.value = '流程校验未通过'; return; }
  const payload = { code: schema.code, name: schema.name, documentType: schema.documentType, schema };
  const record = savedModelId.value
    ? await api.invoke<any>('workflow', 'updateModel', { modelId: savedModelId.value, ...payload })
    : await api.invoke<any>('workflow', 'saveModel', payload);
  savedModelId.value = record.id;
  const result = await api.invoke<any>('workflow', 'publishModel', { modelId: record.id, remark: '低代码审批流设计器发布' });
  message.value = `已发布 ${result.definition.code} v${result.definition.version}`;
}
const listeners: Array<[string, EventListener]> = [
  ['lowcode:workflow.new', createNew as EventListener],
  ['lowcode:workflow.save', (() => void save()) as EventListener],
  ['lowcode:workflow.layout', autoLayout as EventListener]
];
onMounted(() => { listeners.forEach(([name, listener]) => window.addEventListener(name, listener)); void load().catch((error) => { message.value = error instanceof Error ? error.message : '加载失败'; }); });
onBeforeUnmount(() => listeners.forEach(([name, listener]) => window.removeEventListener(name, listener)));
</script>
<style scoped>.approval-workflow-material{position:relative;height:100%;min-height:560px;overflow:hidden}.approval-workflow-material__message{position:absolute;right:12px;top:8px;z-index:10;border:1px solid #cbd5e1;border-radius:5px;background:#fff;padding:5px 9px;color:#334155;font-size:11px}</style>
  $material$, 'approval-workflow-material-v1', '1.0.0', array['approval-flow'], 100,
  '{"implementationKey":"approval-workflow-designer"}'::jsonb,
  '["/core/host","/lowcode/form-definition-loader"]'::jsonb, 'published', true, true
)
on conflict (material_kind, code) do update set label = excluded.label, source_text = excluded.source_text, source_hash = excluded.source_hash, status = 'published', enabled = true, updated_at = timezone('utc'::text, now());

commit;
