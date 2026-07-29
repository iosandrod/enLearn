<template>
  <section class="workflow-designer-page">
    <div class="workflow-designer-page__toolbar">
      <div>
        <h2 class="page-title">审批流设计器</h2>
        <p class="page-description">
          {{ workflowModel.code }} · {{ workflowModel.documentType || '未绑定单据' }}
        </p>
      </div>

      <div class="workflow-designer-page__actions">
        <button type="button" class="workflow-button" @click="createBlankModel">
          新建
        </button>
        <button type="button" class="workflow-button" :disabled="isApiBusy" @click="simulateOrderWorkflow">
          订单审批流测试
        </button>
        <button type="button" class="workflow-button" @click="applyDesignerLayout">
          自动布局
        </button>
        <button type="button" class="workflow-button" @click="saveLocalDraft">
          保存
        </button>
        <button type="button" class="workflow-button workflow-button--primary" :disabled="isApiBusy" @click="saveAndPublish">
          保存并发布
        </button>
        <button type="button" class="workflow-button workflow-button--primary" :disabled="isApiBusy" @click="startCurrentUserMinimalApproval">
          开始最小审批
        </button>
        <button type="button" class="workflow-button workflow-button--primary" :disabled="isApiBusy" @click="startOrderWorkflow">
          启动订单流程
        </button>
        <button type="button" class="workflow-button workflow-button--primary" :disabled="isApiBusy" @click="testCurrentWorkflow">
          一键测试
        </button>
        <button type="button" class="workflow-button workflow-button--primary" @click="exportSchema">
          导出
        </button>
      </div>
    </div>

    <div class="workflow-designer-page__main">
      <ApprovalDesigner
        ref="designerRef"
        v-model="workflowModel"
        class="workflow-designer-page__designer"
        @export="handleDesignerExport"
        @validation="handleValidation"
      />

      <aside class="workflow-designer-page__side">
        <section class="workflow-panel">
          <div class="workflow-panel__header">
            <strong>流程信息</strong>
            <span :class="validationErrors.length ? 'workflow-badge workflow-badge--danger' : 'workflow-badge'">
              {{ validationErrors.length ? '未通过' : '可发布' }}
            </span>
          </div>

          <label class="workflow-field">
            <span>编码</span>
            <input v-model="workflowModel.code" />
          </label>
          <label class="workflow-field">
            <span>名称</span>
            <input v-model="workflowModel.name" />
          </label>
          <label class="workflow-field">
            <span>单据类型</span>
            <input v-model="documentTypeInput" />
          </label>

          <p v-if="message" :class="messageClass">{{ message }}</p>
        </section>

        <section class="workflow-panel">
          <div class="workflow-panel__header">
            <strong>订单测试覆盖</strong>
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
                <NuxtLink v-if="startedTaskRoute" class="workflow-inline-link" :to="startedTaskRoute">
                  {{ startedTaskId }}
                </NuxtLink>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  ApprovalDesigner,
  ORDER_APPROVAL_TEST_VARIABLES,
  createOrderApprovalWorkflow,
  createSimpleApprovalWorkflow,
  parseWorkflowModelJson,
  serializeWorkflowModel,
  type WorkflowModel,
  type WorkflowSchemaIssue
} from '@enlearn/approval-workflow';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const localStorageKey = 'enlearn.workflow.designer.default';
const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const router = useRouter();
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

const terminalWorkflowStatuses = new Set<WorkflowRuntimeStatus>([
  'approved',
  'rejected',
  'canceled',
  'terminated',
  'failed'
]);

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
  const saved = window.localStorage.getItem(activeStorageKey.value);
  if (!saved) return;

  try {
    workflowModel.value = parseWorkflowModelJson(saved);
    schemaText.value = serializeWorkflowModel(workflowModel.value);
    message.value = '已加载本地草稿';
    messageClass.value = 'workflow-help';
  } catch {
    window.localStorage.removeItem(localStorageKey);
  }
});

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

async function startCurrentUserMinimalApproval() {
  isApiBusy.value = true;
  resetRuntimeState();
  message.value = '正在生成当前用户最小审批...';
  messageClass.value = 'workflow-help';

  try {
    const currentUserId = auth.user.value?.id ?? '';
    if (!currentUserId) {
      throw new Error('请先登录后再启动当前用户最小审批');
    }

    const businessKey = `current-user-minimal-${Date.now().toString(36)}`;
    const minimalWorkflow = createSimpleApprovalWorkflow(
      {
        type: 'users',
        userIds: [currentUserId]
      },
      {
        code: 'current_user_minimal_approval',
        name: '当前用户最小审批',
        documentType: 'minimal_approval'
      }
    );

    workflowModel.value = minimalWorkflow;
    designerRef.value?.loadSchema(minimalWorkflow);
    schemaText.value = serializeWorkflowModel(minimalWorkflow);
    savedModelId.value = '';
    publishedDefinitionId.value = '';
    await nextTick();

    message.value = '已生成最小审批，正在发布并通过 Trigger.dev 启动...';
    const published = await publishCurrentWorkflow();
    savedModelId.value = published.model?.id ?? savedModelId.value;
    publishedDefinitionId.value = published.definition.id;

    const instance = await invokeWorkflowService<WorkflowRuntimeInstance>('startInstance', {
      definitionId: published.definition.id,
      businessKey,
      documentType: 'minimal_approval',
      documentId: businessKey,
      title: '当前用户最小审批',
      variables: createMinimalApprovalVariables(businessKey, currentUserId)
    });

    updateRuntimeFromInstance(instance);
    testRunSummary.value = '等待当前用户待办';
    message.value = '流程已启动，正在等待当前用户审批任务...';

    const task = await waitForWorkflowCondition<WorkflowRuntimeTask>(
      async () => {
        const [tasks, currentInstance] = await Promise.all([
          invokeWorkflowService<WorkflowRuntimeTask[]>('listTodoTasks', { status: 'pending' }),
          invokeWorkflowService<WorkflowRuntimeInstance>('getInstance', { instanceId: instance.id })
        ]);
        updateRuntimeFromInstance(currentInstance);

        if (isTerminalWorkflowStatus(currentInstance.status)) {
          throw new Error(`流程已结束，状态 ${workflowStatusLabel(currentInstance.status)}，没有可审核待办`);
        }

        return tasks.find((item) => item.processInstanceId === instance.id && item.status === 'pending');
      },
      {
        timeoutMs: 60000,
        intervalMs: 2000,
        timeoutMessage: '60 秒内没有生成当前用户待办，请检查 Trigger.dev worker 是否在线'
      }
    );

    startedTaskId.value = task.id;
    startedTaskStatus.value = workflowStatusLabel(task.status);
    testRunSummary.value = '当前用户待办已生成';
    message.value = `当前用户已收到审批任务 ${task.title ?? task.id}`;
    messageClass.value = 'workflow-success';
    await router.push(`/dashboard/workflow/tasks/${task.id}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '当前用户最小审批启动失败';
    testRunSummary.value = errorMessage;
    message.value = errorMessage;
    messageClass.value = 'workflow-error';
  } finally {
    isApiBusy.value = false;
  }
}

async function testCurrentWorkflow() {
  isApiBusy.value = true;
  resetRuntimeState();
  message.value = '正在发布并测试审批流程...';
  messageClass.value = 'workflow-help';

  try {
    const schema = designerRef.value?.getSchema() ?? workflowModel.value;
    const published = await publishCurrentWorkflow();
    const currentUserId = auth.user.value?.id ?? '';
    const businessKey = `${schema.code || 'workflow'}-test-${Date.now().toString(36)}`;
    const documentType = schema.documentType?.trim() || 'workflow_test';
    const variables = createDesignerTestVariables(businessKey, currentUserId);

    message.value = '已发布，正在启动测试流程...';
    const instance = await invokeWorkflowService<WorkflowRuntimeInstance>('startInstance', {
      definitionId: published.definition.id,
      businessKey,
      documentType,
      documentId: businessKey,
      title: `${schema.name || schema.code || '审批流程'}一键测试`,
      variables
    });

    updateRuntimeFromInstance(instance);
    testRunSummary.value = '等待待办';
    message.value = '流程已启动，正在等待当前用户待办...';

    const task = await waitForWorkflowCondition<WorkflowRuntimeTask>(
      async () => {
        const [tasks, currentInstance] = await Promise.all([
          invokeWorkflowService<WorkflowRuntimeTask[]>('listTodoTasks', { status: 'pending' }),
          invokeWorkflowService<WorkflowRuntimeInstance>('getInstance', { instanceId: instance.id })
        ]);
        updateRuntimeFromInstance(currentInstance);

        if (isTerminalWorkflowStatus(currentInstance.status)) {
          throw new Error(`流程已结束，状态 ${workflowStatusLabel(currentInstance.status)}，没有可审核待办`);
        }

        return tasks.find((item) => item.processInstanceId === instance.id && item.status === 'pending');
      },
      {
        timeoutMs: 60000,
        intervalMs: 2000,
        timeoutMessage: '60 秒内没有生成当前用户的待办，请检查审批人配置或 Trigger.dev worker'
      }
    );

    startedTaskId.value = task.id;
    startedTaskStatus.value = workflowStatusLabel(task.status);
    testRunSummary.value = '待办已生成，审核中';
    message.value = `已找到待办 ${task.title ?? task.id}，正在自动审核...`;

    const approvedInstance = await invokeWorkflowService<WorkflowRuntimeInstance>('approveTask', {
      taskId: task.id,
      comment: '设计器一键测试通过',
      variables: {
        approvedAt: new Date().toISOString(),
        approvedBy: currentUserId,
        designerTestApproved: true
      }
    });
    updateRuntimeFromInstance(approvedInstance);
    startedTaskStatus.value = '已审核';
    testRunSummary.value = '已审核，等待流程结束';
    message.value = '审核已通过，正在等待流程完成...';

    const finalInstance = isTerminalWorkflowStatus(approvedInstance.status)
      ? approvedInstance
      : await waitForWorkflowCondition<WorkflowRuntimeInstance>(
          async () => {
            const currentInstance = await invokeWorkflowService<WorkflowRuntimeInstance>('getInstance', {
              instanceId: instance.id
            });
            updateRuntimeFromInstance(currentInstance);

            return isTerminalWorkflowStatus(currentInstance.status) ? currentInstance : undefined;
          },
          {
            timeoutMs: 90000,
            intervalMs: 3000,
            timeoutMessage: '审批已提交，但流程 90 秒内未结束，请检查 Trigger.dev waitpoint 是否恢复父运行'
          }
        );

    updateRuntimeFromInstance(finalInstance);
    startedTaskStatus.value = '已审核';
    testRunSummary.value = `完成：${workflowStatusLabel(finalInstance.status)}`;
    message.value = `一键测试完成，流程状态 ${workflowStatusLabel(finalInstance.status)}`;
    messageClass.value = finalInstance.status === 'approved' ? 'workflow-success' : 'workflow-error';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '一键测试失败';
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

  const model = await workflowApi<WorkflowModelRecord>('/models', {
    method: 'POST',
    body: JSON.stringify({
      code: schema.code,
      name: schema.name,
      documentType: schema.documentType,
      schema
    })
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

async function waitForWorkflowCondition<T>(
  resolver: () => Promise<T | undefined>,
  options: { timeoutMs: number; intervalMs: number; timeoutMessage: string }
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= options.timeoutMs) {
    const result = await resolver();
    if (result) return result;
    await wait(options.intervalMs);
  }

  throw new Error(options.timeoutMessage);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
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

function createMinimalApprovalVariables(businessKey: string, currentUserId: string) {
  return {
    applicantId: currentUserId,
    businessKey,
    currentUserId,
    documentId: businessKey,
    initiatorId: currentUserId,
    minimalApproval: true,
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

function isTerminalWorkflowStatus(status: WorkflowRuntimeStatus) {
  return terminalWorkflowStatuses.has(status);
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
  const userId = auth.user.value?.id;
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
  gap: 14px;
}

.workflow-designer-page__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid #d9dee8;
  border-radius: 8px;
  background: #ffffff;
  padding: 16px 18px;
}

.workflow-designer-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workflow-button {
  min-height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #1f2937;
  cursor: pointer;
  padding: 0 13px;
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

.workflow-designer-page__main {
  display: grid;
  grid-template-columns: minmax(520px, 1fr) 360px;
  gap: 14px;
  align-items: start;
}

.workflow-designer-page__designer {
  min-height: calc(100vh - 150px);
}

.workflow-designer-page__side {
  display: grid;
  gap: 12px;
}

.workflow-panel {
  display: grid;
  gap: 12px;
  border: 1px solid #d9dee8;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2937;
  padding: 14px;
}

.workflow-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workflow-badge {
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  font-size: 12px;
  padding: 3px 8px;
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
  font-size: 12px;
  padding: 8px;
}

.workflow-issues span {
  margin-right: 4px;
  font-weight: 700;
  text-transform: uppercase;
}

.workflow-coverage {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.workflow-chip {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
  padding: 3px 8px;
}

.workflow-chip--ok {
  border-color: #99f6e4;
  background: #f0fdfa;
  color: #0f766e;
}

.workflow-runtime {
  display: grid;
  gap: 8px;
  margin: 0;
}

.workflow-runtime div {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
}

.workflow-runtime dt {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.workflow-runtime dd {
  overflow: hidden;
  margin: 0;
  color: #111827;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-panel--json textarea {
  min-height: 260px;
  width: 100%;
  resize: vertical;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  padding: 12px;
}

.workflow-link-button {
  border: 0;
  background: transparent;
  color: #0f766e;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
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
  font-size: 13px;
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
    min-height: 560px;
  }
}

@media (max-width: 760px) {
  .workflow-designer-page__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .workflow-designer-page__actions {
    justify-content: flex-start;
  }
}
</style>
