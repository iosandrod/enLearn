<template>
  <section class="workflow-task-page">
    <header class="content-panel workflow-task-page__header">
      <div>
        <h2 class="page-title">{{ task?.title ?? '审批任务' }}</h2>
        <p class="page-description">
          {{ task?.nodeId ?? '-' }} · {{ instance?.title ?? '流程加载中' }}
        </p>
      </div>

      <span :class="['workflow-task-page__status', `workflow-task-page__status--${task?.status ?? 'loading'}`]">
        {{ taskStatusLabel }}
      </span>
    </header>

    <p v-if="errorMessage" class="workflow-task-page__message workflow-task-page__message--error">
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="workflow-task-page__message workflow-task-page__message--success">
      {{ successMessage }}
    </p>

    <div class="workflow-task-page__grid">
      <section class="content-panel workflow-task-page__panel">
        <header class="workflow-task-page__panel-head">
          <strong>任务信息</strong>
          <button type="button" :disabled="loading" @click="loadTask">
            <i class="ri-refresh-line" aria-hidden="true" />
            <span>刷新</span>
          </button>
        </header>

        <p v-if="loading" class="workflow-task-page__state">加载中...</p>
        <dl v-else class="workflow-task-page__details">
          <div>
            <dt>任务 ID</dt>
            <dd>{{ task?.id ?? '-' }}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{{ taskStatusLabel }}</dd>
          </div>
          <div>
            <dt>审批人</dt>
            <dd>{{ task?.assigneeId ?? currentUserId ?? '-' }}</dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>{{ formatTime(task?.createdAt) }}</dd>
          </div>
          <div>
            <dt>完成时间</dt>
            <dd>{{ formatTime(task?.completedAt) }}</dd>
          </div>
        </dl>
      </section>

      <section class="content-panel workflow-task-page__panel">
        <header class="workflow-task-page__panel-head">
          <strong>流程状态</strong>
          <span :class="['workflow-task-page__status', `workflow-task-page__status--${instance?.status ?? 'loading'}`]">
            {{ instanceStatusLabel }}
          </span>
        </header>

        <dl class="workflow-task-page__details">
          <div>
            <dt>流程 ID</dt>
            <dd>{{ instance?.id ?? '-' }}</dd>
          </div>
          <div>
            <dt>单据</dt>
            <dd>{{ instanceDocumentLabel }}</dd>
          </div>
          <div>
            <dt>发起人</dt>
            <dd>{{ instance?.initiatorId ?? '-' }}</dd>
          </div>
          <div>
            <dt>开始时间</dt>
            <dd>{{ formatTime(instance?.startedAt) }}</dd>
          </div>
          <div>
            <dt>结束时间</dt>
            <dd>{{ formatTime(instance?.endedAt) }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <section class="content-panel workflow-task-page__panel">
      <header class="workflow-task-page__panel-head">
        <strong>候选人与审核</strong>
      </header>

      <div class="workflow-task-page__candidates">
        <span v-for="candidate in task?.candidates ?? []" :key="candidate.id">
          {{ candidate.candidateType }} · {{ candidate.candidateId }}
        </span>
        <span v-if="!task?.candidates?.length">-</span>
      </div>

      <label class="workflow-task-page__field">
        <span>审核意见</span>
        <textarea v-model="comment" :disabled="!canApprove || approving" />
      </label>

      <div class="workflow-task-page__actions">
        <button
          class="workflow-task-page__button workflow-task-page__button--primary"
          type="button"
          :disabled="!canApprove || approving"
          @click="approveTask"
        >
          <i class="ri-check-line" aria-hidden="true" />
          <span>{{ approving ? '审核中...' : '审核通过' }}</span>
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
type WorkflowTaskStatus = 'pending' | 'claimed' | 'completed' | 'canceled';
type ProcessInstanceStatus = 'running' | 'approved' | 'rejected' | 'canceled' | 'terminated' | 'failed';

type WorkflowTaskCandidate = {
  id: string;
  candidateType: 'user' | 'role' | 'department';
  candidateId: string;
  snapshot: Record<string, unknown>;
};

type WorkflowTaskDetail = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  nodeInstanceId: string;
  nodeId: string;
  title: string;
  status: WorkflowTaskStatus;
  assigneeId?: string;
  createdAt: string;
  completedAt?: string;
  candidates: WorkflowTaskCandidate[];
};

type ProcessInstanceDetail = {
  id: string;
  tenantId: string;
  definitionId: string;
  definitionVersion: number;
  businessKey: string;
  documentType?: string;
  documentId?: string;
  title: string;
  status: ProcessInstanceStatus;
  initiatorId?: string;
  startedAt: string;
  endedAt?: string;
  tasks?: Array<{
    id: string;
    status: WorkflowTaskStatus;
    assigneeId?: string;
    completedAt?: string;
  }>;
};

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const route = useRoute();
const auth = useAuth();
const serviceApi = useServiceApi();

const task = ref<WorkflowTaskDetail | null>(null);
const instance = ref<ProcessInstanceDetail | null>(null);
const comment = ref('同意');
const loading = ref(false);
const approving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const taskId = computed(() => String(route.params.taskId ?? '').trim());
const currentUserId = computed(() => auth.user.value?.id ?? '');
const canApprove = computed(
  () => Boolean(task.value && instance.value) &&
    (task.value?.status === 'pending' || task.value?.status === 'claimed') &&
    instance.value?.status === 'running'
);
const taskStatusLabel = computed(() => statusLabel(task.value?.status));
const instanceStatusLabel = computed(() => statusLabel(instance.value?.status));
const instanceDocumentLabel = computed(() => {
  if (!instance.value?.documentType && !instance.value?.documentId) return '-';
  return [instance.value.documentType, instance.value.documentId].filter(Boolean).join(' / ');
});

async function workflowApi<T>(serviceMethod: string, postData: Record<string, unknown> = {}) {
  if (!currentUserId.value) {
    throw new Error('请先登录后再操作审批任务');
  }

  return serviceApi.invoke<T>('workflow', serviceMethod, {
    ...postData,
    tenantId: 'default',
    userId: currentUserId.value
  });
}

async function loadTask() {
  if (!taskId.value) return;

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const loadedTask = await workflowApi<WorkflowTaskDetail>('getTask', {
      taskId: taskId.value
    });
    task.value = loadedTask;
    instance.value = await workflowApi<ProcessInstanceDetail>('getInstance', {
      instanceId: loadedTask.processInstanceId
    });
  } catch (error) {
    task.value = null;
    instance.value = null;
    errorMessage.value = error instanceof Error ? error.message : '审批任务加载失败';
  } finally {
    loading.value = false;
  }
}

async function approveTask() {
  if (!task.value || !canApprove.value) return;

  approving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    instance.value = await workflowApi<ProcessInstanceDetail>('approveTask', {
      taskId: task.value.id,
      comment: comment.value.trim() || '同意'
    });
    task.value = {
      ...task.value,
      status: 'completed',
      completedAt: new Date().toISOString()
    };
    successMessage.value =
      instance.value.status === 'approved' ? '审核通过，审批流已完成' : '审核通过，流程正在继续流转';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '审核失败';
  } finally {
    approving.value = false;
  }
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    pending: '待审核',
    claimed: '已认领',
    completed: '已完成',
    canceled: '已取消',
    running: '流转中',
    approved: '已通过',
    rejected: '已驳回',
    terminated: '已终止',
    failed: '失败',
    loading: '加载中'
  };
  return labels[status ?? 'loading'] ?? status ?? '-';
}

function formatTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN');
}

onMounted(async () => {
  await auth.init();
  await loadTask();
});

watch(taskId, () => {
  void loadTask();
});
</script>

<style scoped>
.workflow-task-page {
  display: grid;
  gap: 14px;
  padding: 8px;
}

.workflow-task-page__header,
.workflow-task-page__panel {
  box-shadow: none;
}

.workflow-task-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
}

.workflow-task-page__header .page-description {
  margin-bottom: 0;
}

.workflow-task-page__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.workflow-task-page__panel {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.workflow-task-page__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workflow-task-page__panel-head strong {
  color: #101828;
  font-size: 15px;
}

.workflow-task-page__panel-head button,
.workflow-task-page__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #ffffff;
  color: #344054;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 0 12px;
}

.workflow-task-page__panel-head button:disabled,
.workflow-task-page__button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.workflow-task-page__button--primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.workflow-task-page__status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #475467;
  font-size: 12px;
  font-weight: 700;
  padding: 0 10px;
}

.workflow-task-page__status--pending,
.workflow-task-page__status--claimed,
.workflow-task-page__status--running {
  background: #fffaeb;
  color: #b54708;
}

.workflow-task-page__status--completed,
.workflow-task-page__status--approved {
  background: #ecfdf3;
  color: #027a48;
}

.workflow-task-page__status--failed,
.workflow-task-page__status--rejected {
  background: #fef3f2;
  color: #b42318;
}

.workflow-task-page__message {
  margin: 0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
}

.workflow-task-page__message--error {
  background: #fef3f2;
  color: #b42318;
}

.workflow-task-page__message--success {
  background: #ecfdf3;
  color: #027a48;
}

.workflow-task-page__details {
  display: grid;
  gap: 10px;
  margin: 0;
}

.workflow-task-page__details div {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 10px;
}

.workflow-task-page__details dt {
  color: #667085;
  font-size: 12px;
  font-weight: 700;
}

.workflow-task-page__details dd {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  color: #101828;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-page__state {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.workflow-task-page__candidates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workflow-task-page__candidates span {
  border: 1px solid #e4e7ec;
  border-radius: 999px;
  background: #f8fafc;
  color: #475467;
  font-size: 12px;
  padding: 4px 9px;
}

.workflow-task-page__field {
  display: grid;
  gap: 7px;
}

.workflow-task-page__field span {
  color: #475467;
  font-size: 13px;
  font-weight: 700;
}

.workflow-task-page__field textarea {
  min-height: 92px;
  resize: vertical;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  color: #101828;
  font: inherit;
  font-size: 13px;
  padding: 10px;
}

.workflow-task-page__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .workflow-task-page__grid {
    grid-template-columns: 1fr;
  }

  .workflow-task-page__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
