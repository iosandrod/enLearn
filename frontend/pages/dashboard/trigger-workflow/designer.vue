<template>
  <section class="trigger-workflow-page">
    <TriggerWorkflowEditor
      v-model="model"
      height="calc(100vh - 62px)"
      :busy="isJobBusy"
      :can-run="canRunWorkflowJob"
      :node-form-schemas="nodeFormSchemas"
      :edge-form-schema="edgeFormSchema"
      :inspector-schemas-loading="inspectorSchemasLoading"
      @validation="issues = $event"
      @compile="compiledPlan = $event"
      @export="exportedModel = $event"
      @new-workflow="newWorkflow"
      @save-workflow="saveWorkflow"
      @load-workflow="loadWorkflow"
      @save="saveLocalDraft"
      @restore="loadDraft"
      @copy="copyModel"
      @enable="enableWorkflowJob"
      @run="runWorkflowJob"
      @refresh="refreshWorkflowJob"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import { confirmLowCodePage } from '@enlearn/lowcode-framework/runtime';
import {
  TRIGGER_EDGE_FORM_SCHEMA_CODE,
  TriggerWorkflowEditor,
  TRIGGER_WORKFLOW_SCHEMA_VERSION,
  assertTriggerInspectorFormSchema,
  buildTriggerWorkflowJob,
  createApprovalTriggerWorkflow,
  getTriggerWorkflowJobPlanSignature,
  normalizeTriggerWorkflow,
  triggerInspectorNodeTypes,
  triggerNodeFormSchemaCodeByType,
  type TriggerInspectorFormSchema,
  type TriggerNodeFormSchemaMap,
  type TriggerWorkflowExecutionPlan,
  type TriggerWorkflowIssue,
  type TriggerWorkflowModel
} from '@enlearn/trigger-workflow-editor';
import { loadAvailableLowCodeFormDefinitions } from '../../../utils/lowCodeFormDefinitions';

const auth = useAuth();
const storageKey = computed(() =>
  `enlearn.trigger-workflow-editor.${auth.activeAccount.value?.account_id ?? 'unselected'}`
);
const triggerWorkflowDocumentType = 'trigger-workflow';
const workflowModelListPageCode = 'trigger-workflow-models';
const serviceApi = useServiceApi();
const route = useRoute();
const router = useRouter();
const model = ref<TriggerWorkflowModel>(createApprovalTriggerWorkflow());
const savedModelId = ref('');
const issues = ref<TriggerWorkflowIssue[]>([]);
const compiledPlan = ref<TriggerWorkflowExecutionPlan | undefined>();
const exportedModel = ref<TriggerWorkflowModel | undefined>();
const workflowJob = ref<WorkflowJobRecord | undefined>();
const workflowRuns = ref<WorkflowJobRunRecord[]>([]);
const isJobBusy = ref(false);
const jobMessage = ref('');
const inspectorSchemasLoading = ref(false);
const nodeFormSchemas = shallowRef<TriggerNodeFormSchemaMap>({});
const edgeFormSchema = shallowRef<TriggerInspectorFormSchema>();
const currentPlanSignature = computed(() => {
  try {
    return getTriggerWorkflowJobPlanSignature(model.value);
  } catch {
    return '';
  }
});
const canRunWorkflowJob = computed(() => Boolean(
  workflowJob.value?.status === 'enabled' &&
  workflowJob.value.code === model.value.code &&
  readJobPlanSignature(workflowJob.value) === currentPlanSignature.value
));

onMounted(() => {
  loadDraft();
  void loadInspectorSchemas();
  void refreshWorkflowJob();
});

async function loadInspectorSchemas() {
  inspectorSchemasLoading.value = true;
  const codes = [
    ...triggerInspectorNodeTypes.map((type) => triggerNodeFormSchemaCodeByType[type]),
    TRIGGER_EDGE_FORM_SCHEMA_CODE,
  ] as const;

  try {
    const definitions = await loadAvailableLowCodeFormDefinitions(serviceApi, codes);
    const invalidCodes: string[] = [];
    nodeFormSchemas.value = Object.fromEntries(
      triggerInspectorNodeTypes.flatMap((type) => {
        const definition = definitions[triggerNodeFormSchemaCodeByType[type]];
        if (!definition) return [];
        try {
          assertTriggerInspectorFormSchema(definition.schema);
          return [[type, definition.schema]];
        } catch {
          invalidCodes.push(definition.code);
          return [];
        }
      }),
    ) as TriggerNodeFormSchemaMap;
    const edgeDefinition = definitions[TRIGGER_EDGE_FORM_SCHEMA_CODE];
    if (edgeDefinition) {
      try {
        assertTriggerInspectorFormSchema(edgeDefinition.schema);
        edgeFormSchema.value = edgeDefinition.schema;
      } catch {
        invalidCodes.push(edgeDefinition.code);
        edgeFormSchema.value = undefined;
      }
    } else {
      edgeFormSchema.value = undefined;
    }

    const loadedCount = Object.keys(nodeFormSchemas.value).length;
    if (loadedCount < triggerInspectorNodeTypes.length) {
      notify(
        `已加载 ${loadedCount}/${triggerInspectorNodeTypes.length} 个节点表单定义，其余使用内置配置${invalidCodes.length ? `；${invalidCodes.length} 个定义无效` : ''}。`,
        'warning',
      );
    }
  } catch (error) {
    nodeFormSchemas.value = {};
    edgeFormSchema.value = undefined;
    notify(
      `节点表单定义加载失败，已使用内置配置：${error instanceof Error ? error.message : String(error)}`,
      'warning',
    );
  } finally {
    inspectorSchemasLoading.value = false;
  }
}

function saveLocalDraft() {
  persistLocalWorkflow(model.value);
  notify('本地草稿已保存。', 'success');
}

function loadDraft() {
  const saved = window.localStorage.getItem(storageKey.value);
  if (!saved) return false;
  try {
    model.value = JSON.parse(saved) as TriggerWorkflowModel;
    savedModelId.value = readSavedModelId(model.value);
    notify('已恢复本地草稿。', 'success');
    return true;
  } catch {
    window.localStorage.removeItem(storageKey.value);
    return false;
  }
}

async function copyModel() {
  const value = exportedModel.value ?? model.value;
  await navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
  notify('工作流 JSON 已复制。', 'success');
}

async function newWorkflow() {
  const confirmed = await VxeUI.modal.confirm({
    title: '新建流程',
    content: '确定新建空白流程吗？当前未保存的修改将被清除。',
    confirmButtonText: '新建'
  });
  if (confirmed !== 'confirm') return;

  savedModelId.value = '';
  model.value = createBlankWorkflowModel();
  persistLocalWorkflow(model.value);
  notify('已新建空白流程。', 'success');
}

async function saveWorkflow() {
  if (isJobBusy.value) return;
  isJobBusy.value = true;
  try {
    const saved = await workflowApi<WorkflowModelRecord>(
      savedModelId.value ? 'updateModel' : 'saveModel',
      {
        ...(savedModelId.value ? { modelId: savedModelId.value } : {}),
        code: model.value.code,
        name: model.value.name,
        documentType: triggerWorkflowDocumentType,
        schema: model.value
      }
    );
    savedModelId.value = saved.id;
    model.value = { ...model.value, id: saved.id };
    persistLocalWorkflow(model.value);
    notify(`流程“${saved.name}”已保存。`, 'success');
  } catch (error) {
    notify(error instanceof Error ? error.message : '流程保存失败。', 'error');
  } finally {
    isJobBusy.value = false;
  }
}

async function loadWorkflow() {
  if (isJobBusy.value) return;
  isJobBusy.value = true;
  try {
    const result = await confirmLowCodePage({
      pageCode: workflowModelListPageCode,
      includeData: true,
      serviceApi: serviceApi as Parameters<typeof confirmLowCodePage>[0]['serviceApi'],
      router: router as Parameters<typeof confirmLowCodePage>[0]['router'],
      route: route as Parameters<typeof confirmLowCodePage>[0]['route'],
      locale: 'zh-CN',
      title: '加载流程',
      confirmLabel: '加载',
      cancelLabel: '取消',
      requireSelection: true,
      dialog: {
        id: 'trigger-workflow-picker-dialog'
      }
    });
    if (result.action === 'cancel' || result.action === 'close') return;

    const selected = readSelectedWorkflow(result.payload);
    if (!selected) {
      notify('请先选择要加载的流程。', 'warning');
      return;
    }
    const saved = await workflowApi<WorkflowModelRecord>('getModel', {
      modelId: selected.id
    });
    if (saved.documentType !== triggerWorkflowDocumentType) {
      throw new Error('所选记录不是触发器编排流程。');
    }
    model.value = { ...readWorkflowSchema(saved.draftSchema), id: saved.id };
    savedModelId.value = saved.id;
    persistLocalWorkflow(model.value);
    await refreshWorkflowJob();
    notify(`已加载流程“${saved.name}”。`, 'success');
  } catch (error) {
    notify(error instanceof Error ? error.message : '流程加载失败。', 'error');
  } finally {
    isJobBusy.value = false;
  }
}

async function enableWorkflowJob() {
  if (isJobBusy.value) return;
  isJobBusy.value = true;
  try {
    if (!savedModelId.value || model.value.id !== savedModelId.value) {
      throw new Error('请先保存当前流程，再启用作业。');
    }
    const definition = buildTriggerWorkflowJob(model.value);
    let job = await workflowApi<WorkflowJobRecord>('upsertJob', definition);
    job = await workflowApi<WorkflowJobRecord>('updateJobStatus', {
      jobId: job.id,
      status: 'enabled'
    });
    workflowJob.value = job;
    await refreshWorkflowJob();
    jobMessage.value = `流程“${model.value.name}”已编译为作业并启用。`;
    notify(jobMessage.value, 'success');
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
    notify(jobMessage.value, 'error');
  } finally {
    isJobBusy.value = false;
  }
}

async function runWorkflowJob() {
  if (!workflowJob.value) return;
  if (!canRunWorkflowJob.value) {
    notify('当前流程配置已变化，请重新启用后再运行。', 'warning');
    return;
  }
  isJobBusy.value = true;
  try {
    await workflowApi<WorkflowJobRunRecord>('runJob', {
      jobId: workflowJob.value.id,
      payload: {
        userId: auth.user.value?.id,
        requestedAt: new Date().toISOString()
      }
    });
    await refreshWorkflowJob();
    jobMessage.value = `流程“${model.value.name}”已开始运行。`;
    notify(jobMessage.value, 'success');
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
    notify(jobMessage.value, 'error');
  } finally {
    isJobBusy.value = false;
  }
}

async function refreshWorkflowJob() {
  try {
    const jobs = await workflowApi<WorkflowJobRecord[]>('listItems', {
      itemType: 'jobs'
    });
    workflowJob.value = jobs.find((job) => job.code === model.value.code);
    workflowRuns.value = workflowJob.value
      ? await workflowApi<WorkflowJobRunRecord[]>('listItems', {
          itemType: 'jobRuns',
          jobId: workflowJob.value.id,
          limit: 20
        })
      : [];
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
    notify(jobMessage.value, 'error');
  }
}

async function workflowApi<T>(serviceMethod: string, postData: Record<string, unknown> = {}) {
  return serviceApi.invoke<T>('workflow', serviceMethod, {
    tenantId: auth.activeAccount.value?.account_id,
    ...postData
  });
}

function createBlankWorkflowModel(): TriggerWorkflowModel {
  const suffix = Date.now().toString(36);
  return {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: `trigger_workflow_${suffix}`,
    name: '未命名流程',
    kind: 'custom',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        position: { x: 380, y: 40 }
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        position: { x: 380, y: 360 }
      }
    ],
    edges: [
      { id: 'edge_start_end', source: 'start', target: 'end' }
    ]
  };
}

function readSelectedWorkflow(payload: unknown): WorkflowModelListRow | null {
  if (!isRecord(payload)) return null;
  const row = [
    payload.row,
    payload.selectedRow,
    payload.currentRow,
    Array.isArray(payload.selectedRows) ? payload.selectedRows[0] : undefined,
    Array.isArray(payload.rows) ? payload.rows[0] : undefined
  ].find(isRecord);
  if (!row || typeof row.id !== 'string' || !row.id.trim()) return null;
  return row as WorkflowModelListRow;
}

function readWorkflowSchema(value: unknown): TriggerWorkflowModel {
  if (isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges)) {
    return normalizeTriggerWorkflow(value);
  }
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return normalizeTriggerWorkflow(parsed);
    }
  }
  throw new Error('所选记录不包含有效的流程结构。');
}

function readSavedModelId(value: TriggerWorkflowModel) {
  return typeof value.id === 'string' ? value.id.trim() : '';
}

function persistLocalWorkflow(value: TriggerWorkflowModel) {
  window.localStorage.setItem(storageKey.value, JSON.stringify(value, null, 2));
}

function readJobPlanSignature(job: WorkflowJobRecord) {
  const definition = isRecord(job.payload.triggerWorkflow)
    ? job.payload.triggerWorkflow
    : undefined;
  return typeof definition?.planSignature === 'string'
    ? definition.planSignature
    : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function notify(content: string, status: 'success' | 'error' | 'warning') {
  const modal = VxeUI.modal;
  if (modal?.message) void modal.message({ content, status });
}

type WorkflowJobRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  triggerTaskId: string;
  payload: Record<string, unknown>;
};

type WorkflowJobRunRecord = {
  id: string;
  status: string;
  output?: Record<string, unknown>;
  createdAt: string;
};

type WorkflowModelListRow = {
  id: string;
  name?: string;
};

type WorkflowModelRecord = WorkflowModelListRow & {
  code: string;
  name: string;
  documentType?: string;
  draftSchema: Record<string, unknown> | string;
};
</script>

<style scoped>
.trigger-workflow-page {
  min-width: 0;
}
</style>
