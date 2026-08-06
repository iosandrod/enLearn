import assert from 'node:assert/strict';

import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

async function callHook(functionName: string, payload: JsonRecord, context: JsonRecord) {
  const admin = createSupabaseClient('admin');
  const { data, error } = await admin.rpc(functionName, {
    payload,
    args: {},
    context
  });
  if (error) throw error;
  return data as JsonRecord;
}

async function main() {
  const lowcode = await callHook(
    'dynamic_crud_normalize_lowcode_page',
    { schema: { pageType: 'edit' } },
    { action: 'create' }
  );
  assert.equal(lowcode.page_type, 'edit');

  const chat = await callHook(
    'dynamic_crud_normalize_chat_message',
    { content: 'hello' },
    { input: { messageType: 'file', attachmentIds: ['file-1'] } }
  );
  assert.equal(chat.message_type, 'file');
  assert.deepEqual(chat.attachment_ids, ['file-1']);

  const chatDelete = await callHook(
    'dynamic_crud_normalize_chat_message_update',
    { content: 'old' },
    { input: { delete: true } }
  );
  assert.equal(chatDelete.status, 'deleted');
  assert.equal(chatDelete.content, '');
  assert.ok(chatDelete.deleted_at);

  const notification = await callHook(
    'dynamic_crud_normalize_notification_message_update',
    {},
    { input: { archive: true } }
  );
  assert.ok(notification.read_at);
  assert.ok(notification.archived_at);

  const optionSource = await callHook(
    'dynamic_crud_normalize_option_source',
    { status: 'active' },
    {
      input: {
        sourceType: 'table',
        sourceConfig: { table: 'admin_roles', labelField: 'name', valueField: 'id' }
      }
    }
  );
  assert.equal(optionSource.source_type, 'table');
  assert.deepEqual(optionSource.source_config, {
    table: 'admin_roles',
    labelField: 'name',
    valueField: 'id'
  });

  const workflowModel = await callHook(
    'dynamic_crud_normalize_workflow_model',
    {},
    {
      action: 'create',
      input: {
        code: 'expense',
        name: 'Expense approval',
        documentType: 'expense',
        schema: {
          nodes: [{ id: 'start', type: 'start' }, { id: 'end', type: 'end' }],
          edges: [{ id: 'edge', source: 'start', target: 'end' }]
        }
      }
    }
  );
  assert.equal(workflowModel.document_type, 'expense');
  assert.equal((workflowModel.draft_schema as JsonRecord).code, 'expense');

  const workflowJob = await callHook(
    'dynamic_crud_normalize_workflow_job',
    { code: 'minute-job', name: 'Minute job', type: 'interval' },
    {
      action: 'create',
      input: {
        intervalSeconds: 60,
        triggerTaskId: 'workflow.demo',
        retryPolicy: { maxAttempts: 1 }
      }
    }
  );
  assert.equal(workflowJob.trigger_task_id, 'workflow.demo');
  assert.equal((workflowJob.payload as JsonRecord).intervalSeconds, 60);
  assert.deepEqual(workflowJob.retry_policy, { maxAttempts: 1 });

  console.log('Dynamic CRUD database hook smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
