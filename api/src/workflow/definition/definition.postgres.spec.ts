import { strict as assert } from 'node:assert';
import type { QueryResult, QueryResultRow } from 'pg';
import type { DatabaseService } from '../common/database.service';
import { DefinitionService } from './definition.service';

async function main() {
  const database = new ConcurrentInsertDatabase();
  const service = new DefinitionService(database as unknown as DatabaseService);
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
  assert.match(database.lastInsertSql, /on conflict \(tenant_id, code\)/i);
  assert.doesNotMatch(database.lastInsertSql, /select \* from public\.wf_model where tenant_id/i);

  await assert.rejects(
    () => service.saveModel(input, actor, '00000000-0000-0000-0000-000000000099'),
    /Workflow model not found/
  );

  console.log('workflow-api PostgreSQL definition upsert tests passed');
}

class ConcurrentInsertDatabase {
  readonly isConfigured = true;
  private row?: WorkflowModelRow;
  lastInsertSql = '';

  async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    this.lastInsertSql = text;
    if (!/insert into public\.wf_model/i.test(text)) {
      throw new Error(`Unexpected query: ${text}`);
    }

    const requestedId = values[11] as string | null;
    if (requestedId && this.row?.id !== requestedId) return result<T>([]);

    const now = new Date(String(values[10]));
    if (!this.row) {
      this.row = {
        id: String(values[0]),
        tenant_id: String(values[1]),
        code: String(values[2]),
        name: String(values[3]),
        document_type: values[4] ? String(values[4]) : null,
        status: 'draft',
        current_version: 0,
        draft_schema: JSON.parse(String(values[7])) as Record<string, unknown>,
        created_by: values[8] ? String(values[8]) : null,
        updated_by: values[9] ? String(values[9]) : null,
        created_at: now,
        updated_at: now
      };
    } else {
      this.row = {
        ...this.row,
        name: String(values[3]),
        document_type: values[4] ? String(values[4]) : null,
        draft_schema: JSON.parse(String(values[7])) as Record<string, unknown>,
        updated_by: values[9] ? String(values[9]) : null,
        updated_at: now
      };
    }
    return result<T>([this.row as unknown as T]);
  }
}

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'INSERT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  };
}

type WorkflowModelRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  document_type: string | null;
  status: 'draft' | 'published' | 'disabled' | 'archived';
  current_version: number;
  draft_schema: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
};

void main();
