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
        <button type="button" class="workflow-button workflow-button--monitor" :disabled="runtimeMonitorLoading" @click="openRuntimeMonitor">
          <i class="ri-pulse-line" aria-hidden="true" />
          运行监控
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
        :node-form-schemas="nodeFormSchemas"
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
          <JsonDialogInput
            :model-value="schemaText"
            name="workflowSchema"
            label="Workflow Schema JSON"
            title="编辑 Workflow Schema JSON"
            :rows="18"
            root-type="object"
            value-mode="string"
            @update:model-value="applySchemaJsonValue"
          />
        </section>
      </aside>
    </div>

    <Teleport to="body">
      <div v-if="runtimeMonitorOpen" class="runtime-monitor-mask" @click.self="closeRuntimeMonitor">
        <section class="runtime-monitor-dialog" role="dialog" aria-modal="true" aria-labelledby="runtime-monitor-title">
          <header class="runtime-monitor-header">
            <div class="runtime-monitor-heading">
              <div class="runtime-monitor-title-row">
                <h2 id="runtime-monitor-title">Trigger.dev 运行监控</h2>
                <span :class="runtimeEngineBadgeClass">{{ runtimeEngineLabel }}</span>
              </div>
              <p>{{ runtimeMonitorData?.engine.projectRef || 'Trigger.dev 项目状态' }}</p>
            </div>
            <div class="runtime-monitor-header-actions">
              <button class="runtime-monitor-icon-button" type="button" title="刷新运行状态" :disabled="runtimeMonitorLoading" @click="loadRuntimeMonitor">
                <i :class="runtimeMonitorLoading ? 'ri-loader-4-line runtime-monitor-spin' : 'ri-refresh-line'" aria-hidden="true" />
              </button>
              <button class="runtime-monitor-icon-button" type="button" title="关闭" @click="closeRuntimeMonitor">
                <i class="ri-close-line" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div v-if="runtimeMonitorErrorText" class="runtime-monitor-alert" role="alert">
            <i class="ri-error-warning-line" aria-hidden="true" />
            <span>{{ runtimeMonitorErrorText }}</span>
          </div>

          <template v-if="runtimeMonitorData">
            <div class="runtime-monitor-metrics">
              <div>
                <span>队列排队</span>
                <strong>{{ runtimeMonitorData.summary.queuedRuns }}</strong>
              </div>
              <div>
                <span>队列运行</span>
                <strong>{{ runtimeMonitorData.summary.runningRuns }}</strong>
              </div>
              <div>
                <span>待处理 Run</span>
                <strong>{{ runtimeMonitorData.summary.waitingRuns }}</strong>
              </div>
              <div>
                <span>人工等待点</span>
                <strong>{{ runtimeMonitorData.summary.waitingWaitpoints }}</strong>
              </div>
              <div>
                <span>在线 Worker</span>
                <strong>{{ runtimeWorkerMetric }}</strong>
              </div>
              <div>
                <span>运行中流程</span>
                <strong>{{ runtimeMonitorData.summary.runningWorkflowInstances }}</strong>
              </div>
            </div>

            <dl class="runtime-monitor-engine">
              <div>
                <dt>环境</dt>
                <dd>{{ runtimeMonitorData.engine.environment }}</dd>
              </div>
              <div>
                <dt>环境并发上限</dt>
                <dd>{{ runtimeMonitorData.engine.environmentConcurrencyLimit ?? '-' }}</dd>
              </div>
              <div>
                <dt>队列数</dt>
                <dd>{{ runtimeMonitorData.summary.queueCount }}</dd>
              </div>
              <div>
                <dt>开发连接</dt>
                <dd>{{ runtimeDevPresenceLabel }}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{{ formatRuntimeTime(runtimeMonitorData.generatedAt) }}</dd>
              </div>
            </dl>

            <div class="runtime-monitor-tabs" role="tablist" aria-label="运行监控分类">
              <button
                v-for="tab in runtimeMonitorTabs"
                :key="tab.key"
                type="button"
                role="tab"
                :aria-selected="runtimeMonitorTab === tab.key"
                :class="{ active: runtimeMonitorTab === tab.key }"
                @click="runtimeMonitorTab = tab.key"
              >
                {{ tab.label }}
                <span>{{ tab.count }}</span>
              </button>
            </div>

            <div class="runtime-monitor-table-wrap">
              <table v-if="runtimeMonitorTab === 'workflows'" class="runtime-monitor-table">
                <thead>
                  <tr>
                    <th>业务流程</th>
                    <th>状态</th>
                    <th>Trigger Run</th>
                    <th>启动时间</th>
                    <th class="runtime-monitor-action-column">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="instance in runtimeMonitorData.workflows" :key="instance.id">
                    <td>
                      <strong>{{ instance.title }}</strong>
                      <small>{{ instance.id }}</small>
                    </td>
                    <td><span :class="runtimeStatusBadgeClass(instance.status)">{{ workflowStatusLabel(instance.status) }}</span></td>
                    <td class="runtime-monitor-mono">{{ instance.triggerRunId || '-' }}</td>
                    <td>{{ formatRuntimeTime(instance.startedAt) }}</td>
                    <td class="runtime-monitor-action-column">
                      <button
                        class="runtime-monitor-terminate"
                        type="button"
                        title="终止业务流程并取消对应的 Trigger.dev Run"
                        :disabled="terminatingInstanceId === instance.id"
                        @click="terminateWorkflowFromMonitor(instance)"
                      >
                        <i :class="terminatingInstanceId === instance.id ? 'ri-loader-4-line runtime-monitor-spin' : 'ri-stop-circle-line'" aria-hidden="true" />
                        {{ terminatingInstanceId === instance.id ? '终止中' : '终止流程' }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="runtimeMonitorData.workflows.length === 0">
                    <td colspan="5" class="runtime-monitor-empty">当前账号集没有运行中的业务流程</td>
                  </tr>
                </tbody>
              </table>

              <table v-else-if="runtimeMonitorTab === 'runs'" class="runtime-monitor-table">
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>状态</th>
                    <th>Run ID</th>
                    <th>业务实例</th>
                    <th>更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="run in runtimeMonitorData.runs" :key="run.id">
                    <td><strong>{{ run.taskIdentifier }}</strong></td>
                    <td><span :class="runtimeStatusBadgeClass(run.status)">{{ triggerStatusLabel(run.status) }}</span></td>
                    <td class="runtime-monitor-mono">{{ run.id }}</td>
                    <td class="runtime-monitor-mono">{{ run.workflowInstanceId || '-' }}</td>
                    <td>{{ formatRuntimeTime(run.updatedAt) }}</td>
                  </tr>
                  <tr v-if="runtimeMonitorData.runs.length === 0">
                    <td colspan="5" class="runtime-monitor-empty">当前账号集没有可见的 Trigger.dev Run</td>
                  </tr>
                </tbody>
              </table>

              <table v-else-if="runtimeMonitorTab === 'queues'" class="runtime-monitor-table">
                <thead>
                  <tr>
                    <th>队列</th>
                    <th>类型</th>
                    <th>运行</th>
                    <th>排队</th>
                    <th>并发上限</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="queue in runtimeMonitorData.queues" :key="queue.id">
                    <td>
                      <strong>{{ queue.name }}</strong>
                      <small>{{ queue.id }}</small>
                    </td>
                    <td>{{ queue.type === 'task' ? '任务队列' : '自定义队列' }}</td>
                    <td>{{ queue.running }}</td>
                    <td>{{ queue.queued }}</td>
                    <td>{{ queue.concurrencyLimit ?? '-' }}</td>
                    <td><span :class="runtimeStatusBadgeClass(queue.paused ? 'PAUSED' : 'ACTIVE')">{{ queue.paused ? '已暂停' : '运行中' }}</span></td>
                  </tr>
                  <tr v-if="runtimeMonitorData.queues.length === 0">
                    <td colspan="6" class="runtime-monitor-empty">Trigger.dev 当前没有队列数据</td>
                  </tr>
                </tbody>
              </table>

              <table v-else-if="runtimeMonitorTab === 'waitpoints'" class="runtime-monitor-table">
                <thead>
                  <tr>
                    <th>等待点</th>
                    <th>状态</th>
                    <th>业务实例</th>
                    <th>审批任务</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="waitpoint in runtimeMonitorData.waitpoints" :key="waitpoint.id">
                    <td class="runtime-monitor-mono">{{ waitpoint.id }}</td>
                    <td><span :class="runtimeStatusBadgeClass(waitpoint.status)">{{ triggerStatusLabel(waitpoint.status) }}</span></td>
                    <td class="runtime-monitor-mono">{{ waitpoint.workflowInstanceId || '-' }}</td>
                    <td class="runtime-monitor-mono">{{ waitpoint.workflowTaskId || '-' }}</td>
                    <td>{{ formatRuntimeTime(waitpoint.createdAt) }}</td>
                  </tr>
                  <tr v-if="runtimeMonitorData.waitpoints.length === 0">
                    <td colspan="5" class="runtime-monitor-empty">当前账号集没有等待中的人工等待点</td>
                  </tr>
                </tbody>
              </table>

              <table v-else class="runtime-monitor-table">
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>资源标识</th>
                    <th>最后心跳</th>
                    <th>最后取任务</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="worker in runtimeMonitorData.workers" :key="worker.id">
                    <td>
                      <strong>{{ worker.name }}</strong>
                      <small>{{ worker.id }}</small>
                    </td>
                    <td class="runtime-monitor-mono">{{ worker.resourceIdentifier }}</td>
                    <td>{{ formatRuntimeTime(worker.lastHeartbeatAt) }}</td>
                    <td>{{ formatRuntimeTime(worker.lastDequeueAt) }}</td>
                  </tr>
                  <tr v-if="runtimeMonitorData.workers.length === 0">
                    <td colspan="4" class="runtime-monitor-empty">
                      {{ runtimeMonitorData.engine.workerConnected ? '开发 Worker 已连接（Presence）' : '当前没有活跃 Worker 心跳' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <div v-else-if="runtimeMonitorLoading" class="runtime-monitor-loading">
            <i class="ri-loader-4-line runtime-monitor-spin" aria-hidden="true" />
            <span>正在读取 Trigger.dev 运行状态</span>
          </div>
        </section>
      </div>
    </Teleport>
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
  type WorkflowSchemaIssue,
  approvalNodeFormSchemaCodeByType,
  approvalEdgeFormSchemaCode
} from '@enlearn/approval-workflow';
import JsonDialogInput from '@enlearn/lowcode-framework/components/json-dialog-input';
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';
import { loadAvailableLowCodeFormDefinitions } from '../../../utils/lowCodeFormDefinitions';

const localStorageKey = computed(() =>
  `enlearn.workflow.designer.${auth.activeAccount.value?.account_id ?? 'unselected'}.default`
);
const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const routeCode = computed(() => String(route.params.code ?? '').trim());
const activeStorageKey = computed(() =>
  routeCode.value
    ? `enlearn.workflow.designer.${auth.activeAccount.value?.account_id ?? 'unselected'}.${routeCode.value}`
    : localStorageKey.value
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
const nodeFormSchemas = ref<Record<string, LowCodeFormSchema>>({});
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

type TriggerRuntimeStatus = {
  generatedAt: string;
  partial: boolean;
  errors: Record<string, string | undefined>;
  engine: {
    configured: boolean;
    apiUrl: string;
    projectRef: string | null;
    environment: 'dev' | 'prod';
    environmentId: string | null;
    workerConnected: boolean | null;
    activeWorkerCount: number;
    environmentConcurrencyLimit: number | null;
  };
  summary: {
    queueCount: number;
    queuedRuns: number;
    runningRuns: number;
    waitingRuns: number;
    waitingWaitpoints: number;
    runningWorkflowInstances: number;
  };
  queues: Array<{
    id: string;
    name: string;
    type: 'task' | 'custom';
    running: number;
    queued: number;
    paused: boolean;
    concurrencyLimit: number | null;
  }>;
  runs: Array<{
    id: string;
    status: string;
    taskIdentifier: string;
    workflowInstanceId?: string;
    updatedAt: string;
  }>;
  waitpoints: Array<{
    id: string;
    status: string;
    workflowInstanceId?: string;
    workflowTaskId?: string;
    createdAt: string;
  }>;
  workers: Array<{
    id: string;
    name: string;
    resourceIdentifier: string;
    lastHeartbeatAt: string;
    lastDequeueAt?: string;
  }>;
  workflows: Array<WorkflowRuntimeInstance & {
    title: string;
    businessKey: string;
    startedAt: string;
  }>;
};

type RuntimeMonitorTab = 'workflows' | 'runs' | 'queues' | 'waitpoints' | 'workers';

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
const runtimeMonitorOpen = ref(false);
const runtimeMonitorLoading = ref(false);
const runtimeMonitorData = ref<TriggerRuntimeStatus | null>(null);
const runtimeMonitorError = ref('');
const runtimeMonitorTab = ref<RuntimeMonitorTab>('workflows');
const terminatingInstanceId = ref('');
const approvalTestPollTimeoutMs = 90_000;
const approvalTestPollIntervalMs = 2_000;
let approvalTestPollGeneration = 0;

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
const runtimeMonitorErrorText = computed(() => {
  if (runtimeMonitorError.value) return runtimeMonitorError.value;
  const errors = Object.values(runtimeMonitorData.value?.errors ?? {}).filter(Boolean);
  return errors.length ? `部分 Trigger.dev 状态读取失败：${errors.join('；')}` : '';
});
const runtimeEngineLabel = computed(() => {
  if (!runtimeMonitorData.value?.engine.configured) return '未连接';
  if (runtimeMonitorData.value.partial) return '部分可用';
  return '已连接';
});
const runtimeEngineBadgeClass = computed(() => ({
  'runtime-monitor-engine-badge': true,
  'runtime-monitor-engine-badge--warning': runtimeMonitorData.value?.partial,
  'runtime-monitor-engine-badge--offline': !runtimeMonitorData.value?.engine.configured
}));
const runtimeWorkerMetric = computed(() => {
  const engine = runtimeMonitorData.value?.engine;
  if (!engine) return '-';
  return engine.activeWorkerCount || (engine.workerConnected ? '已连接' : 0);
});
const runtimeDevPresenceLabel = computed(() => {
  const connected = runtimeMonitorData.value?.engine.workerConnected;
  if (connected === null || connected === undefined) return '-';
  return connected ? '已连接' : '未连接';
});
const runtimeMonitorTabs = computed(() => {
  const data = runtimeMonitorData.value;
  return [
    { key: 'workflows' as const, label: '业务流程', count: data?.workflows.length ?? 0 },
    { key: 'runs' as const, label: 'Trigger Runs', count: data?.runs.length ?? 0 },
    { key: 'queues' as const, label: '队列', count: data?.queues.length ?? 0 },
    { key: 'waitpoints' as const, label: '等待点', count: data?.waitpoints.length ?? 0 },
    { key: 'workers' as const, label: 'Worker', count: data?.workers.length ?? 0 }
  ];
});
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
  window.addEventListener('keydown', handlePageKeydown);
  void loadInitialWorkflow();
  void loadApprovalInspectorSchemas();
});

async function loadApprovalInspectorSchemas() {
  try {
    const codes = [...Object.values(approvalNodeFormSchemaCodeByType), approvalEdgeFormSchemaCode];
    const definitions = await loadAvailableLowCodeFormDefinitions(serviceApi, codes);
    nodeFormSchemas.value = Object.fromEntries(
      Object.entries(approvalNodeFormSchemaCodeByType).flatMap(([type, code]) => {
        const definition = definitions[code];
        return definition ? [[type, definition.schema]] : [];
      }),
    );
  } catch (error) {
    console.warn('审批节点低代码表单加载失败，将使用 JSON 配置回退。', error);
  }
}

onBeforeUnmount(() => {
  approvalTestPollGeneration += 1;
  window.removeEventListener('click', closeActionMenu);
  window.removeEventListener('keydown', handlePageKeydown);
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

function handlePageKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && runtimeMonitorOpen.value) closeRuntimeMonitor();
}

async function openRuntimeMonitor() {
  runtimeMonitorOpen.value = true;
  runtimeMonitorTab.value = 'workflows';
  await loadRuntimeMonitor();
}

function closeRuntimeMonitor() {
  runtimeMonitorOpen.value = false;
}

async function loadRuntimeMonitor() {
  runtimeMonitorLoading.value = true;
  runtimeMonitorError.value = '';
  try {
    runtimeMonitorData.value = await invokeWorkflowService<TriggerRuntimeStatus>(
      'getRuntimeStatus',
      {}
    );
  } catch (error) {
    runtimeMonitorError.value = error instanceof Error
      ? error.message
      : 'Trigger.dev 运行状态读取失败';
  } finally {
    runtimeMonitorLoading.value = false;
  }
}

async function terminateWorkflowFromMonitor(
  instance: TriggerRuntimeStatus['workflows'][number]
) {
  const confirmed = window.confirm(
    `确定终止流程“${instance.title}”吗？对应的 Trigger.dev Run 也会被取消。`
  );
  if (!confirmed) return;

  terminatingInstanceId.value = instance.id;
  runtimeMonitorError.value = '';
  try {
    await invokeWorkflowService<WorkflowRuntimeInstance>('terminateInstance', {
      instanceId: instance.id,
      comment: '从 Trigger.dev 运行监控终止'
    });
    if (startedInstanceId.value === instance.id) {
      startedTaskStatus.value = workflowStatusLabel('terminated');
      testRunSummary.value = '流程已终止，Trigger.dev Run 已取消';
    }
    message.value = `流程 ${instance.id} 已终止`;
    messageClass.value = 'workflow-success';
    await loadRuntimeMonitor();
  } catch (error) {
    runtimeMonitorError.value = error instanceof Error ? error.message : '流程终止失败';
  } finally {
    terminatingInstanceId.value = '';
  }
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
onMounted(() => {
  loadTriggerApprovalTestWorkflow();//
});
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
  window.localStorage.setItem(localStorageKey.value, serialized);
  window.localStorage.setItem(
    `enlearn.workflow.designer.${auth.activeAccount.value?.account_id ?? 'unselected'}.${workflowModel.value.code}`,
    serialized
  );
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
    const instance = await invokeWorkflowService<WorkflowRuntimeInstance>('startInstance', {
      definitionId,
      businessKey,
      documentType: 'order',
      documentId: ORDER_APPROVAL_TEST_VARIABLES.orderNo,
      title: `订单审批 ${ORDER_APPROVAL_TEST_VARIABLES.orderNo}`,
      variables: ORDER_APPROVAL_TEST_VARIABLES
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
  const pollGeneration = approvalTestPollGeneration;
  message.value = '正在发起审批一键测试...';
  messageClass.value = 'workflow-help';

  try {
    testRunSummary.value = '正在通过正式接口保存、发布并发起审批';
    const schema = designerRef.value?.getSchema() ?? workflowModel.value;
    const currentUserId = auth.user.value?.id;
    if (!currentUserId) throw new Error('请先登录后再发起测试审批');

    const published = await publishCurrentWorkflow();
    const businessKey = `approval-flow-test-${Date.now().toString(36)}`;
    const instance = await invokeWorkflowService<WorkflowRuntimeInstance>('startInstance', {
      definitionId: published.definition.id,
      businessKey,
      documentType: schema.documentType ?? 'approval_flow_test',
      documentId: businessKey,
      title: `${schema.name} 一键测试`,
      variables: createDesignerTestVariables(businessKey, currentUserId)
    });

    updateRuntimeFromInstance(instance);
    startedTaskStatus.value = workflowStatusLabel(instance.status);
    testRunSummary.value = '实例已启动，正在等待审批待办';
    message.value = `测试实例 ${instance.id} 已启动，正在等待 Trigger.dev 生成审批待办...`;

    const polledInstance = hasPendingWorkflowTask(instance) || instance.status !== 'running'
      ? instance
      : await waitForApprovalTestState(
          instance.id,
          pollGeneration,
          approvalTestPollTimeoutMs,
          approvalTestPollIntervalMs
        );

    if (pollGeneration !== approvalTestPollGeneration) return;

    if (!polledInstance) {
      testRunSummary.value = '实例已发起，待办仍在生成';
      startedTaskStatus.value = workflowStatusLabel(instance.status);
      message.value = `测试实例 ${instance.id} 已成功启动，但暂未读取到审批待办。实例不会重复发起，可稍后刷新查看。`;
      messageClass.value = 'workflow-help';
      return;
    }

    updateRuntimeFromInstance(polledInstance);
    const pendingTask = polledInstance.tasks?.find(
      (task) => task.status === 'pending' || task.status === 'claimed'
    );

    if (polledInstance.status === 'running' && pendingTask) {
      const assigneeId = pendingTask.assigneeId ?? '';
      const approverLabel = auth.devTestUsers.value.find((user) => user.id === assigneeId)?.name ?? assigneeId;
      testRunSummary.value = `已发起审批，待 ${approverLabel || '审批人'} 处理`;
      message.value = `测试审批已发起。请切换到审批人 ${approverLabel || assigneeId}，从消息提醒进入审批页面处理。`;
    } else if (polledInstance.status === 'approved') {
      testRunSummary.value = '流程已自动结束';
      message.value = `测试审批已完成：实例 ${instance.id} 已${workflowStatusLabel(polledInstance.status)}。`;
    } else {
      throw new Error(`测试审批实例已结束，状态：${workflowStatusLabel(polledInstance.status)}`);
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
  window.localStorage.setItem(localStorageKey.value, serialized);
  window.localStorage.setItem(
    `enlearn.workflow.designer.${auth.activeAccount.value?.account_id ?? 'unselected'}.${schema.code}`,
    serialized
  );

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
    : await invokeWorkflowService<WorkflowModelRecord>('saveModel', modelPayload);
  savedModelId.value = model.id;

  const published = await invokeWorkflowService<PublishWorkflowResult>('publishModel', {
    modelId: model.id,
    remark: '订单审批流设计器测试发布'
  });
  publishedDefinitionId.value = published.definition.id;

  return published;
}

function applySchemaJsonValue(value: unknown) {
  schemaText.value =
    typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
  applySchemaText();
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
  approvalTestPollGeneration += 1;
  startedInstanceId.value = '';
  startedTaskId.value = '';
  startedTaskStatus.value = '';
  testRunSummary.value = '';
}

async function waitForApprovalTestState(
  instanceId: string,
  generation: number,
  timeoutMs: number,
  intervalMs: number
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline && generation === approvalTestPollGeneration) {
    try {
      const instance = await invokeWorkflowService<WorkflowRuntimeInstance>('getInstance', {
        instanceId
      });
      if (hasPendingWorkflowTask(instance) || instance.status !== 'running') {
        return instance;
      }
    } catch {
      // A single gateway or database disconnect must not turn an already-started run into a failure.
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await delay(Math.min(intervalMs, remainingMs));
  }

  return undefined;
}

function hasPendingWorkflowTask(instance: WorkflowRuntimeInstance) {
  return Boolean(
    instance.tasks?.some((task) => task.status === 'pending' || task.status === 'claimed')
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
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

async function invokeWorkflowService<T>(serviceMethod: string, postData: Record<string, unknown>) {
  if (!auth.user.value?.id) {
    throw new Error('请先登录后再操作审批流');
  }

  return serviceApi.invoke<T>('workflow', serviceMethod, {
    ...postData,
    tenantId: auth.activeAccount.value?.account_id
  });
}

function triggerStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    ACTIVE: '运行中',
    CANCELED: '已取消',
    COMPLETED: '已完成',
    CRASHED: '已崩溃',
    DELAYED: '已延迟',
    DEQUEUED: '已出队',
    EXECUTING: '执行中',
    EXPIRED: '已过期',
    FAILED: '失败',
    PAUSED: '已暂停',
    PENDING_VERSION: '等待版本',
    QUEUED: '排队中',
    SYSTEM_FAILURE: '系统失败',
    TIMED_OUT: '已超时',
    WAITING: '等待中'
  };
  return labels[status ?? ''] ?? status ?? '-';
}

function runtimeStatusBadgeClass(status?: string) {
  const normalized = String(status ?? '').toUpperCase();
  return {
    'runtime-monitor-status': true,
    'runtime-monitor-status--danger': [
      'CANCELED',
      'CRASHED',
      'FAILED',
      'SYSTEM_FAILURE',
      'TERMINATED',
      'TIMED_OUT'
    ].includes(normalized),
    'runtime-monitor-status--warning': [
      'DELAYED',
      'PAUSED',
      'PENDING_VERSION',
      'QUEUED',
      'WAITING'
    ].includes(normalized),
    'runtime-monitor-status--success': ['ACTIVE', 'COMPLETED', 'EXECUTING', 'RUNNING'].includes(normalized)
  };
}

function formatRuntimeTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
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

.workflow-button--monitor {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}

.workflow-button--monitor:hover:not(:disabled) {
  border-color: #60a5fa;
  background: #dbeafe;
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

.runtime-monitor-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.46);
  padding: 24px;
}

.runtime-monitor-dialog {
  display: grid;
  grid-template-rows: auto auto auto auto auto minmax(0, 1fr);
  width: min(1180px, 100%);
  max-height: min(820px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid #b8c4d4;
  border-radius: 7px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  color: #172033;
}

.runtime-monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #dce3ec;
  padding: 14px 16px;
}

.runtime-monitor-heading {
  min-width: 0;
}

.runtime-monitor-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.runtime-monitor-title-row h2 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
  line-height: 24px;
}

.runtime-monitor-heading p {
  overflow: hidden;
  margin: 2px 0 0;
  color: #64748b;
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-monitor-engine-badge,
.runtime-monitor-status {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  border: 1px solid #99f6e4;
  border-radius: 999px;
  background: #f0fdfa;
  color: #0f766e;
  font-size: 10px;
  font-weight: 800;
  line-height: 14px;
  padding: 2px 7px;
  white-space: nowrap;
}

.runtime-monitor-engine-badge--warning,
.runtime-monitor-status--warning {
  border-color: #fde68a;
  background: #fffbeb;
  color: #a16207;
}

.runtime-monitor-engine-badge--offline,
.runtime-monitor-status--danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.runtime-monitor-status--success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
}

.runtime-monitor-header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 5px;
}

.runtime-monitor-icon-button {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font-size: 17px;
}

.runtime-monitor-icon-button:hover:not(:disabled) {
  background: #f1f5f9;
}

.runtime-monitor-icon-button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.runtime-monitor-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-bottom: 1px solid #fed7aa;
  background: #fff7ed;
  color: #9a3412;
  font-size: 12px;
  line-height: 18px;
  padding: 8px 16px;
}

.runtime-monitor-alert i {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 15px;
}

.runtime-monitor-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border-bottom: 1px solid #dce3ec;
  background: #f8fafc;
}

.runtime-monitor-metrics > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  border-right: 1px solid #dce3ec;
  padding: 11px 14px;
}

.runtime-monitor-metrics > div:last-child {
  border-right: 0;
}

.runtime-monitor-metrics span {
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-monitor-metrics strong {
  color: #0f172a;
  font-size: 21px;
  line-height: 26px;
}

.runtime-monitor-engine {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 22px;
  margin: 0;
  border-bottom: 1px solid #dce3ec;
  padding: 8px 16px;
}

.runtime-monitor-engine div {
  display: flex;
  gap: 6px;
}

.runtime-monitor-engine dt,
.runtime-monitor-engine dd {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
}

.runtime-monitor-engine dt {
  color: #64748b;
}

.runtime-monitor-engine dd {
  color: #1e293b;
  font-weight: 800;
}

.runtime-monitor-tabs {
  display: flex;
  overflow-x: auto;
  gap: 3px;
  border-bottom: 1px solid #dce3ec;
  padding: 7px 12px 0;
}

.runtime-monitor-tabs button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 31px;
  gap: 6px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  padding: 0 10px 5px;
}

.runtime-monitor-tabs button.active {
  border-bottom-color: #0f766e;
  color: #0f766e;
}

.runtime-monitor-tabs button span {
  min-width: 18px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  line-height: 18px;
  padding: 0 5px;
  text-align: center;
}

.runtime-monitor-tabs button.active span {
  background: #ccfbf1;
  color: #0f766e;
}

.runtime-monitor-table-wrap {
  min-height: 260px;
  overflow: auto;
}

.runtime-monitor-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.runtime-monitor-table th,
.runtime-monitor-table td {
  overflow: hidden;
  border-bottom: 1px solid #e2e8f0;
  color: #334155;
  font-size: 11px;
  line-height: 16px;
  padding: 9px 12px;
  text-align: left;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.runtime-monitor-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #475569;
  font-weight: 800;
}

.runtime-monitor-table tbody tr:hover {
  background: #f8fafc;
}

.runtime-monitor-table td strong,
.runtime-monitor-table td small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-monitor-table td strong {
  color: #172033;
  font-size: 12px;
}

.runtime-monitor-table td small {
  margin-top: 2px;
  color: #94a3b8;
  font-size: 10px;
}

.runtime-monitor-table th:first-child,
.runtime-monitor-table td:first-child {
  width: 24%;
}

.runtime-monitor-action-column {
  width: 110px;
  text-align: right !important;
}

.runtime-monitor-mono {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
}

.runtime-monitor-terminate {
  display: inline-flex;
  align-items: center;
  min-height: 27px;
  gap: 4px;
  border: 1px solid #fca5a5;
  border-radius: 5px;
  background: #ffffff;
  color: #b91c1c;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  padding: 0 7px;
}

.runtime-monitor-terminate:hover:not(:disabled) {
  background: #fef2f2;
}

.runtime-monitor-terminate:disabled {
  cursor: wait;
  opacity: 0.58;
}

.runtime-monitor-empty {
  height: 180px;
  color: #64748b !important;
  text-align: center !important;
}

.runtime-monitor-loading {
  display: flex;
  min-height: 340px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #64748b;
  font-size: 13px;
}

.runtime-monitor-loading i {
  color: #0f766e;
  font-size: 20px;
}

.runtime-monitor-spin {
  display: inline-block;
  animation: runtime-monitor-spin 0.9s linear infinite;
}

@keyframes runtime-monitor-spin {
  to {
    transform: rotate(360deg);
  }
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

  .runtime-monitor-mask {
    place-items: stretch;
    padding: 0;
  }

  .runtime-monitor-dialog {
    width: 100%;
    max-height: 100vh;
    border: 0;
    border-radius: 0;
  }

  .runtime-monitor-header {
    padding: 11px 12px;
  }

  .runtime-monitor-title-row h2 {
    font-size: 16px;
    line-height: 22px;
  }

  .runtime-monitor-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .runtime-monitor-metrics > div:nth-child(3) {
    border-right: 0;
  }

  .runtime-monitor-metrics > div:nth-child(6) {
    border-right: 0;
  }

  .runtime-monitor-metrics > div:nth-child(-n + 3) {
    border-bottom: 1px solid #dce3ec;
  }

  .runtime-monitor-metrics > div {
    padding: 8px 10px;
  }

  .runtime-monitor-metrics strong {
    font-size: 18px;
    line-height: 22px;
  }

  .runtime-monitor-engine {
    gap: 4px 14px;
    padding: 7px 12px;
  }

  .runtime-monitor-table {
    min-width: 760px;
  }

  .runtime-monitor-table-wrap {
    min-height: 0;
  }
}
</style>
