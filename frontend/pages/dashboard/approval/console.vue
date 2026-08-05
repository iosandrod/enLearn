<template>
  <section class="approval-console-page">
    <p v-if="errorMessage" class="approval-console-alert" role="alert">
      <i class="ri-error-warning-line" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
      <button type="button" @click="errorMessage = ''" title="关闭" aria-label="关闭">
        <i class="ri-close-line" aria-hidden="true" />
      </button>
    </p>

    <div class="approval-console-workspace">
      <aside class="approval-console-instances">
        <header class="approval-console-list-header">
          <strong>流程实例</strong>
          <span v-if="loading"><i class="ri-loader-4-line is-spinning" /> 加载中</span>
          <span v-else>共 {{ consoleData.total }} 条</span>
        </header>

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
            <strong>暂无审批实例</strong>
            <span>当前没有可查看的流程</span>
          </div>
        </div>
      </aside>

      <main v-if="selectedInstance" class="approval-console-detail">
        <section class="approval-console-flow-panel">
          <ApprovalRuntimeViewer
            v-if="consoleDetail"
            :key="selectedInstanceId"
            class="approval-console-flow-viewer"
            :model="consoleDetail.definition.schema"
            :node-states="consoleDetail.nodeStates"
          />
          <div v-else class="approval-console-detail-loading">
            <i class="ri-loader-4-line is-spinning" aria-hidden="true" />
            正在加载流程运行图
          </div>
        </section>
      </main>

      <main v-else-if="!loading" class="approval-console-no-selection">
        <i class="ri-node-tree" aria-hidden="true" />
        <strong>选择一个审批实例</strong>
        <span>流程运行图会显示在这里</span>
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  ApprovalRuntimeViewer,
  type ApprovalRuntimeNodeState,
  type WorkflowModel
} from '@enlearn/approval-workflow';

type InstanceStatus = 'running' | 'approved' | 'rejected' | 'canceled' | 'terminated' | 'failed';

type ConsoleInstance = {
  id: string;
  definitionVersion: number;
  definitionName: string;
  title: string;
  status: InstanceStatus;
  initiatorId?: string;
  initiatorName: string;
  initiatorEmail: string;
  triggerRunId?: string;
  startedAt: string;
  nodeCount: number;
  completedNodeCount: number;
  currentNodeNames: string[];
  activeTaskCount: number;
};

type ConsoleResponse = {
  rows: ConsoleInstance[];
  total: number;
};

type ConsoleDetail = {
  definition: {
    schema: WorkflowModel;
  };
  nodeStates: ApprovalRuntimeNodeState[];
};

const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const selectedInstanceId = ref('');
const consoleDetail = ref<ConsoleDetail | null>(null);
const consoleData = reactive<ConsoleResponse>({
  rows: [],
  total: 0
});

const selectedInstance = computed(
  () => consoleData.rows.find((instance) => instance.id === selectedInstanceId.value) ?? null
);

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
      limit: 200
    });
    Object.assign(consoleData, result);

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
  consoleDetail.value = null;
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
  }
}

function instanceStatusLabel(status?: string) {
  return ({
    running: '进行中', approved: '已通过', rejected: '已驳回', canceled: '已取消',
    terminated: '已终止', failed: '失败'
  } as Record<string, string>)[status ?? ''] ?? status ?? '-';
}

function nodeProgress(instance: ConsoleInstance) {
  if (!instance.nodeCount) return 0;
  return Math.min(100, Math.round((instance.completedNodeCount / instance.nodeCount) * 100));
}

function formatTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function shortId(value?: string, length = 8) {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length)}…` : value;
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
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
  padding: 6px;
  color: #182230;
}

.approval-console-alert {
  display: flex;
  flex: none;
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

.approval-console-workspace {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  grid-template-columns: clamp(340px, 27vw, 430px) minmax(0, 1fr);
  gap: 7px;
}

.approval-console-instances,
.approval-console-detail,
.approval-console-no-selection {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #d5dde7;
  border-radius: 6px;
  background: #ffffff;
}

.approval-console-instances {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
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

.approval-console-list-header strong { color: #101828; font-size: 13px; }
.approval-console-list-header span { color: #667085; font-size: 9px; }

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
.console-status.is-running { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
.console-status.is-approved { border-color: #86efac; background: #f0fdf4; color: #15803d; }
.console-status.is-rejected,
.console-status.is-failed { border-color: #fca5a5; background: #fef2f2; color: #b42318; }
.console-status.is-canceled,
.console-status.is-terminated { border-color: #cbd5e1; background: #f1f5f9; color: #526072; }

.console-progress { display: flex; align-items: center; }
.console-progress > span { display: block; width: 100%; height: 5px; overflow: hidden; border-radius: 999px; background: #e2e8f0; }
.console-progress > span i { display: block; height: 100%; border-radius: inherit; background: #16a34a; }

.console-empty-cell { display: grid; min-height: 190px; place-content: center; color: #667085; text-align: center; }
.console-empty-cell i,
.console-empty-cell strong,
.console-empty-cell span { display: block; margin: 3px auto; }
.console-empty-cell i { color: #98a2b3; font-size: 24px; }
.console-empty-cell strong { color: #344054; font-size: 11px; }
.console-empty-cell span { font-size: 9px; }

.approval-console-detail,
.approval-console-flow-panel { display: grid; grid-template-rows: minmax(0, 1fr); }
.approval-console-flow-viewer { height: 100%; min-height: 0; }
.approval-console-detail-loading { display: flex; min-height: 0; align-items: center; justify-content: center; gap: 7px; color: #667085; font-size: 11px; }
.approval-console-no-selection { display: grid; place-content: center; gap: 5px; color: #667085; text-align: center; }
.approval-console-no-selection i { color: #98a2b3; font-size: 30px; }
.approval-console-no-selection strong { color: #344054; font-size: 12px; }
.approval-console-no-selection span { font-size: 10px; }

.is-spinning { display: inline-block; animation: console-spin 0.9s linear infinite; }
@keyframes console-spin { to { transform: rotate(360deg); } }

@media (max-width: 1280px) {
  .approval-console-workspace { grid-template-columns: 350px minmax(0, 1fr); }
}

@media (max-width: 900px) {
  .approval-console-workspace { grid-template-columns: 310px minmax(0, 1fr); }
}

@media (max-width: 620px) {
  .approval-console-page { overflow: auto; padding: 3px; }
  .approval-console-workspace { flex: none; height: auto; grid-template-columns: 1fr; }
  .approval-console-instances { max-height: 520px; }
  .approval-console-detail,
  .approval-console-no-selection { min-height: 520px; }
}
</style>
