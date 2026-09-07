-- Drive the approval workflow toolbar through page-owned functions and add a
-- low-code page picker for loading an existing workflow model.
begin;

update public.lowcode_pages
set
  schema = $json$
  {
    "schemaVersion": 1,
    "code": "approval-workflow-designer",
    "route": "/dashboard/workflow/designer",
    "title": "审批流设计器",
    "pageType": "custom",
    "layout": "blank",
    "status": "published",
    "keepAlive": true,
    "dataSources": {},
    "scriptPolicy": {
      "capabilities": [
        "action.execute",
        "dialog.confirmLowCodePage",
        "pageFunction.execute"
      ]
    },
    "functions": [
      {
        "name": "newWorkflow",
        "label": "新建流程",
        "description": "清空已保存模型标识并创建一个基础审批流草稿。",
        "enabled": true,
        "script": "return this.executeAction({ node: \"approval-workflow-flow\", method: \"resetData\" });"
      },
      {
        "name": "loadWorkflow",
        "label": "加载流程",
        "description": "打开流程管理低代码列表页，加载选中的流程模型。",
        "enabled": true,
        "script": "const result = await this.$dialog.confirmLowCodePage({ pageCode: \"workflow-model-management\", title: \"加载流程\", confirmLabel: \"加载\", cancelLabel: \"取消\", requireSelection: true, includeEventHistory: false, dialog: { id: \"approval-workflow-picker-dialog\" } });\nif (!result || result.action !== \"confirm\") return null;\nconst row = result.row || result.selectedRows?.[0];\nif (!row || !row.id) throw new Error(\"请先选择要加载的流程。\");\nreturn this.executeAction({ node: \"approval-workflow-flow\", method: \"loadData\", modelId: row.id });"
      },
      {
        "name": "saveWorkflow",
        "label": "保存并发布",
        "description": "校验、保存并发布当前审批流模型。",
        "enabled": true,
        "script": "return this.executeAction({ node: \"approval-workflow-flow\", method: \"save\" });"
      },
      {
        "name": "autoLayoutWorkflow",
        "label": "自动布局",
        "description": "自动整理当前审批流模型图。",
        "enabled": true,
        "script": "return this.executeAction({ node: \"approval-workflow-flow\", method: \"autoLayout\" });"
      },
      {
        "name": "validateWorkflow",
        "label": "校验流程",
        "description": "校验当前审批流并刷新模型图上方的校验状态。",
        "enabled": true,
        "script": "return this.executeAction({ node: \"approval-workflow-flow\", method: \"validate\" });"
      }
    ],
    "blocks": [
      {
        "id": "approval-workflow-toolbar",
        "kind": "buttonGroup",
        "align": "right",
        "gap": 8,
        "actions": [
          {
            "code": "approval-workflow-new",
            "label": "新建草稿",
            "icon": "ri-file-add-line",
            "script": "return this.executeFunction({ name: \"newWorkflow\", args: {} });"
          },
          {
            "code": "approval-workflow-load",
            "label": "加载流程",
            "icon": "ri-folder-open-line",
            "script": "return this.executeFunction({ name: \"loadWorkflow\", args: {} });"
          },
          {
            "code": "approval-workflow-save",
            "label": "保存并发布",
            "status": "primary",
            "icon": "ri-save-3-line",
            "script": "return this.executeFunction({ name: \"saveWorkflow\", args: {} });"
          },
          {
            "code": "approval-workflow-layout",
            "label": "自动布局",
            "icon": "ri-flow-chart",
            "script": "return this.executeFunction({ name: \"autoLayoutWorkflow\", args: {} });"
          },
          {
            "code": "approval-workflow-validate",
            "label": "校验",
            "icon": "ri-shield-check-line",
            "script": "return this.executeFunction({ name: \"validateWorkflow\", args: {} });"
          }
        ]
      },
      {
        "id": "approval-workflow-flow",
        "kind": "approval-workflow-designer",
        "materialVersion": "1.2.0",
        "sourceKey": "workflowModel"
      }
    ]
  }
  $json$::jsonb,
  version = version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where code = 'approval-workflow-designer';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'approval-workflow-designer'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
) values
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'resetData', '新建流程',
  '清空当前模型标识并恢复基础审批流草稿。',
  $action$async function main() {
  return await this.$node.call('material.resetData');
}$action$,
  '[]'::jsonb,
  '返回新的审批流模型。',
  'const model = await this.executeAction({\n  node: {{nodeId}},\n  method: "resetData",\n});',
  '{}'::jsonb, false, true, true, 50
),
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'save', '保存并发布',
  '校验、保存并发布当前审批流模型。',
  $action$async function main() {
  return await this.$node.call('material.save');
}$action$,
  '[]'::jsonb,
  '返回发布后的流程定义。',
  'const result = await this.executeAction({\n  node: {{nodeId}},\n  method: "save",\n});',
  '{}'::jsonb, false, true, true, 60
),
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'autoLayout', '自动布局',
  '自动整理当前审批流模型图。',
  $action$async function main() {
  return await this.$node.call('material.autoLayout');
}$action$,
  '[]'::jsonb,
  '布局完成返回 true。',
  'await this.executeAction({\n  node: {{nodeId}},\n  method: "autoLayout",\n});',
  '{}'::jsonb, false, true, true, 70
)
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

update public.lowcode_materials
set
  source_text = $material$
<template>
  <div class="approval-workflow-material">
    <header class="approval-workflow-material__summary">
      <div class="approval-workflow-material__identity">
        <strong>{{ model.name || '未命名流程' }}</strong>
        <span>{{ model.code || '未设置流程编码' }}</span>
      </div>
      <div class="approval-workflow-material__facts">
        <span>{{ model.documentType || '通用单据' }}</span>
        <span>{{ model.nodes?.length || 0 }} 个节点</span>
        <span>{{ model.edges?.length || 0 }} 条连线</span>
        <span v-if="savedModelId">版本 {{ currentVersion || 0 }}</span>
        <span v-else>未保存</span>
      </div>
      <div class="approval-workflow-material__state">
        <span class="approval-workflow-material__status">{{ modelStatusText }}</span>
        <button
          type="button"
          class="approval-workflow-material__validation"
          :class="{ 'is-error': validationErrorCount > 0, 'is-warning': validationErrorCount === 0 && validationWarningCount > 0 }"
          :disabled="validationIssues.length === 0"
          :title="validationIssues.length ? '点击查看校验信息' : '当前流程校验通过'"
          @click="openValidationDialog"
        >
          <i :class="validationErrorCount ? 'ri-error-warning-line' : 'ri-shield-check-line'" aria-hidden="true" />
          {{ validationText }}
        </button>
        <span v-if="message" class="approval-workflow-material__message">{{ message }}</span>
      </div>
    </header>
    <ApprovalDesigner
      ref="designer"
      v-model="model"
      :node-form-schemas="nodeSchemas"
      :readonly="readonly"
      :show-header="false"
      :minimal="true"
      @validation="setValidation"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLowCodeHost } from '/core/host';
import { loadLowCodeFormDefinition } from '/lowcode/form-definition-loader';
import { registerLowCodeMaterialRuntimeController } from '/runtime/material-controller-registry';
import { openGlobalDialog } from '/runtime/global-dialog';
const props = defineProps<{ block: Record<string, any>; resolvedData: Record<string, any> }>();
const host = useLowCodeHost();
const designer = ref<any>();
const savedModelId = ref('');
const persistedStatus = ref('draft');
const currentVersion = ref(0);
const message = ref('');
const validationIssues = ref<any[]>([]);
const readonly = computed(() => props.block.readonly === true);
const validationErrorCount = computed(() => validationIssues.value.filter((item) => item?.level === 'error').length);
const validationWarningCount = computed(() => validationIssues.value.filter((item) => item?.level === 'warning').length);
const validationText = computed(() => validationErrorCount.value
  ? `${validationErrorCount.value} 项错误`
  : validationWarningCount.value
    ? `${validationWarningCount.value} 项提醒`
    : '校验通过');
const modelStatusText = computed(() => {
  if (!savedModelId.value) return '草稿';
  return ({ published: '已发布', disabled: '已停用', archived: '已归档', draft: '草稿' } as Record<string, string>)[persistedStatus.value] || persistedStatus.value || '草稿';
});
const nodeCodes: Record<string, string> = {
  start: 'approval-workflow.node.start', end: 'approval-workflow.node.end',
  approval: 'approval-workflow.node.approval', sign: 'approval-workflow.node.sign',
  orSign: 'approval-workflow.node.or-sign', cc: 'approval-workflow.node.cc',
  condition: 'approval-workflow.node.condition', parallelGateway: 'approval-workflow.node.parallel-gateway',
  serviceTask: 'approval-workflow.node.service-task', timer: 'approval-workflow.node.timer',
  subProcess: 'approval-workflow.node.sub-process'
};
const nodeSchemas = ref<Record<string, any>>({});
let unregisterRuntimeController = () => undefined;
const blank = () => ({ schemaVersion: 1, code: 'approval_workflow', name: '审批流程', documentType: 'document', status: 'draft', variables: [], nodes: [
  { id: 'start', type: 'start', name: '开始', position: { x: 330, y: 48 } },
  { id: 'approval', type: 'approval', name: '审批', position: { x: 330, y: 190 }, config: { assigneeStrategy: { type: 'initiatorManager', level: 1 }, allowReject: true } },
  { id: 'end', type: 'end', name: '结束', position: { x: 330, y: 332 } }
], edges: [{ id: 'e1', source: 'start', target: 'approval' }, { id: 'e2', source: 'approval', target: 'end' }] });
const model = ref<any>(props.block.model && typeof props.block.model === 'object'
  ? props.block.model
  : (props.resolvedData?.[String(props.block.sourceKey || 'workflowModel')] ?? blank()));
function setValidation(value: unknown) {
  validationIssues.value = Array.isArray(value) ? value : [];
}
async function openValidationDialog() {
  if (!validationIssues.value.length) return;
  await openGlobalDialog({
    id: 'approval-workflow-validation-dialog',
    title: `流程校验信息（${validationIssues.value.length}）`,
    width: 'min(720px, calc(100vw - 40px))',
    props: { top: '10vh', destroyOnClose: true },
    showFooter: false,
    content: {
      type: 'render',
      render: () => h('div', {
        role: 'list',
        'aria-label': '流程校验错误明细',
        style: { display: 'grid', gap: '10px', padding: '4px' },
      }, validationIssues.value.map((issue, index) => {
        const isError = issue?.level === 'error';
        return h('article', {
          key: `${issue?.path || index}-${issue?.message || ''}`,
          role: 'listitem',
          style: {
            display: 'grid',
            gap: '5px',
            border: `1px solid ${isError ? '#fecaca' : '#fde68a'}`,
            borderLeft: `4px solid ${isError ? '#dc2626' : '#d97706'}`,
            borderRadius: '7px',
            background: isError ? '#fef2f2' : '#fffbeb',
            padding: '10px 12px',
          },
        }, [
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } }, [
            h('strong', { style: { color: isError ? '#b91c1c' : '#b45309', fontSize: '13px' } }, isError ? '错误' : '提醒'),
            h('code', { style: { color: '#64748b', fontSize: '11px', wordBreak: 'break-all' } }, String(issue?.path || 'workflow')),
          ]),
          h('span', { style: { color: '#334155', fontSize: '13px', lineHeight: '1.55' } }, String(issue?.message || '未知校验信息')),
        ]);
      })),
    },
  });
}
async function refreshValidation() {
  await nextTick();
  setValidation(designer.value?.validate?.() ?? []);
}
async function load(options: Record<string, any> = {}) {
  const api = host.getServiceApi();
  const entries = await Promise.all(Object.entries(nodeCodes).map(async ([type, code]) => [type, (await loadLowCodeFormDefinition(api, code)).schema]));
  nodeSchemas.value = Object.fromEntries(entries);
  const requestedId = options?.options?.modelId ?? options?.modelId;
  const id = String(requestedId ?? host.getRoute().params?.code ?? '').trim();
  if (!id) {
    await refreshValidation();
    return model.value;
  }
  const record = await api.invoke<any>('workflow', 'getModel', { modelId: id });
  if (!record?.draftSchema || !Array.isArray(record.draftSchema.nodes) || !Array.isArray(record.draftSchema.edges)) {
    throw new Error('所选记录不是有效的审批流模型。');
  }
  savedModelId.value = String(record.id || id);
  persistedStatus.value = String(record.status || 'draft');
  currentVersion.value = Number(record.currentVersion || 0);
  model.value = record.draftSchema;
  message.value = `已加载流程“${record.name || model.value.name || id}”`;
  await refreshValidation();
  return getData();
}
async function createNew() {
  savedModelId.value = '';
  persistedStatus.value = 'draft';
  currentVersion.value = 0;
  model.value = blank();
  message.value = '已新建草稿';
  await refreshValidation();
  return getData();
}
function autoLayout() {
  designer.value?.autoLayout?.();
  message.value = '已自动整理流程图';
  return true;
}
async function setData(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('审批流模型 setData 的 value 必须是对象。');
  }
  model.value = value;
  await refreshValidation();
  return getData();
}
function getData() { return JSON.parse(JSON.stringify(model.value)); }
function validate() {
  const issues = designer.value?.validate?.() ?? [];
  setValidation(issues);
  const valid = !validationIssues.value.some((item) => item?.level === 'error');
  message.value = valid ? '流程校验通过' : `流程校验未通过：${validationErrorCount.value} 项错误`;
  return valid;
}
async function save() {
  const api = host.getServiceApi();
  const schema = designer.value?.getSchema?.() ?? model.value;
  const issues = designer.value?.validate?.() ?? [];
  setValidation(issues);
  if (issues.some((item: any) => item.level === 'error')) {
    message.value = `流程校验未通过：${validationErrorCount.value} 项错误`;
    throw new Error(message.value);
  }
  const payload = { code: schema.code, name: schema.name, documentType: schema.documentType, schema };
  const record = savedModelId.value
    ? await api.invoke<any>('workflow', 'updateModel', { modelId: savedModelId.value, ...payload })
    : await api.invoke<any>('workflow', 'saveModel', payload);
  savedModelId.value = record.id;
  const result = await api.invoke<any>('workflow', 'publishModel', { modelId: record.id, remark: '低代码审批流设计器发布' });
  persistedStatus.value = 'published';
  currentVersion.value = Number(result?.definition?.version || record.currentVersion || currentVersion.value);
  message.value = `已发布 ${result.definition.code} v${result.definition.version}`;
  return result;
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
  });
  void load().catch((error) => { message.value = error instanceof Error ? error.message : '加载失败'; });
});
onBeforeUnmount(() => unregisterRuntimeController());
</script>
<style scoped>
.approval-workflow-material{display:flex;position:relative;height:100%;min-height:600px;flex-direction:column;overflow:hidden}
.approval-workflow-material__summary{display:flex;min-height:46px;align-items:center;gap:16px;border:1px solid #d5deea;border-bottom:0;border-radius:8px 8px 0 0;background:#fff;padding:6px 12px;color:#334155}
.approval-workflow-material__identity{display:grid;min-width:180px;gap:1px}.approval-workflow-material__identity strong{font-size:14px}.approval-workflow-material__identity span{color:#64748b;font-size:10px}
.approval-workflow-material__facts{display:flex;min-width:0;flex:1;align-items:center;gap:12px;color:#64748b;font-size:11px}.approval-workflow-material__facts span+span{position:relative}.approval-workflow-material__facts span+span::before{position:absolute;left:-7px;color:#cbd5e1;content:'·'}
.approval-workflow-material__state{display:flex;align-items:center;gap:7px;font-size:11px}.approval-workflow-material__status,.approval-workflow-material__validation,.approval-workflow-material__message{border:1px solid #dbe3ea;border-radius:999px;background:#f8fafc;padding:3px 8px;white-space:nowrap}
.approval-workflow-material__validation{border-color:#bbf7d0;background:#f0fdf4;color:#15803d;font:inherit}.approval-workflow-material__validation:not(:disabled){cursor:pointer}.approval-workflow-material__validation:not(:disabled):hover{filter:brightness(.97);box-shadow:0 0 0 2px rgb(15 23 42 / 6%)}.approval-workflow-material__validation:disabled{cursor:default;opacity:1}.approval-workflow-material__validation.is-warning{border-color:#fde68a;background:#fffbeb;color:#b45309}.approval-workflow-material__validation.is-error{border-color:#fecaca;background:#fef2f2;color:#b91c1c}.approval-workflow-material__message{max-width:260px;overflow:hidden;color:#475569;text-overflow:ellipsis}
.approval-workflow-material :deep(.approval-designer){min-height:0;flex:1;border-radius:0 0 8px 8px}
@media (max-width:900px){.approval-workflow-material__summary{align-items:flex-start;flex-wrap:wrap}.approval-workflow-material__facts{order:3;width:100%}.approval-workflow-material__message{display:none}}
</style>
  $material$,
  source_hash = 'approval-workflow-material-v4',
  material_version = '1.2.0',
  updated_at = timezone('utc'::text, now())
where material_kind = 'page'
  and code = 'approval-workflow-designer';

select pg_notify('pgrst', 'reload schema');
commit;
