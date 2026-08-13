<template>
  <section class="trigger-workflow-page">
    <TriggerWorkflowEditor
      v-model="model"
      height="calc(100vh - 62px)"
      :busy="isJobBusy"
      :can-run="Boolean(demoJob)"
      :node-form-schemas="nodeFormSchemas"
      :edge-form-schema="edgeFormSchema"
      :inspector-schemas-loading="inspectorSchemasLoading"
      @validation="issues = $event"
      @compile="compiledPlan = $event"
      @export="exportedModel = $event"
      @save="saveDraft"
      @restore="loadDraft"
      @copy="copyModel"
      @enable="createFrontendCommandJob"
      @run="runFrontendCommandJob"
      @refresh="refreshFrontendCommandJob"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import {
  TRIGGER_EDGE_FORM_SCHEMA_CODE,
  TriggerWorkflowEditor,
  TRIGGER_WORKFLOW_SCHEMA_VERSION,
  assertTriggerInspectorFormSchema,
  createApprovalTriggerWorkflow,
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
const demoJobCode = 'frontend_command_message_10s';
const demoTaskId = 'frontend.command.message.loop';
const serviceApi = useServiceApi();
const model = ref<TriggerWorkflowModel>(createApprovalTriggerWorkflow());
const issues = ref<TriggerWorkflowIssue[]>([]);
const compiledPlan = ref<TriggerWorkflowExecutionPlan | undefined>();
const exportedModel = ref<TriggerWorkflowModel | undefined>();
const demoJob = ref<WorkflowJobRecord | undefined>();
const demoRuns = ref<WorkflowJobRunRecord[]>([]);
const isJobBusy = ref(false);
const jobMessage = ref('');
const inspectorSchemasLoading = ref(false);
const nodeFormSchemas = shallowRef<TriggerNodeFormSchemaMap>({});
const edgeFormSchema = shallowRef<TriggerInspectorFormSchema>();

onMounted(() => {
  if (!loadDraft()) {
    model.value = createFrontendCommandWorkflowModel();
  }
  void loadInspectorSchemas();
  void refreshFrontendCommandJob();
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

function saveDraft() {
  window.localStorage.setItem(storageKey.value, JSON.stringify(model.value, null, 2));
  notify('草稿已保存。', 'success');
}

function loadDraft() {
  const saved = window.localStorage.getItem(storageKey.value);
  if (!saved) return false;
  try {
    model.value = JSON.parse(saved) as TriggerWorkflowModel;
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

async function createFrontendCommandJob() {
  isJobBusy.value = true;
  try {
    model.value = createFrontendCommandWorkflowModel();
    saveDraft();

    await refreshFrontendCommandJob();
    let job = demoJob.value;
    if (!job) {
      job = await workflowApi<WorkflowJobRecord>('createJob', {
        code: demoJobCode,
        name: '前端指令每 10 秒消息任务',
        type: 'manual',
        triggerTaskId: demoTaskId,
        timezone: 'Asia/Shanghai',
        payload: {
          userId: auth.user.value?.id,
          repeatCount: 6,
          message: '接受指令成功',
          messageType: 'success'
        },
        retryPolicy: { maxAttempts: 3 },
        timeoutSeconds: 120,
        concurrencyKey: demoJobCode
      });
    }

    if (job.triggerTaskId !== demoTaskId || job.type !== 'manual') {
      throw new Error('同名作业不是前端指令手动作业，请先归档该作业后重新创建。');
    }

    demoJob.value = await workflowApi<WorkflowJobRecord>('updateJobStatus', {
      jobId: job.id,
      status: 'enabled'
    });
    await refreshFrontendCommandJob();
    jobMessage.value = '前端指令作业已创建并启用。';
    notify(jobMessage.value, 'success');
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
    notify(jobMessage.value, 'error');
  } finally {
    isJobBusy.value = false;
  }
}

async function runFrontendCommandJob() {
  if (!demoJob.value) return;
  isJobBusy.value = true;
  try {
    await workflowApi<WorkflowJobRunRecord>('runJob', {
      jobId: demoJob.value.id,
      payload: {
        userId: auth.user.value?.id,
        intervalSeconds: 10,
        repeatCount: 6,
        message: '接受指令成功',
        messageType: 'success',
        requestedAt: new Date().toISOString()
      }
    });
    await refreshFrontendCommandJob();
    jobMessage.value = '已启动任务，将每 10 秒发送一次消息，共 6 次。';
    notify(jobMessage.value, 'success');
  } catch (error) {
    jobMessage.value = error instanceof Error ? error.message : String(error);
    notify(jobMessage.value, 'error');
  } finally {
    isJobBusy.value = false;
  }
}

async function refreshFrontendCommandJob() {
  try {
    const jobs = await workflowApi<WorkflowJobRecord[]>('listItems', {
      itemType: 'jobs'
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

function createFrontendCommandWorkflowModel(): TriggerWorkflowModel {
  return {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: demoJobCode,
    name: '前端指令每 10 秒消息任务',
    kind: 'custom',
    nodes: [
      {
        id: 'manual_start',
        type: 'start',
        name: '手动触发',
        position: { x: 380, y: 40 },
        config: {
          metadata: { triggerMode: 'manual' }
        }
      },
      {
        id: 'send_frontend_command',
        type: 'task',
        name: '发送前端消息指令',
        position: { x: 380, y: 210 },
        config: {
          task: {
            type: 'registeredTask',
            id: demoTaskId,
            queue: { name: 'frontend-command-jobs', concurrencyLimit: 10 },
            retry: {
              maxAttempts: 3,
              factor: 2,
              minTimeoutMs: 1000,
              maxTimeoutMs: 10000
            },
            timeoutSeconds: 120,
            idempotencyKey: '{{runId}}'
          },
          metadata: {
            target: 'currentUser',
            intervalSeconds: 10,
            repeatCount: 6,
            commandCode: 'message.show',
            message: '接受指令成功'
          }
        }
      },
      {
        id: 'end',
        type: 'end',
        name: '发送完成',
        position: { x: 380, y: 380 }
      }
    ],
    edges: [
      { id: 'edge_start_command', source: 'manual_start', target: 'send_frontend_command' },
      { id: 'edge_command_end', source: 'send_frontend_command', target: 'end' }
    ]
  };
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
</script>

<style scoped>
.trigger-workflow-page {
  min-width: 0;
}
</style>
