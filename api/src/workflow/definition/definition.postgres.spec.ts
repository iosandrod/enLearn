import { strict as assert } from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import { DefinitionService } from './definition.service';

async function main() {
  const database = new ConcurrentUpsertSupabase();
  const service = new DefinitionService({
    isConfigured: true,
    client: database.client
  } as WorkflowSupabaseService);
  const actor = {
    tenantId: 'default',
    userId: '00000000-0000-0000-0000-000000000001'
  };
  const input = {
    code: 'approval_test',
    name: 'Approval test',
    documentType: 'approval',
    schema: {
      schemaVersion: 1,
      code: 'approval_test',
      name: 'Approval test',
      nodes: [
        { id: 'start', type: 'start', name: 'Start' },
        { id: 'end', type: 'end', name: 'End' }
      ],
      edges: [{ id: 'edge', source: 'start', target: 'end' }]
    }
  };

  const first = await service.saveModel(input, actor);
  const second = await service.saveModel(input, actor);
  assert.equal(first.id, second.id);
  assert.deepEqual(database.actions.slice(0, 2), ['save_model', 'save_model']);

  await assert.rejects(
    () => service.saveModel(input, actor, '00000000-0000-0000-0000-000000000099'),
    /Workflow model not found/
  );

  console.log('workflow-api Supabase definition upsert tests passed');
}

class ConcurrentUpsertSupabase {
  private row?: Record<string, unknown>;
  readonly actions: string[] = [];

  readonly client = {
    rpc: async (functionName: string, args: { p_action: string; p_payload: Record<string, unknown> }) => {
      assert.equal(functionName, 'workflow_definition_command');
      assert.equal(args.p_action, 'save_model');
      this.actions.push(args.p_action);
      const payload = args.p_payload;
      const requestedId = String(payload.model_id ?? '');
      if (requestedId && requestedId !== this.row?.id) {
        return { data: null, error: { code: 'P0002', message: 'Workflow model not found.' } };
      }
      const now = new Date().toISOString();
      this.row = {
        id: this.row?.id ?? '00000000-0000-4000-8000-000000000010',
        account_id: payload.account_id,
        code: payload.code,
        name: payload.name,
        document_type: payload.document_type,
        draft_schema: payload.draft_schema,
        status: this.row?.status ?? 'draft',
        current_version: this.row?.current_version ?? 0,
        created_by: payload.user_id,
        updated_by: payload.user_id,
        created_at: this.row?.created_at ?? now,
        updated_at: now
      };
      return { data: this.row, error: null };
    }
  } as unknown as SupabaseClient;
}

void main();
