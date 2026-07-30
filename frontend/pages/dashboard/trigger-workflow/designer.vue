<template>
  <section class="trigger-workflow-page">
    <header class="trigger-workflow-page__header">
      <div class="trigger-workflow-page__title">
        <h2>Trigger.dev Workflow 编排器</h2>
        <p>{{ model.code }} · {{ model.kind }} · {{ statusText }}</p>
      </div>

      <div class="trigger-workflow-page__job">
        <strong>模拟测试：20 秒用户日志定时任务</strong>
        <span>{{ jobStatusText }}</span>
      </div>

      <dl class="trigger-workflow-page__runtime">
        <div>
          <dt>Job</dt>
          <dd>{{ demoJob?.code ?? '未创建' }}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{{ demoJob?.status ?? '-' }}</dd>
        </div>
        <div>
          <dt>间隔</dt>
          <dd>{{ demoJob?.intervalSeconds ? `${demoJob.intervalSeconds}s` : '20s' }}</dd>
        </div>
        <div>
          <dt>最近运行</dt>
          <dd>{{ latestRunText }}</dd>
        </div>
      </dl>

      <div class="trigger-workflow-page__actions">
        <button type="button" @click="saveDraft">保存草稿</button>
        <button type="button" @click="loadDraft">恢复草稿</button>
        <button type="button" @click="copyModel">复制 JSON</button>
        <button type="button" :disabled="isJobBusy" @click="createAndEnableUsersLogJob">创建并启用</button>
        <button type="button" :disabled="isJobBusy || !demoJob" @click="runUsersLogJobOnce">手动触发一次</button>
        <button type="button" :disabled="isJobBusy" @click="refreshUsersLogJob">刷新运行记录</button>
      </div>
    </header>

    <TriggerWorkflowEditor
      v-model="model"
      height="calc(100vh - 118px)"
      @validation="issues = $event"
      @compile="compiledPlan = $event"
      @export="exportedModel = $event"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  TriggerWorkflowEditor,
  TRIGGER_WORKFLOW_SCHEMA_VERSION,
  createApprovalTriggerWorkflow,
  type TriggerWorkflowExecutionPlan,
  type TriggerWorkflowIssue,
  type TriggerWorkflowModel
} from '@enlearn/trigger-workflow-editor';

const storageKey = 'enlearn.trigger-workflow-editor.default';
const demoJobCode = 'supabase_users_20s_logger';
const demoTaskId = 'workflow.supabase.users.log';
const serviceApi = useServiceApi();
const model = ref<TriggerWorkflowModel>(createApprovalTriggerWorkflow());
const issues = ref<TriggerWorkflowIssue[]>([]);
const compiledPlan = ref<TriggerWorkflowExecutionPlan | undefined>();
const exportedModel = ref<TriggerWorkflowModel | undefined>();
const demoJob = ref<WorkflowJobRecord | undefined>();
const demoRuns = ref<WorkflowJobRunRecord[]>([]);
const isJobBusy = ref(false);
const jobMessage = ref('点击“创建并启用”后，后端每 20 秒读取 Supabase public.users 并打印日志。');

const statusText = computed(() => {
  const errors = issues.value.filter((issue) => issue.level === 'error').length;
  if (errors) return `${errors} 个错误`;
  if (issues.value.length) return `${issues.value.length} 个提示`;
  return '可编译';
});

const jobStatusText = computed(() => {
  if (isJobBusy.value) return '正在请求 workflow-api...';
  return jobMessage.value;
});

const latestRunText = computed(() => {
  const run = demoRuns.value[0];
  if (!run) return '暂无';
  const count = readUserCount(run.output);
  return `${run.status}${count === undefined ? '' : ` · ${count} users`} · ${new Date(run.createdAt).toLocaleTimeString()}`;
});

onMounted(() => {
  loadDraft();
  void refreshUsersLogJob();
});

function saveDraft() {
  window.localStorage.setItem(storageKey, JSON.stringify(model.value, null, 2));
}

function loadDraft() {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return;
  try {
    model.value = JSON.parse(saved) as TriggerWorkflowModel;
  } catch {
    window.localStorage.removeItem(storageKey);
  }
}

async function copyModel() {
  const value = exportedModel.value ?? model.value;
  await navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
}

async function createAndEnableUsersLogJob() {
  isJobBusy.value = true;
  try {
    model.value = createUsersLogWorkflowModel();
    saveDraft();

    await refreshUsersLogJob();
    let job = demoJob.value;
    if (!job) {
      job = await workflowApi<WorkflowJobRecord>('createJob', {
        code: demoJobCode,
        name: 'Supabase users 20s logger',
        type: 'interval',
        triggerTaskId: demoTaskId,
        intervalSeconds: 20,
        timezone: 'Asia/Shanghai',
        payload: {
          intervalSeconds: 20,
          limit: 20,
          source: 'public.users',
          logMode: 'backend-console'
        },
        retryPolicy: { maxAttempts: 1 },
        concurrencyKey: demoJobCode
      });
    }

    demoJob.value = await workflowApi<WorkflowJobRecord>('updateJobStatus', {
      jobId: job.id,
      status: 'enabled'
    });
    await refreshUsersLogJob();
    jobMessage.value = '已创建并启用：后端调度器会每 20 秒执行一次，日志在 workflow-api 控制台输出。';
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isJobBusy.value = false;
  }
}

async function runUsersLogJobOnce() {
  if (!demoJob.value) return;
  isJobBusy.value = true;
  try {
    await workflowApi<WorkflowJobRunRecord>('runJob', {
      jobId: demoJob.value.id,
      payload: {
        manual: true,
        requestedAt: new Date().toISOString()
      }
    });
    await refreshUsersLogJob();
    jobMessage.value = '已手动触发一次，请查看 workflow-api 后端日志。';
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isJobBusy.value = false;
  }
}

async function refreshUsersLogJob() {
  try {
    const jobs = await workflowApi<WorkflowJobRecord[]>('listJobs', { type: 'interval' });
    demoJob.value = jobs.find((job) => job.code === demoJobCode);
    demoRuns.value = demoJob.value
      ? await workflowApi<WorkflowJobRunRecord[]>('listJobRuns', { jobId: demoJob.value.id, limit: 20 })
      : [];
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function workflowApi<T>(serviceMethod: string, postData: Record<string, unknown> = {}) {
  return serviceApi.invoke<T>('workflow', serviceMethod, {
    tenantId: 'default',
    ...postData
  });
}

function createUsersLogWorkflowModel(): TriggerWorkflowModel {
  return {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: demoJobCode,
    name: 'Supabase Users 20s Logger',
    kind: 'dataSync',
    nodes: [
      {
        id: 'schedule',
        type: 'schedule',
        name: 'Every 20 seconds',
        position: { x: 380, y: 40 },
        config: {
          schedule: {
            cron: '*/20 * * * * *',
            timezone: 'Asia/Shanghai',
            externalId: demoJobCode
          },
          metadata: { intervalSeconds: 20 }
        }
      },
      {
        id: 'fetch_users',
        type: 'task',
        name: 'Fetch Supabase users',
        position: { x: 380, y: 210 },
        config: {
          task: {
            id: demoTaskId,
            queue: { name: 'workflow-local-jobs', concurrencyLimit: 1 },
            retry: { maxAttempts: 1 },
            idempotencyKey: '{{runId}}'
          },
          metadata: {
            table: 'public.users',
            limit: 20,
            logTarget: 'workflow-api console'
          }
        }
      },
      {
        id: 'end',
        type: 'end',
        name: 'Logged',
        position: { x: 380, y: 380 }
      }
    ],
    edges: [
      { id: 'edge_schedule_fetch_users', source: 'schedule', target: 'fetch_users' },
      { id: 'edge_fetch_users_end', source: 'fetch_users', target: 'end' }
    ]
  };
}

function readUserCount(output: Record<string, unknown> | undefined) {
  return typeof output?.userCount === 'number' ? output.userCount : undefined;
}

type WorkflowJobRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  triggerTaskId: string;
  intervalSeconds?: number;
  payload: Record<string, unknown>;
};

type WorkflowJobRunRecord = {
  id: string;
  status: string;
  output?: Record<string, unknown>;
  createdAt: string;
};
</script>

<style scoped>
.trigger-workflow-page {
  display: grid;
  gap: 8px;
}

.trigger-workflow-page__header {
  display: grid;
  grid-template-columns: minmax(230px, 0.95fr) minmax(280px, 1.15fr) minmax(320px, 1fr) auto;
  align-items: center;
  gap: 14px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 12px;
}

.trigger-workflow-page__title,
.trigger-workflow-page__job {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.trigger-workflow-page__title h2 {
  overflow: hidden;
  margin: 0;
  color: #111827;
  font-size: 18px;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-workflow-page__title p,
.trigger-workflow-page__job span {
  overflow: hidden;
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-workflow-page__job strong {
  overflow: hidden;
  color: #172033;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-workflow-page__runtime {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.trigger-workflow-page__runtime div {
  min-width: 0;
}

.trigger-workflow-page__runtime dt {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 800;
}

.trigger-workflow-page__runtime dd {
  overflow: hidden;
  margin: 1px 0 0;
  color: #172033;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-workflow-page__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  max-width: 430px;
}

.trigger-workflow-page__actions button {
  min-height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 9px;
}

.trigger-workflow-page__actions button:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.trigger-workflow-page__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 1320px) {
  .trigger-workflow-page__header {
    grid-template-columns: minmax(230px, 1fr) minmax(280px, 1.3fr) auto;
  }

  .trigger-workflow-page__runtime {
    display: none;
  }
}

@media (max-width: 900px) {
  .trigger-workflow-page__header {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .trigger-workflow-page__actions {
    justify-content: flex-start;
    max-width: none;
  }
}
</style>
