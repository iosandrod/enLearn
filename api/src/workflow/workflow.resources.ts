import type { ResourceConfigMap } from '../common/base.service';

function crudPermissions(permission: string) {
  return { list: permission, create: permission, update: permission, delete: permission };
}

const definitionPermissions = crudPermissions('workflow.definitions.manage');
const runtimePermissions = crudPermissions('workflow.runtime.manage');
const runtimeReadPermissions = { list: 'workflow.runtime.manage' };

export const workflowResources: ResourceConfigMap = {
  wf_model: {
    tableName: 'wf_model',
    clientMode: 'admin',
    accountField: 'account_id',
    transactionalHooks: true,
    databaseHooks: {
      beforeCreate: 'public.dynamic_crud_normalize_workflow_model',
      beforeUpdate: 'public.dynamic_crud_normalize_workflow_model'
    },
    databaseHookInputFields: [
      'code', 'name', 'document_type', 'documentType',
      'draft_schema', 'draftSchema', 'schema'
    ],
    permissions: definitionPermissions,
    defaults: {
      status: 'draft',
      current_version: 0
    },
    list: {
      defaultSorts: [{ field: 'updated_at', direction: 'desc' }],
      defaultPageSize: 200,
      maxPageSize: 1000
    },
    create: {
      allowedFields: ['code', 'name', 'document_type', 'draft_schema'],
      requiredFields: ['code', 'name', 'draft_schema'],
      userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
    },
    update: {
      allowedFields: ['code', 'name', 'document_type', 'draft_schema'],
      userFields: { updatedBy: 'updated_by' }
    },
    delete: {}
  },
  wf_model_version: {
    tableName: 'wf_model_version',
    clientMode: 'user',
    permissions: definitionPermissions,
    list: {
      defaultSorts: [{ field: 'version', direction: 'asc' }],
      defaultPageSize: 200,
      maxPageSize: 1000
    },
    create: {
      allowedFields: ['model_id', 'version', 'schema', 'remark'],
      requiredFields: ['model_id', 'version', 'schema'],
      timestamp: false,
      userFields: { createdBy: 'created_by' }
    },
    update: {
      allowedFields: ['schema', 'remark'],
      timestamp: false
    },
    delete: {}
  },
  wf_process_definition: {
    tableName: 'wf_process_definition',
    clientMode: 'user',
    accountField: 'account_id',
    permissions: definitionPermissions,
    list: {
      defaultSorts: [{ field: 'published_at', direction: 'desc' }],
      defaultPageSize: 200,
      maxPageSize: 1000
    },
    create: {
      allowedFields: [
        'model_id',
        'model_version_id',
        'code',
        'name',
        'version',
        'document_type',
        'schema',
        'status',
        'published_at'
      ],
      requiredFields: ['model_id', 'model_version_id', 'code', 'name', 'version', 'schema'],
      timestamp: false,
      userFields: { createdBy: 'published_by' }
    },
    update: {
      allowedFields: ['status'],
      timestamp: false
    },
    delete: {}
  },
  wf_process_instance: {
    tableName: 'wf_process_instance',
    clientMode: 'user',
    accountField: 'account_id',
    permissions: runtimePermissions,
    list: {
      defaultSorts: [{ field: 'started_at', direction: 'desc' }],
      defaultPageSize: 200,
      maxPageSize: 1000
    },
    create: {
      allowedFields: [
        'definition_id',
        'definition_version',
        'business_key',
        'document_type',
        'document_id',
        'title',
        'status',
        'initiator_id',
        'trigger_run_id',
        'trigger_task_id',
        'started_at',
        'ended_at'
      ],
      requiredFields: ['definition_id', 'definition_version', 'business_key', 'title'],
      timestamp: false
    },
    update: {
      allowedFields: ['status', 'trigger_run_id', 'trigger_task_id', 'ended_at'],
      timestamp: false
    },
    delete: {}
  },
  wf_node_instance: {
    tableName: 'wf_node_instance',
    clientMode: 'user',
    permissions: runtimeReadPermissions,
    list: {
      defaultSorts: [
        { field: 'started_at', direction: 'asc', nulls: 'last' },
        { field: 'id', direction: 'asc' }
      ],
      defaultPageSize: 200,
      maxPageSize: 1000
    }
  },
  wf_task: {
    tableName: 'wf_task',
    clientMode: 'user',
    accountField: 'account_id',
    permissions: runtimeReadPermissions,
    list: {
      defaultSorts: [{ field: 'created_at', direction: 'asc' }],
      defaultPageSize: 200,
      maxPageSize: 1000
    }
  },
  wf_job: {
    tableName: 'wf_job',
    clientMode: 'user',
    accountField: 'account_id',
    transactionalHooks: true,
    databaseHooks: {
      beforeCreate: 'public.dynamic_crud_normalize_workflow_job',
      beforeUpdate: 'public.dynamic_crud_normalize_workflow_job'
    },
    databaseHookInputFields: [
      'code', 'name', 'type', 'payload', 'intervalSeconds', 'interval_seconds',
      'triggerTaskId', 'trigger_task_id', 'cronExpr', 'cron_expr', 'timezone',
      'retryPolicy', 'retry_policy', 'timeoutSeconds', 'timeout_seconds',
      'concurrencyKey', 'concurrency_key'
    ],
    permissions: runtimePermissions,
    defaults: {
      status: 'draft',
      timezone: 'Asia/Shanghai',
      payload: {},
      retry_policy: { maxAttempts: 3 }
    },
    list: {
      defaultSorts: [{ field: 'updated_at', direction: 'desc' }],
      defaultPageSize: 200,
      maxPageSize: 1000
    },
    create: {
      allowedFields: [
        'code',
        'name',
        'type',
        'status',
        'trigger_task_id',
        'cron_expr',
        'timezone',
        'payload',
        'retry_policy',
        'timeout_seconds',
        'concurrency_key'
      ],
      requiredFields: ['code', 'name', 'type', 'trigger_task_id'],
      userFields: { createdBy: 'created_by' }
    },
    update: {
      allowedFields: [
        'name',
        'trigger_task_id',
        'cron_expr',
        'timezone',
        'payload',
        'retry_policy',
        'timeout_seconds',
        'concurrency_key'
      ]
    },
    delete: {}
  },
  wf_job_run: {
    tableName: 'wf_job_run',
    clientMode: 'user',
    accountField: 'account_id',
    permissions: runtimePermissions,
    list: {
      defaultSorts: [{ field: 'created_at', direction: 'desc' }],
      defaultPageSize: 20,
      maxPageSize: 200
    },
    create: {
      allowedFields: [
        'job_id',
        'trigger_run_id',
        'status',
        'attempt',
        'input',
        'output',
        'error_message',
        'started_at',
        'finished_at'
      ],
      requiredFields: ['status', 'attempt', 'input'],
      timestamp: false
    },
    update: {
      allowedFields: [
        'trigger_run_id',
        'status',
        'attempt',
        'output',
        'error_message',
        'started_at',
        'finished_at'
      ],
      timestamp: false
    },
    delete: {}
  }
};
