<template>
  <section class="task-console-page">
    <header class="task-console-toolbar">
      <div>
        <strong>任务总控</strong>
        <span>{{ generatedAtText }}</span>
      </div>
      <div class="task-console-toolbar__actions">
        <label class="task-console-search">
          <i class="ri-search-line" aria-hidden="true" />
          <input v-model="keyword" type="search" placeholder="搜索任务名称、编码或 Task ID" />
        </label>
        <select v-model="sourceFilter" aria-label="任务来源">
          <option value="all">全部来源</option>
          <option value="job">作业定义</option>
          <option value="system">系统任务</option>
        </select>
        <select v-model="statusFilter" aria-label="任务状态">
          <option value="all">全部状态</option>
          <option value="enabled">已启用</option>
          <option value="draft">草稿</option>
          <option value="disabled">已停用</option>
          <option value="registered">已注册</option>
        </select>
        <button
          class="task-console-icon-button"
          type="button"
          :disabled="loading"
          title="刷新任务状态"
          aria-label="刷新任务状态"
          @click="loadConsole(true, true)"
        >
          <i :class="loading ? 'ri-loader-4-line is-spinning' : 'ri-refresh-line'" aria-hidden="true" />
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="task-console-alert is-error" role="alert">
      <i class="ri-error-warning-line" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
      <button type="button" title="关闭" aria-label="关闭" @click="errorMessage = ''">
        <i class="ri-close-line" aria-hidden="true" />
      </button>
    </p>
    <p v-else-if="consoleData.partial" class="task-console-alert is-warning" role="status">
      <i class="ri-alert-line" aria-hidden="true" />
      <span>Trigger.dev 部分状态不可用，作业定义和数据库运行记录仍可正常查看。{{ partialErrorText }}</span>
    </p>

    <section class="task-console-metrics" aria-label="任务运行指标">
      <article>
        <i class="ri-task-line" aria-hidden="true" />
        <span>任务总数</span>
        <strong>{{ consoleData.summary.taskCount }}</strong>
        <small>{{ consoleData.summary.jobCount }} 个作业定义</small>
      </article>
      <article>
        <i class="ri-timer-2-line" aria-hidden="true" />
        <span>启用与调度</span>
        <strong>{{ consoleData.summary.enabledJobCount }}</strong>
        <small>{{ consoleData.summary.activeScheduleCount }} 个活动调度</small>
      </article>
      <article>
        <i class="ri-hourglass-line" aria-hidden="true" />
        <span>队列等待</span>
        <strong>{{ consoleData.summary.queuedRuns }}</strong>
        <small>{{ consoleData.queues.length }} 个队列</small>
      </article>
      <article>
        <i class="ri-pulse-line" aria-hidden="true" />
        <span>正在运行</span>
        <strong>{{ consoleData.summary.runningRuns }}</strong>
        <small>实时队列统计</small>
      </article>
      <article :class="{ 'has-error': consoleData.summary.failedRuns > 0 }">
        <i class="ri-error-warning-line" aria-hidden="true" />
        <span>最近失败</span>
        <strong>{{ consoleData.summary.failedRuns }}</strong>
        <small>数据库运行记录</small>
      </article>
      <article :class="{ 'is-online': consoleData.summary.workerConnected === true }">
        <i class="ri-server-line" aria-hidden="true" />
        <span>Worker</span>
        <strong>{{ workerStatusLabel }}</strong>
        <small>{{ consoleData.engine.environment === 'prod' ? '生产环境' : '开发环境' }}</small>
      </article>
    </section>

    <div class="task-console-workspace">
      <aside class="task-console-list-panel">
        <header>
          <strong>后台任务</strong>
          <span>{{ filteredRows.length }} / {{ consoleData.rows.length }}</span>
        </header>

        <div class="task-console-list" role="listbox" aria-label="后台任务">
          <button
            v-for="task in filteredRows"
            :key="task.id"
            type="button"
            :class="['task-console-list-item', { active: task.id === selectedTaskId }]"
            :aria-selected="task.id === selectedTaskId"
            @click="selectTask(task.id)"
          >
            <span class="task-console-list-item__top">
              <span :class="['task-status', statusClass(task.status)]">
                <i />{{ taskStatusLabel(task.status) }}
              </span>
              <span class="task-source">{{ task.source === 'job' ? '作业定义' : '系统任务' }}</span>
            </span>
            <strong :title="task.name">{{ task.name }}</strong>
            <code :title="task.triggerTaskId">{{ task.triggerTaskId }}</code>
            <span class="task-console-list-item__schedule">
              <i class="ri-time-line" aria-hidden="true" />
              <span :title="task.scheduleText">{{ task.scheduleText }}</span>
              <b v-if="task.runningCount">{{ task.runningCount }} 运行中</b>
              <b v-else-if="task.queuedCount">{{ task.queuedCount }} 排队</b>
            </span>
            <span class="task-console-list-item__footer">
              <span>
                <i :class="lastRunIcon(task.lastRun?.status)" aria-hidden="true" />
                {{ task.lastRun ? task.lastRun.statusLabel : '暂无运行记录' }}
              </span>
              <time>{{ formatRelativeTime(task.lastRun?.createdAt ?? task.updatedAt) }}</time>
            </span>
          </button>

          <div v-if="!loading && !filteredRows.length" class="task-console-empty">
            <i class="ri-inbox-2-line" aria-hidden="true" />
            <strong>没有匹配的任务</strong>
            <span>调整搜索条件或任务状态筛选</span>
          </div>
        </div>
      </aside>

      <main v-if="selectedTask" class="task-console-detail">
        <header class="task-console-detail__header">
          <div>
            <span :class="['task-status', statusClass(selectedTask.status)]">
              <i />{{ taskStatusLabel(selectedTask.status) }}
            </span>
            <span>{{ typeLabel(selectedTask.type) }}</span>
          </div>
          <section>
            <h1>{{ selectedTask.name }}</h1>
            <code>{{ selectedTask.code }}</code>
          </section>
          <div class="task-console-detail__commands" v-if="selectedTask.source === 'job'">
            <button
              v-if="selectedTask.status === 'enabled'"
              type="button"
              :disabled="actionLoading"
              @click="changeTaskStatus('disabled')"
            >
              <i class="ri-pause-line" aria-hidden="true" />
              停用
            </button>
            <button
              v-else
              type="button"
              :disabled="actionLoading"
              @click="changeTaskStatus('enabled')"
            >
              <i class="ri-play-line" aria-hidden="true" />
              启用
            </button>
            <button
              class="is-primary"
              type="button"
              :disabled="actionLoading"
              @click="runSelectedTask"
            >
              <i :class="actionLoading ? 'ri-loader-4-line is-spinning' : 'ri-play-circle-line'" aria-hidden="true" />
              立即运行
            </button>
          </div>
        </header>

        <div v-if="detailLoading" class="task-console-detail-loading">
          <i class="ri-loader-4-line is-spinning" aria-hidden="true" />
          正在加载任务详情
        </div>

        <div v-else-if="consoleDetail" class="task-console-detail__body">
          <section class="task-console-overview">
            <div class="task-console-section-title">
              <h2>运行概览</h2>
              <span>{{ selectedTask.description }}</span>
            </div>
            <dl class="task-console-definition-grid">
              <div>
                <dt>Trigger Task ID</dt>
                <dd><code>{{ selectedTask.triggerTaskId }}</code></dd>
              </div>
              <div>
                <dt>触发方式</dt>
                <dd>{{ selectedTask.scheduleText }}</dd>
              </div>
              <div>
                <dt>下次触发</dt>
                <dd>{{ formatTime(selectedTask.nextRunAt) }}</dd>
              </div>
              <div>
                <dt>时区</dt>
                <dd>{{ selectedTask.timezone || '-' }}</dd>
              </div>
              <div>
                <dt>重试策略</dt>
                <dd>{{ retryPolicyText }}</dd>
              </div>
              <div>
                <dt>超时限制</dt>
                <dd>{{ consoleDetail.job?.timeoutSeconds ? `${consoleDetail.job.timeoutSeconds} 秒` : '默认' }}</dd>
              </div>
            </dl>
          </section>

          <section class="task-console-runtime-grid">
            <article>
              <div class="task-console-section-title is-compact">
                <h2>队列</h2>
                <span>{{ consoleDetail.queues.length }} 个关联队列</span>
              </div>
              <div v-if="consoleDetail.queues.length" class="task-console-queue-list">
                <div v-for="queue in consoleDetail.queues" :key="queue.id">
                  <span>
                    <code>{{ queue.name }}</code>
                    <small>{{ queue.paused ? '已暂停' : '活动' }}</small>
                  </span>
                  <b>{{ queue.running }} 运行 · {{ queue.queued }} 排队</b>
                </div>
              </div>
              <p v-else class="task-console-inline-empty">当前没有关联队列数据</p>
            </article>
            <article>
              <div class="task-console-section-title is-compact">
                <h2>调度与 Worker</h2>
                <span>{{ workerStatusLabel }}</span>
              </div>
              <dl class="task-console-engine-list">
                <div><dt>调度状态</dt><dd>{{ scheduleStateLabel }}</dd></div>
                <div><dt>调度 ID</dt><dd><code>{{ selectedTask.scheduleId || '-' }}</code></dd></div>
                <div><dt>运行环境</dt><dd>{{ consoleDetail.engine.environment }}</dd></div>
                <div><dt>项目</dt><dd>{{ consoleDetail.engine.projectRef || '-' }}</dd></div>
              </dl>
            </article>
          </section>

          <section class="task-console-runs">
            <div class="task-console-section-title">
              <h2>最近运行</h2>
              <span>{{ consoleDetail.runs.length }} 条记录</span>
            </div>
            <div class="task-console-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>触发时间</th>
                    <th>运行耗时</th>
                    <th>尝试</th>
                    <th>Run ID</th>
                    <th>失败原因</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="run in consoleDetail.runs" :key="`${run.source}:${run.id}`">
                    <td>
                      <span :class="['run-status', runStatusClass(run.status)]">
                        <i />{{ run.statusLabel }}
                      </span>
                    </td>
                    <td>{{ formatTime(run.createdAt) }}</td>
                    <td>{{ formatDuration(run.durationMs, run.startedAt) }}</td>
                    <td>{{ run.attempt ?? '-' }}</td>
                    <td><code :title="run.triggerRunId || run.id">{{ shortId(run.triggerRunId || run.id, 16) }}</code></td>
                    <td class="task-console-error-cell" :title="run.errorMessage">{{ run.errorMessage || '-' }}</td>
                  </tr>
                  <tr v-if="!consoleDetail.runs.length">
                    <td colspan="6" class="task-console-table-empty">当前没有运行记录</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      <main v-else-if="!loading" class="task-console-no-selection">
        <i class="ri-task-line" aria-hidden="true" />
        <strong>选择一个后台任务</strong>
        <span>任务定义、调度、队列与最近运行会显示在这里</span>
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { VxeUI } from 'vxe-pc-ui';
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';

type TaskSource = 'job' | 'system';
type TaskStatus = 'draft' | 'enabled' | 'disabled' | 'archived' | 'registered';
type TaskType = 'once' | 'cron' | 'interval' | 'manual' | 'service_task' | 'system';

type TaskRun = {
  id: string;
  source: 'database' | 'trigger';
  status: string;
  statusLabel: string;
  attempt?: number;
  triggerRunId?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  taskIdentifier?: string;
};

type TaskRow = {
  id: string;
  source: TaskSource;
  name: string;
  code: string;
  description: string;
  category: string;
  type: TaskType;
  status: TaskStatus;
  triggerTaskId: string;
  scheduleId?: string;
  scheduleActive?: boolean;
  scheduleText: string;
  timezone?: string;
  nextRunAt?: string;
  lastRun?: TaskRun;
  runCounts: Record<string, number>;
  queuedCount: number;
  runningCount: number;
  queuePaused: boolean;
  workerConnected: boolean | null;
  updatedAt?: string;
};

type TriggerQueue = {
  id: string;
  name: string;
  type: 'task' | 'custom';
  running: number;
  queued: number;
  paused: boolean;
  concurrencyLimit: number | null;
};

type TriggerEngine = {
  configured: boolean;
  apiUrl: string;
  projectRef: string | null;
  environment: 'dev' | 'prod';
  environmentId: string | null;
  workerConnected: boolean | null;
  activeWorkerCount: number;
  environmentConcurrencyLimit: number | null;
};

type TaskConsoleResponse = {
  generatedAt: string;
  partial: boolean;
  errors: Record<string, string | undefined>;
  summary: {
    taskCount: number;
    jobCount: number;
    enabledJobCount: number;
    activeScheduleCount: number;
    queuedRuns: number;
    runningRuns: number;
    failedRuns: number;
    workerConnected: boolean | null;
  };
  engine: TriggerEngine;
  rows: TaskRow[];
  queues: TriggerQueue[];
  schedules: Array<{ id: string; active: boolean }>;
  workers: Array<Record<string, unknown>>;
};

type TaskConsoleDetail = {
  task: TaskRow;
  job?: {
    retryPolicy: Record<string, unknown>;
    timeoutSeconds?: number;
  };
  schedule?: { id: string; active: boolean };
  queues: TriggerQueue[];
  runs: TaskRun[];
  engine: TriggerEngine;
  partial: boolean;
  errors: Record<string, string | undefined>;
};

const EMPTY_ENGINE: TriggerEngine = {
  configured: false,
  apiUrl: '',
  projectRef: null,
  environment: 'dev',
  environmentId: null,
  workerConnected: null,
  activeWorkerCount: 0,
  environmentConcurrencyLimit: null
};

const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const detailLoading = ref(false);
const actionLoading = ref(false);
const errorMessage = ref('');
const selectedTaskId = ref('');
const consoleDetail = ref<TaskConsoleDetail | null>(null);
const keyword = ref('');
const sourceFilter = ref<'all' | TaskSource>('all');
const statusFilter = ref<'all' | TaskStatus>('all');
const consoleData = reactive<TaskConsoleResponse>({
  generatedAt: '',
  partial: false,
  errors: {},
  summary: {
    taskCount: 0,
    jobCount: 0,
    enabledJobCount: 0,
    activeScheduleCount: 0,
    queuedRuns: 0,
    runningRuns: 0,
    failedRuns: 0,
    workerConnected: null
  },
  engine: { ...EMPTY_ENGINE },
  rows: [],
  queues: [],
  schedules: [],
  workers: []
});
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const filteredRows = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return consoleData.rows.filter((task) => {
    if (sourceFilter.value !== 'all' && task.source !== sourceFilter.value) return false;
    if (statusFilter.value !== 'all' && task.status !== statusFilter.value) return false;
    if (!query) return true;
    return [task.name, task.code, task.triggerTaskId, task.scheduleText]
      .some((value) => value.toLowerCase().includes(query));
  });
});

const selectedTask = computed(
  () => consoleData.rows.find((task) => task.id === selectedTaskId.value) ?? null
);

const generatedAtText = computed(() =>
  consoleData.generatedAt ? `更新于 ${formatTime(consoleData.generatedAt)}` : '每 15 秒自动刷新'
);

const partialErrorText = computed(() => {
  const entries = Object.entries(consoleData.errors).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (!entries.length) return '';
  return `（${entries.map(([key, value]) => `${sectionLabel(key)}：${value}`).join('；')}）`;
});

const workerStatusLabel = computed(() => {
  if (consoleData.summary.workerConnected === true) return '已连接';
  if (consoleData.summary.workerConnected === false) return '未连接';
  return consoleData.engine.configured ? '未知' : '未配置';
});

const retryPolicyText = computed(() => {
  const policy = consoleDetail.value?.job?.retryPolicy;
  if (!policy) return 'Trigger.dev 默认策略';
  const attempts = Number(policy.maxAttempts ?? policy.max_attempts);
  return Number.isFinite(attempts) ? `最多 ${attempts} 次` : '已配置';
});

const scheduleStateLabel = computed(() => {
  if (!selectedTask.value?.scheduleId) return '无独立调度';
  return selectedTask.value.scheduleActive ? '活动' : '已停用';
});

async function workflowApi<T>(method: string, postData: Record<string, unknown> = {}) {
  return serviceApi.invoke<T>('workflow', method, {
    ...postData,
    tenantId: auth.activeAccount.value?.account_id
  });
}

async function loadConsole(preserveSelection = true, forceRefresh = false) {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  const previousSelection = preserveSelection ? selectedTaskId.value : '';
  try {
    const result = await workflowApi<TaskConsoleResponse>('getTaskConsole', { forceRefresh });
    Object.assign(consoleData, result);
    const queryTaskId = String(route.query.taskId ?? '').trim();
    const nextSelection = [previousSelection, queryTaskId]
      .find((id) => result.rows.some((task) => task.id === id)) ?? result.rows[0]?.id ?? '';
    if (nextSelection) await selectTask(nextSelection, false);
    else {
      selectedTaskId.value = '';
      consoleDetail.value = null;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '任务总控加载失败';
  } finally {
    loading.value = false;
  }
}

async function selectTask(taskId: string, updateRoute = true, forceRefresh = false) {
  if (!taskId) return;
  selectedTaskId.value = taskId;
  detailLoading.value = true;
  errorMessage.value = '';
  if (updateRoute && route.query.taskId !== taskId) {
    void router.replace({ query: { ...route.query, taskId } });
  }
  try {
    const detail = await workflowApi<TaskConsoleDetail>('getTaskConsoleDetail', {
      taskId,
      forceRefresh
    });
    if (selectedTaskId.value === taskId) consoleDetail.value = detail;
  } catch (error) {
    if (selectedTaskId.value === taskId) {
      consoleDetail.value = null;
      errorMessage.value = error instanceof Error ? error.message : '任务详情加载失败';
    }
  } finally {
    if (selectedTaskId.value === taskId) detailLoading.value = false;
  }
}

async function runSelectedTask() {
  const task = selectedTask.value;
  if (!task || task.source !== 'job') return;
  const confirmed = await VxeUI.modal.confirm({
    title: '立即运行任务',
    content: `确定立即运行“${task.name}”吗？`
  });
  if (confirmed !== 'confirm') return;
  actionLoading.value = true;
  try {
    await workflowApi('runJob', { jobId: task.id });
    void VxeUI.modal.message({ content: '任务已提交到 Trigger.dev', status: 'success' });
    await loadConsole(true, true);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '任务提交失败';
  } finally {
    actionLoading.value = false;
  }
}

async function changeTaskStatus(status: 'enabled' | 'disabled') {
  const task = selectedTask.value;
  if (!task || task.source !== 'job') return;
  actionLoading.value = true;
  try {
    await workflowApi('updateJobStatus', { jobId: task.id, status });
    void VxeUI.modal.message({
      content: status === 'enabled' ? '任务已启用' : '任务已停用',
      status: 'success'
    });
    await loadConsole(true, true);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '任务状态更新失败';
  } finally {
    actionLoading.value = false;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void loadConsole(true, true);
  }, 15_000);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = undefined;
}

function taskStatusLabel(status: string) {
  return ({ draft: '草稿', enabled: '已启用', disabled: '已停用', archived: '已归档', registered: '已注册' } as Record<string, string>)[status] ?? status;
}

function typeLabel(type: string) {
  return ({ once: '单次任务', cron: 'Cron 定时任务', interval: '间隔任务', manual: '手动任务', service_task: '服务任务', system: '系统任务' } as Record<string, string>)[type] ?? type;
}

function statusClass(status: string) {
  return `is-${status.toLowerCase().replace(/_/g, '-')}`;
}

function runStatusClass(status: string) {
  const normalized = status.toLowerCase();
  if (['succeeded', 'completed'].includes(normalized)) return 'is-success';
  if (['failed', 'crashed', 'system_failure', 'timed_out'].includes(normalized)) return 'is-failed';
  if (['running', 'executing', 'dequeued'].includes(normalized)) return 'is-running';
  if (['queued', 'pending_version', 'waiting', 'delayed'].includes(normalized)) return 'is-queued';
  return 'is-neutral';
}

function lastRunIcon(status?: string) {
  const className = runStatusClass(status ?? '');
  if (className === 'is-success') return 'ri-checkbox-circle-line';
  if (className === 'is-failed') return 'ri-error-warning-line';
  if (className === 'is-running') return 'ri-loader-4-line is-spinning';
  return 'ri-time-line';
}

function formatTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date);
}

function formatRelativeTime(value?: string) {
  if (!value) return '-';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '-';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 小时前`;
  return formatTime(value).slice(0, 10);
}

function formatDuration(value?: number, startedAt?: string) {
  const duration = value ?? (startedAt ? Math.max(0, Date.now() - Date.parse(startedAt)) : undefined);
  if (duration === undefined || !Number.isFinite(duration)) return '-';
  if (duration < 1000) return `${Math.round(duration)} ms`;
  if (duration < 60_000) return `${(duration / 1000).toFixed(duration < 10_000 ? 1 : 0)} 秒`;
  return `${Math.floor(duration / 60_000)} 分 ${Math.round((duration % 60_000) / 1000)} 秒`;
}

function shortId(value?: string, length = 12) {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function sectionLabel(section: string) {
  return ({ credentials: '凭据', queues: '队列', runs: 'Runs', schedules: '调度', waitpoints: '等待点', workers: 'Worker' } as Record<string, string>)[section] ?? section;
}

onMounted(async () => {
  await auth.init();
  await loadConsole(false);
  startAutoRefresh();
});
onActivated(startAutoRefresh);
onDeactivated(stopAutoRefresh);
onBeforeUnmount(stopAutoRefresh);

let observedAccountEpoch = auth.accountEpoch.value;
watch(
  () => auth.accountEpoch.value,
  (nextAccountEpoch) => {
    if (nextAccountEpoch === observedAccountEpoch) return;
    observedAccountEpoch = nextAccountEpoch;
    void loadConsole(false, true);
  }
);
</script>

<style scoped>
.task-console-page {
  --tc-border: #d7dee7;
  --tc-muted: #667085;
  flex: 1 1 auto;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
  padding: 6px;
  color: #182230;
}

.task-console-toolbar {
  display: flex;
  min-height: 38px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  background: #fff;
  padding: 5px 7px 5px 10px;
}

.task-console-toolbar > div:first-child { display: flex; align-items: baseline; gap: 8px; }
.task-console-toolbar strong { font-size: 13px; }
.task-console-toolbar span { color: var(--tc-muted); font-size: 9px; }
.task-console-toolbar__actions { display: flex; min-width: 0; align-items: center; gap: 5px; }
.task-console-toolbar select {
  height: 26px;
  border: 1px solid #cfd7e2;
  border-radius: 4px;
  background: #fff;
  color: #344054;
  font-size: 10px;
  padding: 0 22px 0 7px;
}

.task-console-search {
  display: flex;
  width: min(270px, 28vw);
  height: 26px;
  align-items: center;
  gap: 5px;
  border: 1px solid #cfd7e2;
  border-radius: 4px;
  background: #fff;
  padding: 0 7px;
}
.task-console-search i { color: #98a2b3; }
.task-console-search input { width: 100%; min-width: 0; border: 0; outline: none; font: inherit; font-size: 10px; }
.task-console-icon-button {
  display: grid;
  width: 27px;
  height: 26px;
  place-items: center;
  border: 1px solid #cfd7e2;
  border-radius: 4px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}
.task-console-icon-button:hover { background: #f8fafc; }
.task-console-icon-button:disabled { cursor: wait; opacity: .6; }

.task-console-alert {
  display: flex;
  flex: none;
  align-items: center;
  gap: 7px;
  margin: 0;
  border: 1px solid;
  border-radius: 5px;
  font-size: 10px;
  line-height: 16px;
  padding: 6px 9px;
}
.task-console-alert span { flex: 1; }
.task-console-alert button { border: 0; background: transparent; color: inherit; cursor: pointer; }
.task-console-alert.is-error { border-color: #fecaca; background: #fef2f2; color: #b42318; }
.task-console-alert.is-warning { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }

.task-console-metrics {
  display: grid;
  flex: none;
  grid-template-columns: repeat(6, minmax(110px, 1fr));
  gap: 6px;
}
.task-console-metrics article {
  display: grid;
  min-width: 0;
  height: 58px;
  grid-template-columns: 25px minmax(0, 1fr) auto;
  grid-template-rows: 24px 18px;
  align-items: center;
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  background: #fff;
  padding: 7px 8px;
}
.task-console-metrics article > i {
  grid-row: 1 / 3;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 4px;
  background: #eef2f6;
  color: #344054;
  font-size: 13px;
}
.task-console-metrics span { overflow: hidden; color: #475467; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.task-console-metrics strong { grid-row: 1 / 3; color: #101828; font-size: 18px; }
.task-console-metrics small { color: #98a2b3; font-size: 8px; white-space: nowrap; }
.task-console-metrics article.has-error > i { background: #fef2f2; color: #b42318; }
.task-console-metrics article.has-error strong { color: #b42318; }
.task-console-metrics article.is-online > i { background: #ecfdf3; color: #027a48; }
.task-console-metrics article.is-online strong { color: #027a48; font-size: 13px; }

.task-console-workspace {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  grid-template-columns: clamp(320px, 26vw, 410px) minmax(0, 1fr);
  gap: 7px;
}
.task-console-list-panel,
.task-console-detail,
.task-console-no-selection {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  background: #fff;
}
.task-console-list-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); }
.task-console-list-panel > header {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  padding: 6px 10px;
}
.task-console-list-panel > header strong { font-size: 11px; }
.task-console-list-panel > header span { color: var(--tc-muted); font-size: 9px; }
.task-console-list { min-height: 0; overflow: auto; background: #f8fafc; }
.task-console-list-item {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 5px;
  border: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  color: #475467;
  cursor: pointer;
  font: inherit;
  padding: 9px 10px;
  text-align: left;
}
.task-console-list-item:hover { background: #f8fafc; }
.task-console-list-item.active { background: #eef8f5; box-shadow: inset 3px 0 0 #087f5b; }
.task-console-list-item__top,
.task-console-list-item__schedule,
.task-console-list-item__footer { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 7px; }
.task-console-list-item > strong { overflow: hidden; color: #182230; font-size: 11px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.task-console-list-item > code { overflow: hidden; color: #667085; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.task-source { color: #98a2b3; font-size: 8px; }
.task-console-list-item__schedule { color: #475467; font-size: 9px; }
.task-console-list-item__schedule > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-console-list-item__schedule > i { color: #2563eb; }
.task-console-list-item__schedule b { color: #1d4ed8; font-size: 8px; white-space: nowrap; }
.task-console-list-item__footer { color: #98a2b3; font-size: 8px; }
.task-console-list-item__footer span { display: inline-flex; align-items: center; gap: 4px; }

.task-status,
.run-status {
  display: inline-flex;
  min-height: 18px;
  align-items: center;
  gap: 4px;
  border: 1px solid #d0d5dd;
  border-radius: 999px;
  background: #f9fafb;
  color: #475467;
  font-size: 8px;
  font-weight: 800;
  padding: 1px 6px;
  white-space: nowrap;
}
.task-status i,
.run-status i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.task-status.is-enabled,
.task-status.is-registered,
.run-status.is-success { border-color: #86efac; background: #f0fdf4; color: #15803d; }
.task-status.is-draft,
.run-status.is-queued { border-color: #fde68a; background: #fffbeb; color: #a16207; }
.task-status.is-disabled,
.task-status.is-archived,
.run-status.is-neutral { border-color: #cbd5e1; background: #f1f5f9; color: #526072; }
.run-status.is-running { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
.run-status.is-failed { border-color: #fca5a5; background: #fef2f2; color: #b42318; }

.task-console-detail { display: grid; grid-template-rows: auto minmax(0, 1fr); }
.task-console-detail__header {
  display: grid;
  min-height: 72px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-content: center;
  gap: 5px 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #fbfcfd;
  padding: 9px 12px;
}
.task-console-detail__header > div:first-child { display: flex; align-items: center; gap: 7px; color: #667085; font-size: 9px; }
.task-console-detail__header section { min-width: 0; }
.task-console-detail__header h1 { margin: 0; color: #101828; font-size: 15px; line-height: 21px; }
.task-console-detail__header code { color: #667085; font-size: 9px; }
.task-console-detail__commands { grid-column: 2; grid-row: 1 / 3; display: flex; align-items: center; gap: 5px; }
.task-console-detail__commands button {
  display: inline-flex;
  height: 27px;
  align-items: center;
  gap: 4px;
  border: 1px solid #cfd7e2;
  border-radius: 4px;
  background: #fff;
  color: #344054;
  cursor: pointer;
  font-size: 9px;
  padding: 0 8px;
}
.task-console-detail__commands button.is-primary { border-color: #087f5b; background: #087f5b; color: #fff; }
.task-console-detail__commands button:disabled { cursor: wait; opacity: .6; }
.task-console-detail-loading { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--tc-muted); font-size: 10px; }
.task-console-detail__body { min-height: 0; overflow: auto; background: #f8fafc; padding: 8px; }
.task-console-detail__body > section,
.task-console-runtime-grid > article {
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  background: #fff;
}
.task-console-overview,
.task-console-runs { padding: 10px; }
.task-console-runtime-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin: 7px 0; }
.task-console-runtime-grid > article { min-width: 0; padding: 9px 10px; }
.task-console-section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.task-console-section-title h2 { margin: 0; color: #101828; font-size: 11px; }
.task-console-section-title span { overflow: hidden; color: #667085; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.task-console-section-title.is-compact { margin-bottom: 6px; }
.task-console-definition-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin: 0; border: 1px solid #e2e8f0; border-radius: 5px; overflow: hidden; }
.task-console-definition-grid > div { min-width: 0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 7px 8px; }
.task-console-definition-grid > div:nth-child(3n) { border-right: 0; }
.task-console-definition-grid > div:nth-last-child(-n + 3) { border-bottom: 0; }
.task-console-definition-grid dt,
.task-console-engine-list dt { color: #98a2b3; font-size: 8px; }
.task-console-definition-grid dd,
.task-console-engine-list dd { overflow: hidden; margin: 3px 0 0; color: #344054; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.task-console-definition-grid code,
.task-console-engine-list code { font-size: 8px; }
.task-console-queue-list { display: grid; gap: 4px; }
.task-console-queue-list > div { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid #eef2f6; padding-top: 5px; }
.task-console-queue-list span { display: flex; min-width: 0; align-items: center; gap: 5px; }
.task-console-queue-list code { overflow: hidden; color: #344054; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.task-console-queue-list small { color: #027a48; font-size: 7px; }
.task-console-queue-list b { color: #667085; font-size: 8px; white-space: nowrap; }
.task-console-inline-empty { margin: 12px 0; color: #98a2b3; font-size: 8px; text-align: center; }
.task-console-engine-list { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; margin: 0; }
.task-console-engine-list > div { min-width: 0; }
.task-console-table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 5px; }
.task-console-table-wrap table { width: 100%; min-width: 720px; border-collapse: collapse; }
.task-console-table-wrap th,
.task-console-table-wrap td { height: 31px; border-bottom: 1px solid #e2e8f0; color: #475467; font-size: 8px; padding: 5px 7px; text-align: left; white-space: nowrap; }
.task-console-table-wrap th { background: #f8fafc; color: #667085; font-weight: 800; }
.task-console-table-wrap tbody tr:last-child td { border-bottom: 0; }
.task-console-table-wrap code { font-size: 8px; }
.task-console-error-cell { max-width: 250px; overflow: hidden; color: #b42318 !important; text-overflow: ellipsis; }
.task-console-table-empty { height: 70px !important; color: #98a2b3 !important; text-align: center !important; }
.task-console-empty,
.task-console-no-selection { display: grid; place-content: center; gap: 4px; color: #667085; text-align: center; }
.task-console-empty { min-height: 190px; }
.task-console-empty i,
.task-console-no-selection i { color: #98a2b3; font-size: 25px; }
.task-console-empty strong,
.task-console-no-selection strong { color: #344054; font-size: 10px; }
.task-console-empty span,
.task-console-no-selection span { font-size: 8px; }
.is-spinning { display: inline-block; animation: task-console-spin .9s linear infinite; }
@keyframes task-console-spin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .task-console-metrics { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
  .task-console-workspace { grid-template-columns: 310px minmax(0, 1fr); }
  .task-console-definition-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .task-console-definition-grid > div:nth-child(3n) { border-right: 1px solid #e2e8f0; }
  .task-console-definition-grid > div:nth-child(2n) { border-right: 0; }
  .task-console-definition-grid > div:nth-last-child(-n + 3) { border-bottom: 1px solid #e2e8f0; }
  .task-console-definition-grid > div:nth-last-child(-n + 2) { border-bottom: 0; }
}

@media (max-width: 720px) {
  .task-console-page { overflow: auto; padding: 3px; }
  .task-console-toolbar { align-items: stretch; flex-direction: column; }
  .task-console-toolbar__actions { flex-wrap: wrap; }
  .task-console-search { width: 100%; }
  .task-console-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .task-console-workspace { display: flex; flex-direction: column; }
  .task-console-workspace { flex: none; height: auto; grid-template-columns: 1fr; }
  .task-console-list-panel { max-height: 520px; }
  .task-console-detail,
  .task-console-no-selection { min-height: 560px; }
  .task-console-detail__header { grid-template-columns: 1fr; }
  .task-console-detail__commands { grid-column: 1; grid-row: auto; }
  .task-console-runtime-grid { grid-template-columns: 1fr; }
  .task-console-definition-grid { grid-template-columns: 1fr; }
  .task-console-definition-grid > div { border-right: 0 !important; border-bottom: 1px solid #e2e8f0 !important; }
  .task-console-definition-grid > div:last-child { border-bottom: 0 !important; }
}
</style>
