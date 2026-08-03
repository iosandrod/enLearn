<template>
  <section class="workflow-designer-page">
    <header class="workflow-designer-page__toolbar">
      <div class="workflow-designer-page__identity">
        <span class="workflow-designer-page__kicker">审批流设计器</span>
        <label class="workflow-title-field">
          <span>名称</span>
          <input v-model="workflowModel.name" />
        </label>
      </div>

      <div class="workflow-designer-page__actions">
        <button type="button" class="workflow-button workflow-button--test" :disabled="isApiBusy" @click="loadTriggerApprovalTestWorkflow">
          <i class="ri-flask-line" aria-hidden="true" />
          加载测试流程
        </button>
        <button type="button" class="workflow-button workflow-button--primary" :disabled="isApiBusy" @click="saveAndPublish">
          <i class="ri-save-3-line" aria-hidden="true" />
          保存并发布
        </button>
        <button type="button" class="workflow-button" :disabled="isApiBusy" @click="runMinimalApprovalOneClickTest">
          <i class="ri-play-circle-line" aria-hidden="true" />
          一键测试
        </button>
        <div class="workflow-action-menu" @click.stop>
          <button type="button" class="workflow-button workflow-button--ghost" @click="toggleActionMenu">
            <i class="ri-more-line" aria-hidden="true" />
            更多
          </button>
          <div v-if="actionsMenuOpen" class="workflow-action-menu__panel">
            <button type="button" @click="runWorkflowAction(createBlankModel)">新建草稿</button>
            <button type="button" :disabled="isApiBusy" @click="runWorkflowAction(simulateOrderWorkflow)">生成订单测试流</button>
            <button type="button" @click="runWorkflowAction(applyDesignerLayout)">自动布局</button>
            <button type="button" @click="runWorkflowAction(saveLocalDraft)">保存本地草稿</button>
            <button type="button" :disabled="isApiBusy" @click="runWorkflowAction(startOrderWorkflow)">启动订单流程</button>
            <button type="button" @click="runWorkflowAction(exportSchema)">导出 JSON</button>
          </div>
        </div>
      </div>
    </header>

    <div class="workflow-designer-page__main">
      <ApprovalDesigner
        ref="designerRef"
        v-model="workflowModel"
        class="workflow-designer-page__designer"
        :show-header="false"
        @export="handleDesignerExport"
        @validation="handleValidation"
      />

      <aside class="workflow-designer-page__side">
        <section class="workflow-panel">
          <div class="workflow-panel__header">
            <strong>节点覆盖</strong>
            <span>{{ coveredNodeTypeCount }}/{{ coverageItems.length }}</span>
          </div>

          <div class="workflow-coverage">
            <span
              v-for="item in coverageItems"
              :key="item.type"
              :class="item.covered ? 'workflow-chip workflow-chip--ok' : 'workflow-chip'"
            >
              {{ item.label }}
            </span>
          </div>
        </section>

        <section class="workflow-panel">
          <div class="workflow-panel__header">
            <strong>运行状态</strong>
            <span :class="startedInstanceId ? 'workflow-badge' : 'workflow-badge workflow-badge--muted'">
              {{ startedInstanceId ? '已启动' : '未启动' }}
            </span>
          </div>

          <dl class="workflow-runtime">
            <div>
              <dt>模型</dt>
              <dd>{{ savedModelId || '-' }}</dd>
            </div>
            <div>
              <dt>定义</dt>
              <dd>{{ publishedDefinitionId || '-' }}</dd>
            </div>
            <div>
              <dt>实例</dt>
              <dd>{{ startedInstanceId || '-' }}</dd>
            </div>
            <div>
              <dt>任务</dt>
              <dd>
                <RouterLink v-if="startedTaskRoute" class="workflow-inline-link" :to="startedTaskRoute">
                  {{ startedTaskId }}
                </RouterLink>
                <span v-else>{{ startedTaskId || '-' }}</span>
              </dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ startedTaskStatus || '-' }}</dd>
            </div>
            <div>
              <dt>结果</dt>
              <dd>{{ testRunSummary || '-' }}</dd>
            </div>
          </dl>
        </section>

        <section class="workflow-panel">
          <div class="workflow-panel__header">
            <strong>校验</strong>
            <span>{{ validationIssues.length }}</span>
          </div>

          <ul v-if="validationIssues.length" class="workflow-issues">
            <li v-for="issue in validationIssues" :key="`${issue.path}-${issue.message}`">
              <span>{{ issue.level }}</span>
              {{ issue.path }}：{{ issue.message }}
            </li>
          </ul>
          <p v-else class="workflow-help">Schema OK</p>
        </section>

        <section class="workflow-panel workflow-panel--json">
          <div class="workflow-panel__header">
            <strong>JSON</strong>
            <button type="button" class="workflow-link-button" @click="copySchema">
              复制
            </button>
          </div>
          <textarea v-model="schemaText" spellcheck="false" @change="applySchemaText" />
        </section>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ApprovalDesigner,
  ORDER_APPROVAL_TEST_VARIABLES,
  createTriggerApprovalTestWorkflow,
  createOrderApprovalWorkflow,
  createSimpleApprovalWorkflow,
  parseWorkflowModelJson,
  serializeWorkflowModel,
  type WorkflowModel,
  type WorkflowSchemaIssue
} from '@enlearn/approval-workflow';

const localStorageKey = 'enlearn.workflow.designer.default';
const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const routeCode = computed(() => String(route.params.code ?? '').trim());
const activeStorageKey = computed(() =>
  routeCode.value ? `enlearn.workflow.designer.${routeCode.value}` : localStorageKey
);

const workflowModel = ref<WorkflowModel>(
  createSimpleApprovalWorkflow(
    {
      type: 'initiatorManager',
      level: 1
    },
    {
      code: 'expense_approval',
      name: '费用报销审批',
      documentType: 'expense'
    }
  )
);
type ApprovalDesignerExpose = {
  getSchema: () => WorkflowModel;
  loadSchema: (model: WorkflowModel) => void;
  validate: () => WorkflowSchemaIssue[];
  autoLayout: () => void;
  simulateWorkflowBuild: (model: WorkflowModel, options?: { intervalMs?: number }) => Promise<void>;
};

type WorkflowModelRecord = {
  id: string;
  code: string;
  name: string;
  documentType?: string;
  currentVersion: number;
  draftSchema: WorkflowModel;
};

type WorkflowDefinitionRecord = {
  id: string;
  code: string;
  name: string;
  version: number;
};

type PublishWorkflowResult = {
  model?: WorkflowModelRecord;
  definition: WorkflowDefinitionRecord;
};

type WorkflowTaskStatus = 'pending' | 'claimed' | 'completed' | 'canceled';
type WorkflowRuntimeStatus = 'running' | 'approved' | 'rejected' | 'canceled' | 'terminated' | 'failed';

type WorkflowRuntimeTask = {
  id: string;
  status: WorkflowTaskStatus;
  nodeId: string;
  processInstanceId: string;
  title?: string;
  assigneeId?: string;
  waitpointTokenId?: string;
};

type WorkflowRuntimeInstance = {
  id: string;
  status: WorkflowRuntimeStatus;
  triggerRunId?: string;
  tasks?: WorkflowRuntimeTask[];
};

type ApprovalFlowTestResult = {
  passed: boolean;
  started?: boolean;
  modelId: string;
  definitionId: string;
  instanceId: string;
  instanceStatus: WorkflowRuntimeStatus;
  triggerRunId?: string;
  approvedSteps: Array<{
    taskId: string;
    nodeId: string;
    assigneeId?: string;
    status: string;
    comment: string;
  }>;
  pendingTasks?: WorkflowRuntimeTask[];
  nextTask?: WorkflowRuntimeTask;
  nextTaskRoute?: string;
  finalTasks: WorkflowRuntimeTask[];
  testData: {
    businessKey: string;
    documentType: string;
    schema: WorkflowModel;
    variables: Record<string, unknown>;
  };
};

const designerRef = ref<ApprovalDesignerExpose | null>(null);
const validationIssues = ref<WorkflowSchemaIssue[]>([]);
const schemaText = ref(serializeWorkflowModel(workflowModel.value));
const message = ref('');
const messageClass = ref('workflow-help');
const isApplyingSchemaText = ref(false);
const isApiBusy = ref(false);
const savedModelId = ref('');
const publishedDefinitionId = ref('');
const startedInstanceId = ref('');
const startedTaskId = ref('');
const startedTaskStatus = ref('');
const testRunSummary = ref('');
const actionsMenuOpen = ref(false);

const nodeTypeCoverageLabels = [
  { type: 'start', label: '开始' },
  { type: 'serviceTask', label: '服务' },
  { type: 'condition', label: '条件' },
  { type: 'approval', label: '审批' },
  { type: 'sign', label: '会签' },
  { type: 'orSign', label: '或签' },
  { type: 'parallelGateway', label: '并行' },
  { type: 'subProcess', label: '子流程' },
  { type: 'cc', label: '抄送' },
  { type: 'timer', label: '定时' },
  { type: 'end', label: '结束' }
];

const validationErrors = computed(() =>
  validationIssues.value.filter((issue) => issue.level === 'error')
);
const startedTaskRoute = computed(() =>
  startedTaskId.value ? `/dashboard/workflow/tasks/${startedTaskId.value}` : ''
);
const coverageItems = computed(() => {
  const usedTypes = new Set(workflowModel.value.nodes.map((node) => node.type));

  return nodeTypeCoverageLabels.map((item) => ({
    ...item,
    covered: usedTypes.has(item.type)
  }));
});
const coveredNodeTypeCount = computed(() => coverageItems.value.filter((item) => item.covered).length);
const documentTypeInput = computed({
  get: () => workflowModel.value.documentType ?? '',
  set: (value: string) => {
    workflowModel.value = {
      ...workflowModel.value,
      documentType: value.trim() || undefined
    };
  }
});

watch(
  workflowModel,
  (model) => {
    if (isApplyingSchemaText.value) return;
    schemaText.value = serializeWorkflowModel(model);
  },
  {
    deep: true
  }
);

onMounted(() => {
  window.addEventListener('click', closeActionMenu);
  void loadInitialWorkflow();
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeActionMenu);
});

watch(routeCode, (nextCode, previousCode) => {
  if (nextCode !== previousCode) void loadInitialWorkflow();
});

async function loadInitialWorkflow() {
  resetRuntimeState();
  savedModelId.value = '';
  publishedDefinitionId.value = '';

  if (routeCode.value) {
    isApiBusy.value = true;
    message.value = '正在加载审批模板...';
    messageClass.value = 'workflow-help';

    try {
      const model = await invokeWorkflowService<WorkflowModelRecord>('getModel', {
        modelId: routeCode.value
      });
      const schema = parseWorkflowModelJson(JSON.stringify(model.draftSchema));

      workflowModel.value = schema;
      savedModelId.value = model.id;
      schemaText.value = serializeWorkflowModel(schema);
      designerRef.value?.loadSchema(schema);
      message.value = `已加载审批模板 ${model.name}`;
      messageClass.value = 'workflow-success';
      return;
    } catch (error) {
      message.value = error instanceof Error ? error.message : '审批模板加载失败';
      messageClass.value = 'workflow-error';
    } finally {
      isApiBusy.value = false;
    }
  }

  loadLocalDraft();
}

function loadLocalDraft() {
  const saved = window.localStorage.getItem(activeStorageKey.value);
  if (!saved) return;

  try {
    const schema = parseWorkflowModelJson(saved);
    workflowModel.value = schema;
    schemaText.value = serializeWorkflowModel(schema);
    designerRef.value?.loadSchema(schema);
    message.value = '已加载本地草稿';
    messageClass.value = 'workflow-help';
  } catch {
    window.localStorage.removeItem(activeStorageKey.value);
  }
}

function toggleActionMenu(event: MouseEvent) {
  event.stopPropagation();
  actionsMenuOpen.value = !actionsMenuOpen.value;
}

function closeActionMenu() {
  actionsMenuOpen.value = false;
}

function runWorkflowAction(action: () => void | Promise<void>) {
  actionsMenuOpen.value = false;
  void action();
}

function handleValidation(issues: WorkflowSchemaIssue[]) {
  validationIssues.value = issues;
}

function handleDesignerExport(model: WorkflowModel) {
  schemaText.value = serializeWorkflowModel(model);
  message.value = '已刷新 JSON';
  messageClass.value = 'workflow-help';
}

function createBlankModel() {
  workflowModel.value = createSimpleApprovalWorkflow(
    {
      type: 'initiatorManager',
      level: 1
    },
    {
      code: 'approval_workflow',
      name: '审批流程',
      documentType: 'document'
    }
  );
  savedModelId.value = '';
  publishedDefinitionId.value = '';
  resetRuntimeState();
  message.value = '已新建草稿';
  messageClass.value = 'workflow-help';
}

function loadTriggerApprovalTestWorkflow() {
  const currentUserId = auth.activeDevTestUser.value?.id ?? auth.user.value?.id ?? 'approval-test-user';
  const approverIds = auth.devTestUsers.value
    .map((user) => user.id)
    .filter((userId) => userId !== currentUserId)
    .slice(0, 3);
  const model = createTriggerApprovalTestWorkflow({
    code: 'trigger_approval_test',
    name: 'Trigger.dev 测试审批流',
    documentType: 'approval_flow_test',
    requesterId: currentUserId,
    approverIds
  });

  savedModelId.value = '';
  publishedDefinitionId.value = '';
  resetRuntimeState();
  workflowModel.value = model;
  designerRef.value?.loadSchema(model);
  schemaText.value = serializeWorkflowModel(model);
  void nextTick(() => designerRef.value?.autoLayout());
  message.value = `已加载测试流程，发起人：${auth.activeDevTestUser.value?.name ?? auth.user.value?.email ?? currentUserId}`;
  messageClass.value = 'workflow-success';
}

async function simulateOrderWorkflow() {
  const orderWorkflow = createOrderApprovalWorkflow();

  savedModelId.value = '';
  publishedDefinitionId.value = '';
  resetRuntimeState();
  message.value = '正在模拟拖入订单审批节点...';
  messageClass.value = 'workflow-help';

  if (designerRef.value?.simulateWorkflowBuild) {
    await designerRef.value.simulateWorkflowBuild(orderWorkflow, { intervalMs: 120 });
    workflowModel.value = designerRef.value.getSchema();
  } else {
    workflowModel.value = orderWorkflow;
  }

  schemaText.value = serializeWorkflowModel(workflowModel.value);
  message.value = '订单审批流测试已生成';
  messageClass.value = 'workflow-success';
}

function applyDesignerLayout() {
  designerRef.value?.autoLayout();
  schemaText.value = serializeWorkflowModel(workflowModel.value);
  message.value = '已自动整理画布';
  messageClass.value = 'workflow-help';
}

function saveLocalDraft() {
  const issues = designerRef.value?.validate() ?? [];
  validationIssues.value = issues;

  if (issues.some((issue) => issue.level === 'error')) {
    message.value = '流程校验未通过';
    messageClass.value = 'workflow-error';
    return;
  }

  const serialized = serializeWorkflowModel(workflowModel.value);
  window.localStorage.setItem(activeStorageKey.value, serialized);
  window.localStorage.setItem(localStorageKey, serialized);
  window.localStorage.setItem(`enlearn.workflow.designer.${workflowModel.value.code}`, serialized);
  message.value = '已保存本地草稿';
  messageClass.value = 'workflow-success';
}

function exportSchema() {
  schemaText.value = serializeWorkflowModel(workflowModel.value);
  message.value = '已导出 JSON';
  messageClass.value = 'workflow-help';
}

async function copySchema() {
  schemaText.value = serializeWorkflowModel(workflowModel.value);
  await navigator.clipboard?.writeText(schemaText.value);
  message.value = 'JSON 已复制';
  messageClass.value = 'workflow-success';
}

function applySchemaText() {
  try {
    isApplyingSchemaText.value = true;
    workflowModel.value = parseWorkflowModelJson(schemaText.value);
    void nextTick(() => designerRef.value?.autoLayout());
    message.value = 'JSON 已应用';
    messageClass.value = 'workflow-success';
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'JSON 无法应用';
    messageClass.value = 'workflow-error';
  } finally {
    isApplyingSchemaText.value = false;
  }
}

async function saveAndPublish() {
  isApiBusy.value = true;
  message.value = '正在保存并发布...';
  messageClass.value = 'workflow-help';

  try {
    const published = await publishCurrentWorkflow();
    savedModelId.value = published.model?.id ?? savedModelId.value;
    publishedDefinitionId.value = published.definition.id;
    message.value = `已发布 ${published.definition.code} v${published.definition.version}`;
    messageClass.value = 'workflow-success';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存发布失败';
    messageClass.value = 'workflow-error';
  } finally {
    isApiBusy.value = false;
  }
}

async function startOrderWorkflow() {
  isApiBusy.value = true;
  resetRuntimeState();
  message.value = '正在启动订单流程...';
  messageClass.value = 'workflow-help';

  try {
    const definitionId = publishedDefinitionId.value || (await publishCurrentWorkflow()).definition.id;
    const businessKey = `${ORDER_APPROVAL_TEST_VARIABLES.orderNo}-${Date.now().toString(36)}`;
    const instance = await workflowApi<WorkflowRuntimeInstance>('/instances', {
      method: 'POST',
      body: JSON.stringify({
        definitionId,
        businessKey,
        documentType: 'order',
        documentId: ORDER_APPROVAL_TEST_VARIABLES.orderNo,
        title: `订单审批 ${ORDER_APPROVAL_TEST_VARIABLES.orderNo}`,
        variables: ORDER_APPROVAL_TEST_VARIABLES
      })
    });

    updateRuntimeFromInstance(instance);
    message.value = `流程已启动，状态 ${instance.status}，待办 ${instance.tasks?.length ?? 0} 个`;
    messageClass.value = 'workflow-success';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '启动流程失败';
    messageClass.value = 'workflow-error';
  } finally {
    isApiBusy.value = false;
  }
}

async function runMinimalApprovalOneClickTest() {
  isApiBusy.value = true;
  resetRuntimeState();
  message.value = '正在发起审批一键测试...';
  messageClass.value = 'workflow-help';

  try {
    testRunSummary.value = '后端保存并发起测试审批';
    const schema = designerRef.value?.getSchema() ?? workflowModel.value;
    const testUserId = auth.activeDevTestUser.value?.id ?? auth.user.value?.id;
    const approverIds = auth.devTestUsers.value
      .map((user) => user.id)
      .filter((userId) => userId && userId !== testUserId)
      .slice(0, 3);
    const result = await invokeWorkflowService<ApprovalFlowTestResult>('runApprovalFlowTest', {
      timeoutMs: 90000,
      intervalMs: 2000,
      userId: testUserId,
      approverIds,
      schema
    });

    workflowModel.value = result.testData.schema;
    designerRef.value?.loadSchema(result.testData.schema);
    schemaText.value = serializeWorkflowModel(result.testData.schema);
    savedModelId.value = result.modelId;
    publishedDefinitionId.value = result.definitionId;
    startedInstanceId.value = result.instanceId;
    startedTaskId.value =
      result.nextTask?.id ??
      result.pendingTasks?.[0]?.id ??
      result.finalTasks.find((task) => task.status === 'pending' || task.status === 'claimed')?.id ??
      '';
    const displayedTaskStatus = result.finalTasks.find((task) => task.id === startedTaskId.value)?.status;
    startedTaskStatus.value =
      displayedTaskStatus ? workflowStatusLabel(displayedTaskStatus) : workflowStatusLabel(result.instanceStatus);

    if (result.instanceStatus === 'running' && startedTaskId.value) {
      const assigneeId = result.nextTask?.assigneeId ?? result.pendingTasks?.[0]?.assigneeId ?? '';
      const approverLabel = auth.devTestUsers.value.find((user) => user.id === assigneeId)?.name ?? assigneeId;
      testRunSummary.value = `已发起审批，待 ${approverLabel || '审批人'} 处理`;
      message.value = `测试审批已发起。请切换到审批人 ${approverLabel || assigneeId}，从消息提醒进入审批页面处理。`;
    } else if (result.passed || result.instanceStatus === 'approved') {
      testRunSummary.value = '流程已自动结束';
      message.value = `测试审批已完成：实例 ${result.instanceId} 已${workflowStatusLabel(result.instanceStatus)}。`;
    } else {
      throw new Error(`测试审批已发起但未生成待办，实例状态：${workflowStatusLabel(result.instanceStatus)}`);
    }
    messageClass.value = 'workflow-success';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '审批流一键测试失败';
    testRunSummary.value = errorMessage;
    message.value = errorMessage;
    messageClass.value = 'workflow-error';
  } finally {
    isApiBusy.value = false;
  }
}

async function publishCurrentWorkflow() {
  const schema = designerRef.value?.getSchema() ?? workflowModel.value;
  const issues = designerRef.value?.validate() ?? validationIssues.value;
  validationIssues.value = issues;

  if (issues.some((issue) => issue.level === 'error')) {
    throw new Error('流程校验未通过，无法发布');
  }

  const serialized = serializeWorkflowModel(schema);
  window.localStorage.setItem(activeStorageKey.value, serialized);
  window.localStorage.setItem(localStorageKey, serialized);
  window.localStorage.setItem(`enlearn.workflow.designer.${schema.code}`, serialized);

  const modelPayload = {
    code: schema.code,
    name: schema.name,
    documentType: schema.documentType,
    schema
  };
  const model = savedModelId.value
    ? await invokeWorkflowService<WorkflowModelRecord>('updateModel', {
        modelId: savedModelId.value,
        ...modelPayload
      })
    : await workflowApi<WorkflowModelRecord>('/models', {
        method: 'POST',
        body: JSON.stringify(modelPayload)
      });
  savedModelId.value = model.id;

  const published = await workflowApi<PublishWorkflowResult>(`/models/${model.id}/publish`, {
    method: 'POST',
    body: JSON.stringify({
      remark: '订单审批流设计器测试发布'
    })
  });
  publishedDefinitionId.value = published.definition.id;

  return published;
}

async function workflowApi<T>(path: string, init: RequestInit = {}) {
  const body = parseWorkflowBody(init.body);
  const publishMatch = path.match(/^\/models\/([^/]+)\/publish$/);

  if (path === '/models') {
    return invokeWorkflowService<T>('saveModel', body);
  }

  if (publishMatch) {
    return invokeWorkflowService<T>('publishModel', {
      modelId: publishMatch[1],
      ...body
    });
  }

  if (path === '/instances') {
    return invokeWorkflowService<T>('startInstance', body);
  }

  throw new Error(`Unsupported workflow API path: ${path}`);
}

function createDesignerTestVariables(businessKey: string, currentUserId: string) {
  return {
    ...ORDER_APPROVAL_TEST_VARIABLES,
    applicantId: currentUserId,
    businessKey,
    currentUserId,
    designerTest: true,
    documentId: businessKey,
    initiatorId: currentUserId,
    userId: currentUserId
  };
}

function resetRuntimeState() {
  startedInstanceId.value = '';
  startedTaskId.value = '';
  startedTaskStatus.value = '';
  testRunSummary.value = '';
}

function updateRuntimeFromInstance(instance: WorkflowRuntimeInstance) {
  startedInstanceId.value = instance.id;
  const task =
    instance.tasks?.find((item) => item.status === 'pending' || item.status === 'claimed') ??
    instance.tasks?.at(-1);

  if (task) {
    startedTaskId.value = task.id;
    startedTaskStatus.value = workflowStatusLabel(task.status);
  }
}

function workflowStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    approved: '已通过',
    canceled: '已取消',
    claimed: '已认领',
    completed: '已完成',
    failed: '失败',
    pending: '待审核',
    rejected: '已驳回',
    running: '流转中',
    terminated: '已终止'
  };

  return labels[status ?? ''] ?? status ?? '-';
}

function parseWorkflowBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string' || !body.trim()) return {};

  const parsed = JSON.parse(body) as unknown;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

async function invokeWorkflowService<T>(serviceMethod: string, postData: Record<string, unknown>) {
  const userId = auth.activeDevTestUser.value?.id ?? auth.user.value?.id;
  if (!userId) {
    throw new Error('请先登录后再操作审批流');
  }

  return serviceApi.invoke<T>('workflow', serviceMethod, {
    ...postData,
    tenantId: 'default',
    userId
  });
}
</script>

<style scoped>
.workflow-designer-page {
  display: grid;
  gap: 6px;
  min-height: calc(100vh - 62px);
  color: #172033;
}

.workflow-designer-page__toolbar {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid #d5deea;
  border-radius: 5px 5px 0 0;
  background: #ffffff;
  box-shadow: none;
  padding: 5px 10px;
}

.workflow-designer-page__identity {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.workflow-designer-page__kicker {
  color: #5b6b85;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 12px;
}

.workflow-title-field {
  display: grid;
  grid-template-columns: 0 minmax(0, 520px);
  gap: 0;
}

.workflow-title-field span {
  overflow: hidden;
  width: 0;
  height: 0;
}

.workflow-title-field input {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #0f172a;
  font: inherit;
  font-size: 17px;
  font-weight: 900;
  line-height: 21px;
  outline: none;
  padding: 0;
}

.workflow-designer-page__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 8px;
  color: #64748b;
  font-size: 11px;
  line-height: 16px;
}

.workflow-inline-field {
  display: inline-grid;
  grid-template-columns: auto minmax(112px, 170px);
  align-items: center;
  gap: 5px;
}

.workflow-inline-field span {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.workflow-inline-field input {
  width: 100%;
  min-height: 26px;
  border: 1px solid #d5deea;
  border-radius: 5px;
  background: #ffffff;
  color: #172033;
  font: inherit;
  font-size: 11px;
  outline: none;
  padding: 0 8px;
}

.workflow-inline-field input:focus,
.workflow-title-field input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.11);
}

.workflow-designer-page__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.workflow-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  gap: 4px;
  border: 1px solid #c6d0df;
  border-radius: 5px;
  background: #ffffff;
  color: #1f2937;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 14px;
  padding: 0 8px;
}

.workflow-button i {
  font-size: 14px;
  line-height: 1;
}

.workflow-button:hover:not(:disabled) {
  border-color: #96a4b8;
  background: #f8fafc;
}

.workflow-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workflow-button--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.workflow-button--primary:hover:not(:disabled) {
  border-color: #115e59;
  background: #115e59;
}

.workflow-button--ghost {
  background: #f8fafc;
}

.workflow-button--test {
  border-color: #a7f3d0;
  background: #ecfdf5;
  color: #047857;
}

.workflow-button--test:hover:not(:disabled) {
  border-color: #6ee7b7;
  background: #d1fae5;
}

.workflow-action-menu {
  position: relative;
}

.workflow-action-menu__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 50;
  display: grid;
  width: 178px;
  gap: 3px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
  padding: 5px;
}

.workflow-action-menu__panel button {
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #243044;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 8px;
  text-align: left;
}

.workflow-action-menu__panel button:hover:not(:disabled) {
  background: #f1f5f9;
}

.workflow-action-menu__panel button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.workflow-designer-page__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 318px;
  gap: 6px;
  align-items: start;
}

.workflow-designer-page__designer {
  min-height: calc(100vh - 112px);
  border-top: 0;
  border-radius: 0 0 6px 6px;
}

.workflow-designer-page__side {
  display: grid;
  gap: 7px;
}

.workflow-panel {
  display: grid;
  gap: 6px;
  border: 1px solid #d5deea;
  border-radius: 5px;
  background: #ffffff;
  box-shadow: none;
  color: #1f2937;
  padding: 8px;
}

.workflow-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workflow-panel__header strong {
  color: #0f172a;
  font-size: 12px;
  line-height: 16px;
}

.workflow-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  font-size: 11px;
  font-weight: 800;
  padding: 0 7px;
}

.workflow-badge--danger {
  background: #fef2f2;
  color: #b91c1c;
}

.workflow-badge--muted {
  background: #f1f5f9;
  color: #64748b;
}

.workflow-field {
  display: grid;
  gap: 5px;
  color: #475569;
  font-size: 13px;
}

.workflow-field input {
  width: 100%;
  min-height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #111827;
  padding: 0 10px;
}

.workflow-issues {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workflow-issues li {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  color: #78350f;
  font-size: 11px;
  line-height: 16px;
  padding: 7px 8px;
}

.workflow-issues span {
  margin-right: 4px;
  font-weight: 700;
  text-transform: uppercase;
}

.workflow-coverage {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.workflow-chip {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #f8fafc;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  padding: 1px 7px;
}

.workflow-chip--ok {
  border-color: #99f6e4;
  background: #f0fdfa;
  color: #0f766e;
}

.workflow-runtime {
  display: grid;
  gap: 7px;
  margin: 0;
}

.workflow-runtime div {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 8px;
}

.workflow-runtime dt {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.workflow-runtime dd {
  overflow: hidden;
  margin: 0;
  color: #111827;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-panel--json textarea {
  min-height: 150px;
  width: 100%;
  resize: vertical;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  padding: 10px;
}

.workflow-link-button {
  border: 0;
  background: transparent;
  color: #0f766e;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.workflow-inline-link {
  color: #0f766e;
  font-weight: 700;
  text-decoration: none;
}

.workflow-inline-link:hover {
  text-decoration: underline;
}

.workflow-help,
.workflow-success,
.workflow-error {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
}

.workflow-help {
  color: #64748b;
}

.workflow-success {
  color: #047857;
}

.workflow-error {
  color: #b91c1c;
}

@media (max-width: 1100px) {
  .workflow-designer-page__main {
    grid-template-columns: 1fr;
  }

  .workflow-designer-page__designer {
    min-height: 520px;
  }
}

@media (max-width: 760px) {
  .workflow-designer-page__toolbar {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .workflow-designer-page__actions {
    justify-content: flex-start;
  }

  .workflow-title-field {
    grid-template-columns: 0 minmax(0, 1fr);
  }

  .workflow-inline-field {
    grid-template-columns: 42px minmax(0, 1fr);
    width: 100%;
  }
}
</style>
