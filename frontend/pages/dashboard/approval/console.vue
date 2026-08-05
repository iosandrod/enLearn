<template>
  <section class="approval-console-page">
    <header class="approval-console-header">
      <div class="approval-console-heading">
        <span>审批管理</span>
        <h1>审批流总控制台</h1>
        <p>统一查看审批实例、节点执行、审批记录与 Trigger.dev Run 状态</p>
      </div>
      <div class="approval-console-header__actions">
        <span class="approval-console-updated">更新于 {{ formatTime(lastLoadedAt, true) }}</span>
        <button
          type="button"
          class="console-icon-button"
          title="刷新控制台"
          aria-label="刷新控制台"
          :disabled="loading"
          @click="loadConsole(true)"
        >
          <i :class="loading ? 'ri-loader-4-line is-spinning' : 'ri-refresh-line'" aria-hidden="true" />
        </button>
        <button
          v-if="selectedInstance?.status === 'running'"
          type="button"
          class="console-danger-button"
          :disabled="terminating"
          @click="terminateSelectedInstance"
        >
          <i :class="terminating ? 'ri-loader-4-line is-spinning' : 'ri-stop-circle-line'" aria-hidden="true" />
          {{ terminating ? '终止中' : '终止流程' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="approval-console-alert" role="alert">
      <i class="ri-error-warning-line" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
      <button type="button" @click="errorMessage = ''" title="关闭" aria-label="关闭">
        <i class="ri-close-line" aria-hidden="true" />
      </button>
    </p>

    <div class="approval-console-summary" aria-label="审批实例统计">
      <button
        v-for="item in summaryItems"
        :key="item.status"
        type="button"
        :class="[
          `is-${item.status || 'all'}`,
          { active: filters.status === item.status }
        ]"
        @click="setStatusFilter(item.status)"
      >
        <span><i :class="item.icon" aria-hidden="true" />{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
      </button>
    </div>

    <div class="approval-console-workspace">
      <aside class="approval-console-instances">
        <header class="approval-console-list-header">
          <div>
            <strong>流程实例</strong>
            <span>共 {{ consoleData.total }} 条</span>
          </div>
          <span v-if="loading"><i class="ri-loader-4-line is-spinning" /> 加载中</span>
          <span v-else>选择流程查看运行图</span>
        </header>

        <form class="approval-console-filters" @submit.prevent="loadConsole(true)">
          <label class="console-search-field">
            <span>关键词</span>
            <i class="ri-search-line" aria-hidden="true" />
            <input
              v-model="filters.search"
              type="search"
              placeholder="标题、业务键、模板或发起人"
            />
          </label>
          <div class="approval-console-filter-row approval-console-filter-row--dates">
            <label>
              <span>流程状态</span>
              <select v-model="filters.status">
                <option value="">全部状态</option>
                <option v-for="status in filterStatuses" :key="status" :value="status">
                  {{ instanceStatusLabel(status) }}
                </option>
              </select>
            </label>
            <label>
              <span>审批模板</span>
              <select v-model="filters.definitionId">
                <option value="">全部模板</option>
                <option v-for="definition in consoleData.definitions" :key="definition.id" :value="definition.id">
                  {{ definition.name }} · v{{ definition.version }}
                </option>
              </select>
            </label>
          </div>
          <div class="approval-console-filter-row">
            <label>
              <span>开始日期</span>
              <input v-model="filters.startedFrom" type="date" />
            </label>
            <label>
              <span>结束日期</span>
              <input v-model="filters.startedTo" type="date" />
            </label>
          </div>
          <div class="approval-console-filter-actions">
            <button type="submit" class="console-primary-button" :disabled="loading">
              <i class="ri-filter-3-line" aria-hidden="true" />
              查询
            </button>
            <button type="button" class="console-quiet-button" @click="resetFilters">
              重置
            </button>
          </div>
        </form>

        <div class="approval-console-instance-list" role="listbox" aria-label="审批流程实例">
          <button
            v-for="instance in consoleData.rows"
            :key="instance.id"
            type="button"
            :class="['approval-console-instance-item', { active: instance.id === selectedInstanceId }]"
            :aria-selected="instance.id === selectedInstanceId"
            @click="selectInstance(instance.id)"
          >
            <span class="approval-console-instance-item__top">
              <span :class="['console-status', `is-${instance.status}`]">
                <i />{{ instanceStatusLabel(instance.status) }}
              </span>
              <time>{{ formatTime(instance.startedAt) }}</time>
            </span>
            <strong class="approval-console-instance-item__title">{{ instance.title }}</strong>
            <span class="approval-console-instance-item__template">
              {{ instance.definitionName }} · v{{ instance.definitionVersion }}
            </span>
            <span class="approval-console-instance-item__node">
              <span>
                <i class="ri-node-tree" aria-hidden="true" />
                {{ instance.currentNodeNames.join('、') || (instance.status === 'running' ? '正在调度' : '流程已结束') }}
                <small v-if="instance.activeTaskCount">{{ instance.activeTaskCount }} 个待办</small>
              </span>
              <b>{{ instance.completedNodeCount }}/{{ instance.nodeCount }}</b>
            </span>
            <span class="console-progress approval-console-instance-item__progress">
              <span><i :style="{ width: `${nodeProgress(instance)}%` }" /></span>
            </span>
            <span class="approval-console-instance-item__footer">
              <span :title="instance.initiatorEmail || instance.initiatorId">
                <i class="ri-user-line" aria-hidden="true" />
                {{ instance.initiatorName || shortId(instance.initiatorId) }}
              </span>
              <span class="console-mono" :title="instance.triggerRunId">
                {{ shortId(instance.triggerRunId, 13) }}
              </span>
            </span>
          </button>

          <div v-if="!loading && !consoleData.rows.length" class="console-empty-cell">
            <i class="ri-inbox-2-line" aria-hidden="true" />
            <strong>没有匹配的审批实例</strong>
            <span>调整筛选条件后重新查询</span>
          </div>
        </div>
      </aside>

      <main v-if="selectedInstance" class="approval-console-detail">
      <header class="approval-console-detail__header">
        <div>
          <div class="approval-console-detail__title-row">
            <h2>{{ selectedInstance.title }}</h2>
            <span :class="['console-status', `is-${selectedInstance.status}`]">
              <i />{{ instanceStatusLabel(selectedInstance.status) }}
            </span>
          </div>
          <p>
            {{ selectedInstance.definitionName }} · v{{ selectedInstance.definitionVersion }}
            <span>实例 {{ selectedInstance.id }}</span>
          </p>
        </div>
        <dl>
          <div><dt>发起人</dt><dd>{{ selectedInstance.initiatorName || shortId(selectedInstance.initiatorId) }}</dd></div>
          <div><dt>发起时间</dt><dd>{{ formatTime(selectedInstance.startedAt) }}</dd></div>
          <div><dt>业务单据</dt><dd>{{ selectedDocumentLabel }}</dd></div>
        </dl>
      </header>

        <section class="approval-console-flow-panel">
          <header>
            <div>
              <strong>流程运行图</strong>
              <span>审批过的节点已高亮，点击节点查看执行记录</span>
            </div>
            <span v-if="detailLoading"><i class="ri-loader-4-line is-spinning" /> 加载中</span>
          </header>
          <ApprovalRuntimeViewer
            v-if="consoleDetail"
            :key="selectedInstanceId"
            class="approval-console-flow-viewer"
            :model="consoleDetail.definition.schema"
            :node-states="consoleDetail.nodeStates"
            :selected-node-id="selectedNodeId"
            @node-select="selectNode"
          />
          <div v-else class="approval-console-detail-loading">
            <i class="ri-loader-4-line is-spinning" aria-hidden="true" />
            正在加载流程运行图
          </div>
        </section>

        <section class="approval-console-inspector">
          <nav class="approval-console-tabs" aria-label="审批实例详情">
            <button
              v-for="tab in detailTabs"
              :key="tab.key"
              type="button"
              :class="{ active: activeDetailTab === tab.key }"
              @click="activeDetailTab = tab.key"
            >
              {{ tab.label }}
              <span>{{ tab.count }}</span>
            </button>
          </nav>

          <div v-if="consoleDetail" class="approval-console-inspector__body">
            <div v-if="activeDetailTab === 'nodes'" class="console-record-list">
              <button
                v-for="node in visibleNodeStates"
                :key="node.nodeId"
                type="button"
                :class="{ active: node.nodeId === selectedNodeId }"
                @click="selectNode(node.nodeId)"
              >
                <span :class="['console-node-state', `is-${node.status}`]"><i /></span>
                <span class="console-record-copy">
                  <strong>{{ node.name }}</strong>
                  <small>{{ nodeTypeLabel(node.nodeType) }} · {{ nodeStatusLabel(node.status) }}</small>
                  <small v-if="node.assigneeIds.length">处理人：{{ node.assigneeIds.map(userName).join('、') }}</small>
                </span>
                <span class="console-record-time">{{ durationLabel(node.startedAt, node.endedAt) }}</span>
              </button>
              <p v-if="!visibleNodeStates.length" class="console-detail-empty">该节点还没有执行记录</p>
            </div>

            <div v-else-if="activeDetailTab === 'tasks'" class="console-record-list">
              <article v-for="task in visibleTasks" :key="task.id" class="console-task-record">
                <header>
                  <span :class="['console-status', `is-${task.status}`]"><i />{{ taskStatusLabel(task.status) }}</span>
                  <time>{{ formatTime(task.completedAt || task.createdAt) }}</time>
                </header>
                <strong>{{ task.title }}</strong>
                <p>审批人：{{ userLabel(task.assigneeId) }}</p>
                <p v-if="task.decisionPayload?.action">
                  结果：{{ task.decisionPayload.action === 'reject' ? '驳回' : '通过' }}
                  <template v-if="task.decisionPayload.comment"> · {{ task.decisionPayload.comment }}</template>
                </p>
                <small class="console-mono">{{ task.id }}</small>
              </article>
              <p v-if="!visibleTasks.length" class="console-detail-empty">暂无审批任务</p>
            </div>

            <ol v-else-if="activeDetailTab === 'timeline'" class="console-timeline">
              <li v-for="event in consoleDetail.timeline" :key="event.id">
                <i :class="timelineIcon(event.eventType)" aria-hidden="true" />
                <div>
                  <strong>{{ timelineLabel(event.eventType) }}</strong>
                  <span>{{ eventSummary(event) }}</span>
                  <small>{{ formatTime(event.createdAt) }} · {{ userName(event.operatorId) }}</small>
                </div>
              </li>
              <li v-if="!consoleDetail.timeline.length" class="console-detail-empty">暂无时间线记录</li>
            </ol>

            <dl v-else-if="activeDetailTab === 'variables'" class="console-variable-list">
              <div v-for="variable in consoleDetail.instance.variables" :key="variable.id">
                <dt>{{ variable.key }}</dt>
                <dd>{{ formatValue(variable.value) }}</dd>
              </div>
              <p v-if="!consoleDetail.instance.variables.length" class="console-detail-empty">暂无流程变量</p>
            </dl>

            <div v-else class="console-trigger-detail">
              <div class="console-trigger-hero">
                <i class="ri-pulse-line" aria-hidden="true" />
                <div>
                  <strong>Trigger.dev Run</strong>
                  <span :class="['console-status', triggerStatusClass(consoleDetail.triggerRun?.status)]">
                    <i />{{ triggerStatusLabel(consoleDetail.triggerRun?.status) }}
                  </span>
                </div>
              </div>
              <dl>
                <div><dt>Run ID</dt><dd class="console-mono">{{ consoleDetail.triggerRun?.id || '-' }}</dd></div>
                <div><dt>Task</dt><dd>{{ consoleDetail.triggerRun?.taskIdentifier || '-' }}</dd></div>
                <div><dt>创建时间</dt><dd>{{ formatTime(consoleDetail.triggerRun?.createdAt) }}</dd></div>
                <div><dt>开始时间</dt><dd>{{ formatTime(consoleDetail.triggerRun?.startedAt) }}</dd></div>
                <div><dt>结束时间</dt><dd>{{ formatTime(consoleDetail.triggerRun?.finishedAt) }}</dd></div>
              </dl>
              <p v-if="consoleDetail.triggerRun?.error" class="console-trigger-error">
                {{ consoleDetail.triggerRun.error }}
              </p>
            </div>
          </div>
        </section>
      </main>

      <main v-else-if="!loading" class="approval-console-no-selection">
        <i class="ri-node-tree" aria-hidden="true" />
        <strong>选择一个审批实例</strong>
        <span>流程图、审批节点和 Trigger.dev 状态会显示在这里</span>
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import {
  ApprovalRuntimeViewer,
  type ApprovalRuntimeNodeState,
  type WorkflowModel
} from '@enlearn/approval-workflow';

type InstanceStatus = 'running' | 'approved' | 'rejected' | 'canceled' | 'terminated' | 'failed';
type DetailTab = 'nodes' | 'tasks' | 'timeline' | 'variables' | 'trigger';

type ConsoleInstance = {
  id: string;
  definitionId: string;
  definitionVersion: number;
  definitionCode: string;
  definitionName: string;
  businessKey: string;
  documentType?: string;
  documentId?: string;
  title: string;
  status: InstanceStatus;
  initiatorId?: string;
  initiatorName: string;
  initiatorEmail: string;
  triggerRunId?: string;
  startedAt: string;
  endedAt?: string;
  nodeCount: number;
  completedNodeCount: number;
  currentNodeNames: string[];
  taskCount: number;
  activeTaskCount: number;
};

type ConsoleSummary = Record<InstanceStatus, number> & { total: number };
type ConsoleResponse = {
  rows: ConsoleInstance[];
  total: number;
  limit: number;
  offset: number;
  summary: ConsoleSummary;
  definitions: Array<{ id: string; code: string; name: string; version: number; status: string }>;
};

type ConsoleTask = {
  id: string;
  nodeId: string;
  title: string;
  status: 'pending' | 'claimed' | 'completed' | 'canceled';
  assigneeId?: string;
  createdAt: string;
  completedAt?: string;
  decisionPayload?: { action?: string; comment?: string; operatorId?: string };
  candidates: Array<{ id: string; candidateType: string; candidateId: string }>;
};

type TimelineEvent = {
  id: string;
  eventType: string;
  operatorId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type ConsoleDetail = {
  instance: ConsoleInstance & {
    variables: Array<{ id: string; key: string; value: unknown }>;
    comments: Array<{ id: string; action: string; comment: string; operatorId?: string }>;
    nodeInstances: Array<{ id: string; nodeId: string; status: string }>;
    tasks: ConsoleTask[];
  };
  definition: {
    id: string;
    code: string;
    name: string;
    version: number;
    schema: WorkflowModel;
  };
  nodeStates: Array<ApprovalRuntimeNodeState & {
    name: string;
    nodeType: string;
    executionCount: number;
    taskCount: number;
    completedTaskCount: number;
    activeTaskCount: number;
    assigneeIds: string[];
  }>;
  timeline: TimelineEvent[];
  users: Array<{ id: string; name: string; email: string }>;
  triggerRun: null | {
    id: string;
    status: string;
    taskIdentifier: string;
    createdAt?: string;
    startedAt?: string;
    finishedAt?: string;
    error?: string;
  };
};

const emptySummary = (): ConsoleSummary => ({
  total: 0,
  running: 0,
  approved: 0,
  rejected: 0,
  canceled: 0,
  terminated: 0,
  failed: 0
});

const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const detailLoading = ref(false);
const terminating = ref(false);
const errorMessage = ref('');
const lastLoadedAt = ref('');
const selectedInstanceId = ref('');
const selectedNodeId = ref('');
const activeDetailTab = ref<DetailTab>('nodes');
const consoleDetail = ref<ConsoleDetail | null>(null);
const filters = reactive({
  search: '',
  status: '',
  definitionId: '',
  startedFrom: '',
  startedTo: ''
});
const consoleData = reactive<ConsoleResponse>({
  rows: [],
  total: 0,
  limit: 100,
  offset: 0,
  summary: emptySummary(),
  definitions: []
});

const filterStatuses: InstanceStatus[] = ['running', 'approved', 'rejected', 'canceled', 'terminated', 'failed'];
const selectedInstance = computed(
  () => consoleData.rows.find((instance) => instance.id === selectedInstanceId.value) ?? null
);
const selectedDocumentLabel = computed(() =>
  [selectedInstance.value?.documentType, selectedInstance.value?.documentId]
    .filter(Boolean)
    .join(' / ') || '-'
);
const summaryItems = computed(() => [
  { status: '', label: '全部实例', icon: 'ri-stack-line', count: consoleData.summary.total },
  { status: 'running', label: '进行中', icon: 'ri-loader-4-line', count: consoleData.summary.running },
  { status: 'approved', label: '已通过', icon: 'ri-checkbox-circle-line', count: consoleData.summary.approved },
  { status: 'rejected', label: '已驳回', icon: 'ri-close-circle-line', count: consoleData.summary.rejected },
  { status: 'terminated', label: '已终止', icon: 'ri-stop-circle-line', count: consoleData.summary.terminated + consoleData.summary.canceled },
  { status: 'failed', label: '失败', icon: 'ri-error-warning-line', count: consoleData.summary.failed }
]);
const visibleNodeStates = computed(() => {
  if (!consoleDetail.value) return [];
  if (!selectedNodeId.value) return consoleDetail.value.nodeStates;
  return consoleDetail.value.nodeStates.filter((node) => node.nodeId === selectedNodeId.value);
});
const visibleTasks = computed(() => {
  const tasks = consoleDetail.value?.instance.tasks ?? [];
  if (!selectedNodeId.value || activeDetailTab.value !== 'tasks') return tasks;
  return tasks.filter((task) => task.nodeId === selectedNodeId.value);
});
const detailTabs = computed(() => [
  { key: 'nodes' as const, label: '节点', count: consoleDetail.value?.nodeStates.length ?? 0 },
  { key: 'tasks' as const, label: '审批', count: consoleDetail.value?.instance.tasks.length ?? 0 },
  { key: 'timeline' as const, label: '时间线', count: consoleDetail.value?.timeline.length ?? 0 },
  { key: 'variables' as const, label: '变量', count: consoleDetail.value?.instance.variables.length ?? 0 },
  { key: 'trigger' as const, label: 'Trigger', count: consoleDetail.value?.triggerRun ? 1 : 0 }
]);

async function workflowApi<T>(method: string, postData: Record<string, unknown> = {}) {
  return serviceApi.invoke<T>('workflow', method, {
    ...postData,
    tenantId: auth.activeAccount.value?.account_id
  });
}

async function loadConsole(preserveSelection = true) {
  loading.value = true;
  errorMessage.value = '';
  const previousSelection = preserveSelection ? selectedInstanceId.value : '';

  try {
    const result = await workflowApi<ConsoleResponse>('getApprovalConsole', {
      search: filters.search.trim(),
      status: filters.status,
      definitionId: filters.definitionId,
      startedFrom: filters.startedFrom ? `${filters.startedFrom}T00:00:00+08:00` : '',
      startedTo: filters.startedTo ? `${nextDate(filters.startedTo)}T00:00:00+08:00` : '',
      limit: 200
    });
    Object.assign(consoleData, result);
    consoleData.summary = { ...emptySummary(), ...result.summary };
    lastLoadedAt.value = new Date().toISOString();

    const queryInstanceId = String(route.query.instanceId ?? '').trim();
    const nextSelection = [previousSelection, queryInstanceId]
      .find((id) => result.rows.some((instance) => instance.id === id)) ?? result.rows[0]?.id ?? '';

    if (nextSelection) {
      await selectInstance(nextSelection, false);
    } else {
      selectedInstanceId.value = '';
      consoleDetail.value = null;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '审批控制台加载失败';
  } finally {
    loading.value = false;
  }
}

async function selectInstance(instanceId: string, updateRoute = true) {
  if (!instanceId) return;
  selectedInstanceId.value = instanceId;
  selectedNodeId.value = '';
  activeDetailTab.value = 'nodes';
  detailLoading.value = true;
  errorMessage.value = '';
  if (updateRoute && route.query.instanceId !== instanceId) {
    void router.replace({ query: { ...route.query, instanceId } });
  }

  try {
    const detail = await workflowApi<ConsoleDetail>('getApprovalConsoleDetail', { instanceId });
    if (selectedInstanceId.value === instanceId) consoleDetail.value = detail;
  } catch (error) {
    if (selectedInstanceId.value === instanceId) {
      consoleDetail.value = null;
      errorMessage.value = error instanceof Error ? error.message : '审批实例详情加载失败';
    }
  } finally {
    if (selectedInstanceId.value === instanceId) detailLoading.value = false;
  }
}

function selectNode(nodeId: string) {
  selectedNodeId.value = selectedNodeId.value === nodeId ? '' : nodeId;
  if (activeDetailTab.value !== 'nodes' && activeDetailTab.value !== 'tasks') {
    activeDetailTab.value = 'nodes';
  }
}

async function terminateSelectedInstance() {
  const instance = selectedInstance.value;
  if (!instance || instance.status !== 'running') return;
  const confirmed = await VxeUI.modal.confirm({
    title: '终止审批流程',
    content: `确认终止「${instance.title}」？业务实例、待办任务和对应 Trigger.dev Run 都会结束。`
  });
  if (confirmed !== 'confirm') return;

  terminating.value = true;
  errorMessage.value = '';
  try {
    await workflowApi('terminateInstance', {
      instanceId: instance.id,
      comment: '管理员从审批流总控制台终止流程'
    });
    await loadConsole(true);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '流程终止失败';
  } finally {
    terminating.value = false;
  }
}

function setStatusFilter(status: string) {
  filters.status = status;
  void loadConsole(false);
}

function resetFilters() {
  Object.assign(filters, {
    search: '',
    status: '',
    definitionId: '',
    startedFrom: '',
    startedTo: ''
  });
  void loadConsole(false);
}

function nextDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function instanceStatusLabel(status?: string) {
  return ({
    running: '进行中', approved: '已通过', rejected: '已驳回', canceled: '已取消',
    terminated: '已终止', failed: '失败'
  } as Record<string, string>)[status ?? ''] ?? status ?? '-';
}

function taskStatusLabel(status?: string) {
  return ({ pending: '待处理', claimed: '已认领', completed: '已完成', canceled: '已取消' } as Record<string, string>)[status ?? ''] ?? status ?? '-';
}

function nodeStatusLabel(status?: string) {
  return ({ pending: '未执行', running: '执行中', waiting: '待审批', completed: '已完成', rejected: '已驳回', skipped: '已跳过', failed: '失败' } as Record<string, string>)[status ?? ''] ?? status ?? '-';
}

function nodeTypeLabel(type?: string) {
  return ({ start: '开始', approval: '审批', sign: '会签', orSign: '或签', condition: '条件', cc: '抄送', parallelGateway: '并行网关', serviceTask: '服务任务', timer: '定时器', subProcess: '子流程', end: '结束' } as Record<string, string>)[type ?? ''] ?? type ?? '-';
}

function timelineLabel(eventType: string) {
  return ({
    PROCESS_STARTED: '流程已发起', PROCESS_COMPLETED: '流程已通过', PROCESS_REJECTED: '流程已驳回',
    PROCESS_TERMINATED: '流程已终止', PROCESS_WITHDRAWN: '流程已撤回', PROCESS_FAILED: '流程失败',
    NODE_ENTERED: '进入节点', NODE_COMPLETED: '节点完成', NODE_FAILED: '节点失败',
    TASK_CREATED: '生成审批任务', TASK_CLAIMED: '任务已认领', TASK_COMPLETED: '审批通过',
    TASK_REJECTED: '审批驳回', TASK_TRANSFERRED: '任务转交', TASK_ADD_SIGNED: '任务加签',
    CC_CREATED: '发送抄送', SERVICE_TASK_COMPLETED: '服务任务完成', TIMER_SCHEDULED: '定时等待开始',
    TIMER_FIRED: '定时等待结束', WAITPOINT_COMPLETE_FAILED: '等待点回调失败'
  } as Record<string, string>)[eventType] ?? eventType;
}

function timelineIcon(eventType: string) {
  if (eventType.includes('FAILED') || eventType.includes('REJECTED')) return 'ri-close-circle-line is-danger';
  if (eventType.includes('COMPLETED')) return 'ri-checkbox-circle-line is-success';
  if (eventType.includes('TASK')) return 'ri-user-follow-line is-primary';
  if (eventType.includes('NODE')) return 'ri-node-tree is-primary';
  return 'ri-time-line';
}

function eventSummary(event: TimelineEvent) {
  const payload = event.payload ?? {};
  const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : '';
  const taskId = typeof payload.taskId === 'string' ? payload.taskId : '';
  const comment = typeof payload.comment === 'string' ? payload.comment : '';
  return [nodeId ? `节点 ${nodeId}` : '', taskId ? `任务 ${shortId(taskId)}` : '', comment].filter(Boolean).join(' · ') || '-';
}

function userName(userId?: string) {
  if (!userId) return '系统';
  return consoleDetail.value?.users.find((user) => user.id === userId)?.name || shortId(userId);
}

function userLabel(userId?: string) {
  if (!userId) return '-';
  const user = consoleDetail.value?.users.find((item) => item.id === userId);
  return user ? `${user.name}${user.email ? ` · ${user.email}` : ''}` : shortId(userId);
}

function nodeProgress(instance: ConsoleInstance) {
  if (!instance.nodeCount) return 0;
  return Math.min(100, Math.round((instance.completedNodeCount / instance.nodeCount) * 100));
}

function formatTime(value?: string, timeOnly = false) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', timeOnly
    ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
    : { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
  ).format(date);
}

function durationLabel(startedAt?: string, endedAt?: string) {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '-';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`;
  return `${Math.floor(seconds / 86400)} 天`;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function shortId(value?: string, length = 8) {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function triggerStatusLabel(status?: string) {
  return ({ EXECUTING: '执行中', DEQUEUED: '已出队', WAITING: '等待中', QUEUED: '排队中', DELAYED: '已延迟', PENDING_VERSION: '等待版本', COMPLETED: '已完成', CANCELED: '已取消', FAILED: '失败', CRASHED: '已崩溃', SYSTEM_FAILURE: '系统失败', TIMED_OUT: '超时', UNKNOWN: '状态未知' } as Record<string, string>)[status ?? ''] ?? status ?? '-';
}

function triggerStatusClass(status?: string) {
  const normalized = status ?? 'UNKNOWN';
  if (['FAILED', 'CRASHED', 'SYSTEM_FAILURE', 'TIMED_OUT'].includes(normalized)) return 'is-failed';
  if (['CANCELED'].includes(normalized)) return 'is-terminated';
  if (['COMPLETED'].includes(normalized)) return 'is-approved';
  return 'is-running';
}

onMounted(async () => {
  await auth.init();
  await loadConsole(false);
});

let observedAccountEpoch = auth.accountEpoch.value;
watch(
  () => auth.accountEpoch.value,
  (nextAccountEpoch) => {
    if (nextAccountEpoch === observedAccountEpoch) return;
    observedAccountEpoch = nextAccountEpoch;
    void loadConsole(false);
  }
);
</script>

<style scoped>
.approval-console-page {
  flex: 1 1 auto;
  display: block;
  gap: 7px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 6px;
  color: #182230;
}

.approval-console-page > * + * {
  margin-top: 7px;
}

.approval-console-header,
.approval-console-instances,
.approval-console-detail,
.approval-console-no-selection {
  border: 1px solid #d5dde7;
  border-radius: 6px;
  background: #ffffff;
}

.approval-console-header {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
}

.approval-console-heading {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 1px 9px;
}

.approval-console-heading > span {
  grid-row: 1 / span 2;
  align-self: center;
  border-right: 1px solid #d9e1ea;
  color: #0f766e;
  font-size: 10px;
  font-weight: 900;
  padding-right: 9px;
}

.approval-console-heading h1 {
  margin: 0;
  color: #101828;
  font-size: 18px;
  line-height: 23px;
}

.approval-console-heading p {
  overflow: hidden;
  margin: 0;
  color: #667085;
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-console-header__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
}

.approval-console-updated {
  color: #98a2b3;
  font-size: 10px;
}

.console-icon-button,
.console-danger-button,
.console-primary-button,
.console-quiet-button {
  display: inline-flex;
  min-height: 29px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #ffffff;
  color: #344054;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  padding: 0 9px;
}

.console-icon-button { width: 29px; padding: 0; font-size: 15px; }
.console-danger-button { border-color: #fca5a5; color: #b42318; }
.console-danger-button:hover:not(:disabled) { background: #fef3f2; }
.console-primary-button { border-color: #0f766e; background: #0f766e; color: #ffffff; }
.console-primary-button:hover:not(:disabled) { background: #115e59; }
.console-quiet-button:hover:not(:disabled), .console-icon-button:hover:not(:disabled) { background: #f1f5f9; }
.console-icon-button:disabled, .console-danger-button:disabled, .console-primary-button:disabled { cursor: wait; opacity: 0.55; }

.approval-console-alert {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  border: 1px solid #fed7aa;
  border-radius: 5px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 11px;
  line-height: 17px;
  padding: 7px 9px;
}

.approval-console-alert span { flex: 1; }
.approval-console-alert button { border: 0; background: transparent; color: inherit; cursor: pointer; }

.approval-console-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid #d5dde7;
  border-radius: 6px;
  background: #ffffff;
}

.approval-console-summary button {
  display: grid;
  min-width: 0;
  min-height: 59px;
  gap: 2px;
  border: 0;
  border-right: 1px solid #e3e8ef;
  background: #ffffff;
  color: #475467;
  cursor: pointer;
  padding: 7px 11px;
  text-align: left;
}

.approval-console-summary button:last-child { border-right: 0; }
.approval-console-summary button:hover, .approval-console-summary button.active { background: #f8fafc; }
.approval-console-summary button.active { box-shadow: inset 0 -3px 0 #0f766e; }
.approval-console-summary span { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800; }
.approval-console-summary span i { color: #64748b; font-size: 13px; }
.approval-console-summary strong { color: #101828; font-size: 20px; line-height: 24px; }
.approval-console-summary .is-running span i { color: #2563eb; }
.approval-console-summary .is-approved span i { color: #16a34a; }
.approval-console-summary .is-rejected span i,
.approval-console-summary .is-failed span i { color: #dc2626; }
.approval-console-summary .is-terminated span i { color: #64748b; }

.approval-console-workspace {
  display: grid;
  min-width: 0;
  height: clamp(760px, calc(100vh - 220px), 920px);
  min-height: 760px;
  grid-template-columns: clamp(340px, 27vw, 430px) minmax(0, 1fr);
  gap: 7px;
}

.approval-console-instances {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
}

.approval-console-list-header {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid #dbe2ea;
  padding: 7px 10px;
}

.approval-console-list-header div { display: flex; align-items: baseline; gap: 6px; }
.approval-console-list-header strong { color: #101828; font-size: 13px; }
.approval-console-list-header span { color: #667085; font-size: 9px; }

.approval-console-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  border-bottom: 1px solid #dbe2ea;
  background: #fbfcfd;
  padding: 8px 9px;
}

.approval-console-filters label { display: grid; min-width: 0; gap: 3px; }
.approval-console-filters label > span { color: #667085; font-size: 9px; font-weight: 800; }
.approval-console-filter-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.approval-console-filter-actions { display: flex; justify-content: flex-end; gap: 5px; }
.approval-console-filter-actions .console-primary-button { min-width: 72px; }
.approval-console-filters input,
.approval-console-filters select {
  width: 100%;
  min-width: 0;
  height: 29px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #ffffff;
  color: #344054;
  font: inherit;
  font-size: 11px;
  outline: none;
  padding: 0 7px;
}

.approval-console-filters input:focus,
.approval-console-filters select:focus { border-color: #0f766e; box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.1); }

.console-search-field { position: relative; }
.console-search-field i { position: absolute; bottom: 7px; left: 8px; color: #98a2b3; font-size: 13px; }
.console-search-field input { padding-left: 27px; }

.approval-console-instance-list {
  min-height: 0;
  overflow: auto;
  background: #f8fafc;
}

.approval-console-instance-item {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 5px;
  border: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475467;
  cursor: pointer;
  font: inherit;
  padding: 10px 11px;
  text-align: left;
}

.approval-console-instance-item:hover { background: #f8fafc; }
.approval-console-instance-item.active { background: #ecfdf5; box-shadow: inset 3px 0 0 #0f766e; }
.approval-console-instance-item__top,
.approval-console-instance-item__node,
.approval-console-instance-item__footer { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; }
.approval-console-instance-item__top time { color: #98a2b3; font-size: 9px; white-space: nowrap; }
.approval-console-instance-item__title { overflow: hidden; color: #182230; font-size: 12px; line-height: 17px; text-overflow: ellipsis; white-space: nowrap; }
.approval-console-instance-item__template { overflow: hidden; color: #667085; font-size: 9px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.approval-console-instance-item__node { margin-top: 1px; color: #344054; font-size: 10px; }
.approval-console-instance-item__node > span { display: flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.approval-console-instance-item__node > span > i { color: #2563eb; font-size: 12px; }
.approval-console-instance-item__node small { color: #1d4ed8; font-size: 8px; }
.approval-console-instance-item__node b { color: #667085; font-size: 9px; }
.approval-console-instance-item__progress { width: 100%; }
.approval-console-instance-item__progress > span { width: 100%; }
.approval-console-instance-item__footer { color: #98a2b3; font-size: 9px; }
.approval-console-instance-item__footer > span { display: inline-flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.approval-console-instance-item__footer > span:first-child { max-width: 55%; }
.console-muted { color: #98a2b3; }
.console-current-node { color: #1d4ed8; font-weight: 800; }
.console-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }

.console-status {
  display: inline-flex;
  min-height: 20px;
  align-items: center;
  gap: 4px;
  border: 1px solid #d0d5dd;
  border-radius: 999px;
  background: #f9fafb;
  color: #475467;
  font-size: 9px;
  font-weight: 900;
  line-height: 13px;
  padding: 2px 6px;
  white-space: nowrap;
}

.console-status i { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.console-status.is-running, .console-status.is-pending, .console-status.is-claimed { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
.console-status.is-approved, .console-status.is-completed { border-color: #86efac; background: #f0fdf4; color: #15803d; }
.console-status.is-rejected, .console-status.is-failed { border-color: #fca5a5; background: #fef2f2; color: #b42318; }
.console-status.is-canceled, .console-status.is-terminated { border-color: #cbd5e1; background: #f1f5f9; color: #526072; }

.console-progress { display: flex; align-items: center; gap: 6px; }
.console-progress > span { display: block; width: 66px; height: 5px; overflow: hidden; border-radius: 999px; background: #e2e8f0; }
.console-progress > span i { display: block; height: 100%; border-radius: inherit; background: #16a34a; }
.console-progress small { margin: 0 !important; }

.console-empty-cell { display: grid; min-height: 190px; place-content: center; text-align: center !important; }
.console-empty-cell i, .console-empty-cell strong, .console-empty-cell span { display: block; margin: 3px auto; }
.console-empty-cell i { color: #98a2b3; font-size: 24px; }

.approval-console-detail {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr) 210px;
  overflow: hidden;
}
.approval-console-detail__header {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid #d9e1ea;
  padding: 7px 10px;
}

.approval-console-detail__title-row { display: flex; min-width: 0; align-items: center; gap: 7px; }
.approval-console-detail__title-row h2 { overflow: hidden; margin: 0; color: #101828; font-size: 14px; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.approval-console-detail__header p { margin: 2px 0 0; color: #667085; font-size: 9px; }
.approval-console-detail__header p span { margin-left: 8px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.approval-console-detail__header dl { display: flex; flex: 0 0 auto; gap: 18px; margin: 0; }
.approval-console-detail__header dl div { display: grid; gap: 1px; }
.approval-console-detail__header dt { color: #98a2b3; font-size: 9px; }
.approval-console-detail__header dd { max-width: 170px; overflow: hidden; margin: 0; color: #344054; font-size: 10px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }

.approval-console-flow-panel { display: grid; min-width: 0; min-height: 0; grid-template-rows: auto minmax(0, 1fr); border-bottom: 1px solid #d9e1ea; }
.approval-console-flow-panel > header { display: flex; min-height: 41px; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid #d9e1ea; padding: 5px 9px; }
.approval-console-flow-panel > header div { display: grid; gap: 1px; }
.approval-console-flow-panel > header strong { color: #182230; font-size: 11px; }
.approval-console-flow-panel > header span { color: #667085; font-size: 9px; }
.approval-console-flow-viewer { height: 100%; min-height: 0; }
.approval-console-detail-loading { display: flex; min-height: 0; align-items: center; justify-content: center; gap: 7px; color: #667085; font-size: 11px; }

.approval-console-inspector { display: grid; min-width: 0; min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
.approval-console-tabs { display: flex; overflow-x: auto; gap: 1px; border-bottom: 1px solid #d9e1ea; padding: 5px 5px 0; }
.approval-console-tabs button { display: inline-flex; flex: 0 0 auto; min-height: 35px; align-items: center; gap: 4px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #667085; cursor: pointer; font: inherit; font-size: 10px; font-weight: 900; padding: 0 7px 4px; }
.approval-console-tabs button.active { border-bottom-color: #0f766e; color: #0f766e; }
.approval-console-tabs button span { min-width: 17px; border-radius: 999px; background: #e9eef4; color: #526072; font-size: 8px; line-height: 17px; padding: 0 4px; text-align: center; }
.approval-console-tabs button.active span { background: #ccfbf1; color: #0f766e; }
.approval-console-inspector__body { min-height: 0; overflow: auto; }

.console-record-list { display: grid; }
.console-record-list > button { display: grid; width: 100%; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: start; gap: 7px; border: 0; border-bottom: 1px solid #e4e9f0; background: #ffffff; color: #344054; cursor: pointer; padding: 9px; text-align: left; }
.console-record-list > button:hover, .console-record-list > button.active { background: #f8fafc; }
.console-record-list > button.active { box-shadow: inset 3px 0 0 #0f766e; }
.console-node-state { display: grid; width: 14px; height: 14px; place-items: center; border: 1px solid #cbd5e1; border-radius: 999px; }
.console-node-state i { width: 6px; height: 6px; border-radius: 999px; background: #94a3b8; }
.console-node-state.is-completed { border-color: #86efac; }
.console-node-state.is-completed i { background: #16a34a; }
.console-node-state.is-running, .console-node-state.is-waiting { border-color: #93c5fd; }
.console-node-state.is-running i, .console-node-state.is-waiting i { background: #2563eb; }
.console-node-state.is-rejected, .console-node-state.is-failed { border-color: #fca5a5; }
.console-node-state.is-rejected i, .console-node-state.is-failed i { background: #dc2626; }
.console-record-copy { display: grid; min-width: 0; gap: 1px; }
.console-record-copy strong { overflow: hidden; color: #182230; font-size: 10px; line-height: 15px; text-overflow: ellipsis; white-space: nowrap; }
.console-record-copy small { overflow: hidden; color: #667085; font-size: 9px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.console-record-time { color: #98a2b3; font-size: 8px; white-space: nowrap; }

.console-task-record { display: grid; gap: 4px; border-bottom: 1px solid #e4e9f0; padding: 9px; }
.console-task-record header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.console-task-record time, .console-task-record small { color: #98a2b3; font-size: 8px; }
.console-task-record > strong { color: #182230; font-size: 10px; }
.console-task-record p { margin: 0; color: #526072; font-size: 9px; line-height: 14px; }

.console-timeline { display: grid; gap: 0; margin: 0; padding: 8px 9px; list-style: none; }
.console-timeline li { position: relative; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 7px; min-height: 58px; }
.console-timeline li::before { position: absolute; top: 20px; bottom: 0; left: 9px; width: 1px; background: #d9e1ea; content: ''; }
.console-timeline li:last-child::before { display: none; }
.console-timeline > li > i { z-index: 1; display: grid; width: 19px; height: 19px; place-items: center; border: 1px solid #d0d5dd; border-radius: 999px; background: #ffffff; color: #667085; font-size: 10px; }
.console-timeline > li > i.is-success { border-color: #86efac; color: #15803d; }
.console-timeline > li > i.is-danger { border-color: #fca5a5; color: #b42318; }
.console-timeline > li > i.is-primary { border-color: #93c5fd; color: #1d4ed8; }
.console-timeline li div { display: grid; align-content: start; gap: 1px; padding-bottom: 8px; }
.console-timeline strong { color: #182230; font-size: 10px; }
.console-timeline span { overflow: hidden; color: #526072; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.console-timeline small { color: #98a2b3; font-size: 8px; }

.console-variable-list { margin: 0; }
.console-variable-list div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 7px; border-bottom: 1px solid #e4e9f0; padding: 7px 9px; }
.console-variable-list dt { overflow: hidden; color: #526072; font-size: 9px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.console-variable-list dd { overflow-wrap: anywhere; margin: 0; color: #182230; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; }

.console-trigger-detail { display: grid; gap: 10px; padding: 11px; }
.console-trigger-hero { display: flex; align-items: center; gap: 9px; border-bottom: 1px solid #e4e9f0; padding-bottom: 9px; }
.console-trigger-hero > i { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 6px; background: #ecfdf5; color: #0f766e; font-size: 18px; }
.console-trigger-hero div { display: grid; gap: 3px; }
.console-trigger-hero strong { color: #182230; font-size: 11px; }
.console-trigger-detail dl { display: grid; gap: 8px; margin: 0; }
.console-trigger-detail dl div { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 7px; }
.console-trigger-detail dt { color: #667085; font-size: 9px; }
.console-trigger-detail dd { overflow: hidden; margin: 0; color: #182230; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.console-trigger-error { margin: 0; border: 1px solid #fed7aa; border-radius: 5px; background: #fff7ed; color: #9a3412; font-size: 9px; padding: 7px; }

.console-detail-empty { margin: 0; color: #98a2b3; font-size: 10px; padding: 28px 10px; text-align: center; }
.approval-console-no-selection { display: grid; min-height: 250px; place-content: center; gap: 5px; color: #667085; text-align: center; }
.approval-console-no-selection i { color: #98a2b3; font-size: 30px; }
.approval-console-no-selection strong { color: #344054; font-size: 12px; }
.approval-console-no-selection span { font-size: 10px; }

.is-spinning { display: inline-block; animation: console-spin 0.9s linear infinite; }
@keyframes console-spin { to { transform: rotate(360deg); } }

@media (max-width: 1280px) {
  .approval-console-workspace { grid-template-columns: 350px minmax(0, 1fr); }
  .approval-console-detail__header dl div:last-child { display: none; }
}

@media (max-width: 900px) {
  .approval-console-header { align-items: flex-start; flex-direction: column; }
  .approval-console-header__actions { width: 100%; justify-content: flex-end; }
  .approval-console-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .approval-console-summary button:nth-child(3) { border-right: 0; }
  .approval-console-summary button:nth-child(-n + 3) { border-bottom: 1px solid #e3e8ef; }
  .approval-console-workspace { grid-template-columns: 310px minmax(0, 1fr); }
  .approval-console-filter-row { grid-template-columns: 1fr; }
  .approval-console-filter-row--dates { display: none; }
  .approval-console-detail__header { align-items: flex-start; flex-direction: column; }
  .approval-console-detail__header dl { width: 100%; overflow-x: auto; }
  .approval-console-detail__header dl div:last-child { display: grid; }
}

@media (max-width: 620px) {
  .approval-console-page { padding: 3px; }
  .approval-console-heading { grid-template-columns: minmax(0, 1fr); }
  .approval-console-heading > span { display: none; }
  .approval-console-heading p { white-space: normal; }
  .approval-console-updated { display: none; }
  .approval-console-summary button { min-height: 54px; padding: 6px 8px; }
  .approval-console-summary strong { font-size: 17px; }
  .approval-console-workspace { height: auto; grid-template-columns: 1fr; min-height: 0; }
  .approval-console-instances { max-height: 520px; }
  .approval-console-filter-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .approval-console-detail__header dl { gap: 12px; }
  .approval-console-detail { grid-template-rows: auto 520px 280px; }
  .approval-console-filter-row--dates { display: grid; }
}
</style>
