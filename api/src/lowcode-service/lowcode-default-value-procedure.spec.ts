import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LowCodeService } from './lowcode.service';

type RpcResult = {
  data: unknown;
  error: null | { code?: string; message: string };
};

class LowCodeProcedureServiceHarness extends LowCodeService {
  constructor(private readonly rpcClient: SupabaseClient) {
    super();
  }

  protected override async getDefaultValueProcedureClient() {
    return this.rpcClient;
  }
}

function createHarness(results: RpcResult[]) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return results.shift() ?? { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { calls, service: new LowCodeProcedureServiceHarness(client) };
}

async function main() {
  const { calls, service } = createHarness([
    { data: [{ label: 'Example (text)', value: 'public.example' }], error: null },
    { data: 'AUTO-001', error: null },
  ]);

  assert.deepEqual(
    await service.execute('listDefaultValueProcedures', {}, {}),
    [{ label: 'Example (text)', value: 'public.example' }],
  );
  assert.equal(
    await service.execute(
      'executeDefaultValueProcedure',
      {
        procedure: 'public.example',
        blockId: 'order-form',
        field: 'doc_no',
        values: { doc_type_code: 'STD-SO' },
      },
      {
        accountId: '00000000-0000-4000-8000-000000000001',
        accountCode: '001',
      },
    ),
    'AUTO-001',
  );
  assert.deepEqual(calls, [
    {
      name: 'read_lowcode_default_value_procedure',
      args: { p_action: 'list', p_procedure: null, p_context: {} },
    },
    {
      name: 'read_lowcode_default_value_procedure',
      args: {
        p_action: 'execute',
        p_procedure: 'public.example',
        p_context: {
          accountId: '00000000-0000-4000-8000-000000000001',
          accountCode: '001',
          blockId: 'order-form',
          field: 'doc_no',
          values: { doc_type_code: 'STD-SO' },
        },
      },
    },
  ]);

  await assert.rejects(
    () => service.execute('executeDefaultValueProcedure', {}, {}),
    /procedure is required/,
  );

  console.log('low-code default-value procedure service tests passed');
}

void main();
