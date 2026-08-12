<template>
  <section class="trigger-workflow-page">
    <TriggerWorkflowEditor
      v-model="model"
      height="calc(100vh - 62px)"
      :busy="isJobBusy"
      :can-run="Boolean(demoJob)"
      @validation="issues = $event"
      @compile="compiledPlan = $event"
      @export="exportedModel = $event"
      @save="saveDraft"
      @restore="loadDraft"
      @copy="copyModel"
      @enable="createAndEnableUsersLogJob"
      @run="runUsersLogJobOnce"
      @refresh="refreshUsersLogJob"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import {
  TriggerWorkflowEditor,
  TRIGGER_WORKFLOW_SCHEMA_VERSION,
  createApprovalTriggerWorkflow,
  type TriggerWorkflowExecutionPlan,
  type TriggerWorkflowIssue,
  type TriggerWorkflowModel
} from '@enlearn/trigger-workflow-editor';

const auth = useAuth();
const storageKey = computed(() =>
  `enlearn.trigger-workflow-editor.${auth.activeAccount.value?.account_id ?? 'unselected'}`
);
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
const jobMessage = ref('');

onMounted(() => {
  loadDraft();
  void refreshUsersLogJob();
});

function saveDraft() {
  window.localStorage.setItem(storageKey.value, JSON.stringify(model.value, null, 2));
  notify('草稿已保存。', 'success');
}

function loadDraft() {
  const saved = window.localStorage.getItem(storageKey.value);
  if (!saved) return;
  try {
    model.value = JSON.parse(saved) as TriggerWorkflowModel;
    notify('已恢复本地草稿。', 'success');
  } catch {
    window.localStorage.removeItem(storageKey.value);
  }
}

async function copyModel() {
  const value = exportedModel.value ?? model.value;
  await navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
  notify('工作流 JSON 已复制。', 'success');
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
        name: 'Supabase 用户每分钟日志任务',
        type: 'interval',
        triggerTaskId: demoTaskId,
        intervalSeconds: 60,
        timezone: 'Asia/Shanghai',
        payload: {
          intervalSeconds: 60,
          limit: 20,
          source: 'public.users',
          logMode: 'backend-console'
        },
        retryPolicy: { maxAttempts: 1 },
        concurrencyKey: demoJobCode
      });
    }

    if (job.intervalSeconds !== 60) {
      throw new Error('现有示例任务使用旧的 20 秒间隔，请归档后重新创建为每分钟任务。');
    }

    demoJob.value = await workflowApi<WorkflowJobRecord>('updateJobStatus', {
      jobId: job.id,
      status: 'enabled'
    });
    await refreshUsersLogJob();
    jobMessage.value = '示例任务已创建并启用。';
    notify(jobMessage.value, 'success');
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
    notify(jobMessage.value, 'error');
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
    jobMessage.value = '已手动触发一次。';
    notify(jobMessage.value, 'success');
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
    notify(jobMessage.value, 'error');
  } finally {
    isJobBusy.value = false;
  }
}

async function refreshUsersLogJob() {
  try {
    const jobs = await workflowApi<WorkflowJobRecord[]>('listItems', {
      itemType: 'jobs',
      type: 'interval'
    });
    demoJob.value = jobs.find((job) => job.code === demoJobCode);
    demoRuns.value = demoJob.value
      ? await workflowApi<WorkflowJobRunRecord[]>('listItems', {
          itemType: 'jobRuns',
          jobId: demoJob.value.id,
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

function createUsersLogWorkflowModel(): TriggerWorkflowModel {
  return {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: demoJobCode,
    name: 'Supabase 用户每分钟日志任务',
    kind: 'dataSync',
    nodes: [
      {
        id: 'schedule',
        type: 'schedule',
        name: '每分钟触发',
        position: { x: 380, y: 40 },
        config: {
          schedule: {
            cron: '*/1 * * * *',
            timezone: 'Asia/Shanghai',
            externalId: demoJobCode
          },
          metadata: { intervalSeconds: 60 }
        }
      },
      {
        id: 'fetch_users',
        type: 'task',
        name: '读取 Supabase 用户',
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
            logTarget: 'workflow-api 控制台'
          }
        }
      },
      {
        id: 'end',
        type: 'end',
        name: '记录完成',
        position: { x: 380, y: 380 }
      }
    ],
    edges: [
      { id: 'edge_schedule_fetch_users', source: 'schedule', target: 'fetch_users' },
      { id: 'edge_fetch_users_end', source: 'fetch_users', target: 'end' }
    ]
  };
}

function notify(content: string, status: 'success' | 'error') {
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
  min-width: 0;
}
</style>
