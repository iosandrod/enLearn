import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  MES_MANAGE_PERMISSION,
  MES_VIEW_PERMISSION,
  mesResources
} from './mes.resources';
import { MesService } from './mes.service';

type RpcError = { code?: string; message: string };
type RpcResult = { data: unknown; error: RpcError | null };
type Actor = { accountId: string; client: SupabaseClient; userId: string };

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const OPERATION_PLAN_ID = '00000000-0000-4000-8000-000000000003';
const OPERATION_ID = '00000000-0000-4000-8000-000000000004';
const COMPONENT_ID = '00000000-0000-4000-8000-000000000005';
const PRODUCTION_TRANSACTION_ID = '00000000-0000-4000-8000-000000000006';
const MATERIAL_TRANSACTION_ID = '00000000-0000-4000-8000-000000000007';

type TestableMesService = {
  execute(
    method: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ): Promise<unknown>;
  authorize(context: ServiceContext, manage: boolean): Promise<Actor>;
  throwDatabaseError(error: RpcError): never;
};

function createHarness(result: RpcResult = { data: { ok: true }, error: null }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return result;
    }
  } as unknown as SupabaseClient;
  const actor = { accountId: ACCOUNT_ID, client, userId: USER_ID };
  const service = new MesService() as unknown as TestableMesService;
  service.authorize = async () => actor;
  return {
    calls,
    service
  };
}

function context(requestId = 'web-command-1'): ServiceContext {
  return { accountId: ACCOUNT_ID, requestId, userId: USER_ID };
}

async function testResourceBoundary() {
  const resources = mesResources();
  assert.deepEqual(Object.keys(resources), [
    'mes_work_order',
    'mes_work_order_operation',
    'mes_work_order_component',
    'mes_production_transaction',
    'mes_material_transaction',
    'mes_work_order_runtime_view',
    'mes_work_order_operation_runtime_view',
    'mes_work_order_component_runtime_view',
    'mes_production_transaction_runtime_view',
    'mes_material_transaction_runtime_view'
  ]);
  for (const resource of Object.values(resources)) {
    assert.equal(resource.accountField, 'account_id');
    assert.deepEqual(resource.internalActions, ['create', 'update', 'delete', 'action']);
    assert.deepEqual(resource.permissions?.list, [MES_VIEW_PERMISSION, MES_MANAGE_PERMISSION]);
  }

  const { service } = createHarness();
  for (const method of ['createItem', 'updateItem', 'deleteItem', 'runAction']) {
    await assert.rejects(
      () => service.execute(method, { resource: 'mes_work_order' }, context()),
      ForbiddenException,
      `${method} must not bypass MES commands`
    );
  }
}

async function testReleaseCommand() {
  const { calls, service } = createHarness();
  const input = {
    operationPlanId: OPERATION_PLAN_ID,
    quantity: '0012.3400',
    workOrderNo: ' WO-100 ',
    deviceId: 'tablet-7',
    localSequence: 41,
    occurredAt: '2026-08-11T08:00:00+08:00'
  };
  assert.deepEqual(
    await service.execute('releaseWorkOrder', input, context('stable-command')),
    { ok: true }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'mes_release_work_order');
  assert.deepEqual(
    {
      ...calls[0].args,
      p_request_hash: '<hash>'
    },
    {
      p_account_id: ACCOUNT_ID,
      p_operationplan_id: OPERATION_PLAN_ID,
      p_command_id: calls[0].args.p_command_id,
      p_request_hash: '<hash>',
      p_user_id: USER_ID,
      p_work_order_no: 'WO-100',
      p_quantity: '12.34',
      p_device_id: 'tablet-7',
      p_local_sequence: 41,
      p_occurred_at: '2026-08-11T00:00:00.000Z'
    }
  );
  assert.match(String(calls[0].args.p_command_id), /^[0-9a-f-]{36}$/);
  assert.match(String(calls[0].args.p_request_hash), /^[0-9a-f]{64}$/);

  const replay = createHarness();
  await replay.service.execute('releaseWorkOrder', input, context('stable-command'));
  assert.equal(replay.calls[0].args.p_command_id, calls[0].args.p_command_id);
  assert.equal(replay.calls[0].args.p_request_hash, calls[0].args.p_request_hash);
}

async function testCommandMappings() {
  const start = createHarness();
  await start.service.execute('startOperation', {
    operationId: OPERATION_ID,
    expectedVersion: '4'
  }, context('start-1'));
  assert.equal(start.calls[0].name, 'mes_start_operation');
  assert.equal(start.calls[0].args.p_expected_version, 4);

  const production = createHarness();
  await production.service.execute('reportProduction', {
    operationId: OPERATION_ID,
    expectedVersion: 5,
    goodQuantity: '.5000',
    scrapQuantity: '0.2500',
    metadata: { shift: 'A' }
  }, context('report-1'));
  assert.equal(production.calls[0].name, 'mes_report_production');
  assert.equal(production.calls[0].args.p_good_quantity, '0.5');
  assert.equal(production.calls[0].args.p_scrap_quantity, '0.25');
  assert.deepEqual(production.calls[0].args.p_metadata, { shift: 'A' });

  const material = createHarness();
  await material.service.execute('issueMaterial', {
    componentId: COMPONENT_ID,
    expectedOperationVersion: 6,
    quantity: '2.000',
    lotNo: ' LOT-7 ',
    serialNo: ' SN-9 '
  }, context('issue-1'));
  assert.equal(material.calls[0].name, 'mes_issue_material');
  assert.equal(material.calls[0].args.p_expected_operation_version, 6);
  assert.equal(material.calls[0].args.p_quantity, '2');
  assert.equal(material.calls[0].args.p_lot_no, 'LOT-7');
  assert.equal(material.calls[0].args.p_serial_no, 'SN-9');

  const complete = createHarness();
  await complete.service.execute('completeOperation', {
    operationId: OPERATION_ID,
    expectedVersion: 7
  }, context('complete-1'));
  assert.equal(complete.calls[0].name, 'mes_complete_operation');
  assert.equal(complete.calls[0].args.p_expected_version, 7);

  const pause = createHarness();
  await pause.service.execute('pauseOperation', {
    operationId: OPERATION_ID,
    expectedVersion: 8,
    reasonCode: ' BREAKDOWN '
  }, context('pause-1'));
  assert.equal(pause.calls[0].name, 'mes_pause_operation');
  assert.equal(pause.calls[0].args.p_reason_code, 'BREAKDOWN');

  const resume = createHarness();
  await resume.service.execute('resumeOperation', {
    operationId: OPERATION_ID,
    expectedVersion: 9
  }, context('resume-1'));
  assert.equal(resume.calls[0].name, 'mes_resume_operation');
  assert.equal(resume.calls[0].args.p_reason_code, null);

  const materialReturn = createHarness();
  await materialReturn.service.execute('returnMaterial', {
    componentId: COMPONENT_ID,
    expectedOperationVersion: 10,
    quantity: '1.5000',
    lotNo: ' LOT-7 ',
    reasonCode: ' EXCESS '
  }, context('return-1'));
  assert.equal(materialReturn.calls[0].name, 'mes_return_material');
  assert.equal(materialReturn.calls[0].args.p_quantity, '1.5');
  assert.equal(materialReturn.calls[0].args.p_reason_code, 'EXCESS');

  const reverseProduction = createHarness();
  await reverseProduction.service.execute('reverseProduction', {
    transactionId: PRODUCTION_TRANSACTION_ID,
    expectedOperationVersion: 11,
    reasonCode: ' WRONG-QTY '
  }, context('reverse-production-1'));
  assert.equal(reverseProduction.calls[0].name, 'mes_reverse_production');
  assert.equal(reverseProduction.calls[0].args.p_transaction_id, PRODUCTION_TRANSACTION_ID);
  assert.equal(reverseProduction.calls[0].args.p_reason_code, 'WRONG-QTY');

  const reverseMaterial = createHarness();
  await reverseMaterial.service.execute('reverseTransaction', {
    ledger: 'material',
    transactionId: MATERIAL_TRANSACTION_ID,
    expectedOperationVersion: 12,
    reasonCode: ' WRONG-LOT '
  }, context('reverse-material-1'));
  assert.equal(reverseMaterial.calls[0].name, 'mes_reverse_material');
  assert.equal(reverseMaterial.calls[0].args.p_transaction_id, MATERIAL_TRANSACTION_ID);
  assert.equal(reverseMaterial.calls[0].args.p_reason_code, 'WRONG-LOT');
}

async function testValidation() {
  const { service } = createHarness();
  await assert.rejects(
    () => service.execute('startOperation', {
      operationId: OPERATION_ID,
      expectedVersion: 0
    }, context('')),
    /commandId or X-Request-Id/
  );
  await assert.rejects(
    () => service.execute('startOperation', {
      operationId: OPERATION_ID,
      expectedVersion: 0,
      commandId: 'body-command'
    }, context('header-command')),
    /must match X-Request-Id/
  );
  await assert.rejects(
    () => service.execute('reportProduction', {
      operationId: OPERATION_ID,
      expectedVersion: 0,
      goodQuantity: 0,
      scrapQuantity: 0
    }, context()),
    /cannot both be zero/
  );
  await assert.rejects(
    () => service.execute('issueMaterial', {
      componentId: COMPONENT_ID,
      expectedVersion: 0,
      quantity: 1,
      deviceId: 'scanner-1'
    }, context()),
    /must be supplied together/
  );
  await assert.rejects(
    () => service.execute('startOperation', {
      operationId: 'not-a-uuid',
      expectedVersion: 0
    }, context()),
    /must be a UUID/
  );
  await assert.rejects(
    () => service.execute('startOperation', {
      operationId: OPERATION_ID,
      expectedVersion: -1
    }, context()),
    /non-negative safe integer/
  );
  await assert.rejects(
    () => service.execute('issueMaterial', {
      componentId: COMPONENT_ID,
      expectedVersion: 0,
      quantity: '1.123456789'
    }, context()),
    /exceeds numeric\(30,8\)/
  );
  await assert.rejects(
    () => service.execute('pauseOperation', {
      operationId: OPERATION_ID,
      expectedVersion: 0,
      reasonCode: ''
    }, context()),
    /reasonCode is required/
  );
  await assert.rejects(
    () => service.execute('returnMaterial', {
      componentId: COMPONENT_ID,
      expectedOperationVersion: 0,
      quantity: 1
    }, context()),
    /reasonCode is required/
  );
  await assert.rejects(
    () => service.execute('reverseTransaction', {
      ledger: 'inventory',
      transactionId: MATERIAL_TRANSACTION_ID,
      expectedOperationVersion: 0,
      reasonCode: 'test'
    }, context()),
    /ledger must be production or material/
  );
}

async function testDatabaseErrorMapping() {
  const { service } = createHarness();
  for (const code of ['23505', '40001', '55P03']) {
    assert.throws(
      () => service.throwDatabaseError({ code, message: 'conflict' }),
      ConflictException
    );
  }
  assert.throws(
    () => service.throwDatabaseError({ code: 'P0002', message: 'missing' }),
    NotFoundException
  );
  assert.throws(
    () => service.throwDatabaseError({ code: '42501', message: 'forbidden' }),
    ForbiddenException
  );
  assert.throws(
    () => service.throwDatabaseError({ code: '23514', message: 'invalid' }),
    BadRequestException
  );
}

async function main() {
  await testResourceBoundary();
  await testReleaseCommand();
  await testCommandMappings();
  await testValidation();
  await testDatabaseErrorMapping();
  console.log('MES service tests passed');
}

void main();
