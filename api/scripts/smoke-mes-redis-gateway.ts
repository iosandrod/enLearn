import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

import {
  createMesE2eDatabase,
  createMesE2eFixture,
  type MesE2eFixture
} from './mes-e2e-fixture';

type JsonRecord = Record<string, unknown>;

const API_URL = (process.env.MES_GATEWAY_URL ?? 'http://127.0.0.1:3150').replace(/\/$/, '');

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as unknown : {};
  } catch {
    return { message: text };
  }
}

function responseMessage(payload: unknown) {
  if (!isRecord(payload)) return String(payload ?? '');
  return String(payload.message ?? payload.error ?? '');
}

function responseData(payload: unknown) {
  return isRecord(payload) && 'data' in payload ? payload.data : payload;
}

async function waitForGateway() {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${API_URL}/api/auth/account-options?login=${encodeURIComponent('mes-e2e-validation@example.test')}`
      );
      if (response.ok) return;
      lastError = new Error(`Gateway returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${API_URL}.`);
}

async function signIn(fixture: MesE2eFixture) {
  const response = await fetch(`${API_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: fixture.email,
      password: fixture.password,
      accountId: fixture.accountId,
      setDefault: false
    })
  });
  const payload = await readJson(response);
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.ok(isRecord(payload));
  const session = isRecord(payload.session) ? payload.session : {};
  const token = String(session.access_token ?? '');
  assert.ok(token, 'MES E2E sign-in must return an access token.');
  assert.ok(Array.isArray(payload.permissions));
  assert.ok(payload.permissions.includes('mes.execution.view'));
  assert.ok(payload.permissions.includes('mes.execution.manage'));
  return token;
}

async function invoke(
  fixture: MesE2eFixture,
  token: string,
  serviceMethod: string,
  postData: JsonRecord,
  requestId = randomUUID()
) {
  const response = await fetch(`${API_URL}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-account-id': fixture.accountId,
      'x-request-id': requestId
    },
    body: JSON.stringify({ serviceName: 'mes', serviceMethod, postData })
  });
  const payload = await readJson(response);
  return { data: responseData(payload), payload, response };
}

async function expectError(
  operation: () => Promise<{ payload: unknown; response: Response }>,
  status: number,
  message: RegExp
) {
  const result = await operation();
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  assert.match(responseMessage(result.payload), message);
}

function record(value: unknown, label: string) {
  assert.ok(isRecord(value), `${label} must be an object.`);
  return value;
}

function numberField(value: unknown, label: string) {
  const parsed = Number(value);
  assert.ok(Number.isFinite(parsed), `${label} must be numeric.`);
  return parsed;
}

async function verifyFacts(
  database: Client,
  fixture: MesE2eFixture,
  workOrderId: string,
  deviceId: string,
  reportTransactionId: string,
  issueTransactionId: string,
  returnTransactionId: string
) {
  const result = await database.query<{
    command_count: string;
    completed_request_count: string;
    event_count: string;
    issue_reversal_count: string;
    material_transaction_count: string;
    production_transaction_count: string;
    report_reversal_count: string;
    return_reversal_count: string;
  }>(`
    select
      (select count(*)::text
       from public.mes_command_log
       where account_id = $1 and device_id = $3) as command_count,
      (select count(*)::text
       from public.mes_outbox_event
       where account_id = $1 and payload->>'workOrderId' = $2) as event_count,
      (select count(*)::text
       from public.mes_production_transaction
       where account_id = $1 and work_order_id = $2::uuid) as production_transaction_count,
      (select count(*)::text
       from public.mes_material_transaction
       where account_id = $1 and work_order_id = $2::uuid) as material_transaction_count,
      (select count(*)::text
       from public.mes_production_transaction
       where account_id = $1 and original_transaction_id = $4::uuid) as report_reversal_count,
      (select count(*)::text
       from public.mes_material_transaction
       where account_id = $1 and original_transaction_id = $5::uuid) as issue_reversal_count,
      (select count(*)::text
       from public.mes_material_transaction
       where account_id = $1 and original_transaction_id = $6::uuid) as return_reversal_count,
      (select count(*)::text
       from public.service_request_idempotency
       where account_id = $1 and user_id = $7 and status = 'completed'
         and response->>'serviceName' is null) as completed_request_count
  `, [
    fixture.accountId,
    workOrderId,
    deviceId,
    reportTransactionId,
    issueTransactionId,
    returnTransactionId,
    fixture.userId
  ]);
  const counts = result.rows[0];
  assert.equal(counts.command_count, '11');
  assert.equal(counts.event_count, '11');
  assert.equal(counts.production_transaction_count, '2');
  assert.equal(counts.material_transaction_count, '4');
  assert.equal(counts.report_reversal_count, '1');
  assert.equal(counts.issue_reversal_count, '1');
  assert.equal(counts.return_reversal_count, '1');

  const aggregate = await database.query<{
    first_good: string;
    first_scrap: string;
    first_status: string;
    issued: string;
    returned: string;
    second_status: string;
  }>(`
    select
      first_operation.status as first_status,
      first_operation.good_quantity::text as first_good,
      first_operation.scrap_quantity::text as first_scrap,
      second_operation.status as second_status,
      component.issued_quantity::text as issued,
      component.returned_quantity::text as returned
    from public.mes_work_order_operation first_operation
    join public.mes_work_order_operation second_operation
      on second_operation.account_id = first_operation.account_id
     and second_operation.work_order_id = first_operation.work_order_id
     and second_operation.sequence_no = 2
    join public.mes_work_order_component component
      on component.account_id = first_operation.account_id
     and component.operation_id = first_operation.id
     and component.requirement_type = 'consume'
    where first_operation.account_id = $1
      and first_operation.work_order_id = $2::uuid
      and first_operation.sequence_no = 1
  `, [fixture.accountId, workOrderId]);
  assert.equal(aggregate.rows[0].first_status, 'ready');
  assert.equal(aggregate.rows[0].second_status, 'pending');
  assert.equal(Number(aggregate.rows[0].first_good), 0);
  assert.equal(Number(aggregate.rows[0].first_scrap), 0);
  assert.equal(Number(aggregate.rows[0].issued), 0);
  assert.equal(Number(aggregate.rows[0].returned), 0);
}

async function main() {
  const database = await createMesE2eDatabase();
  try {
    const fixture = await createMesE2eFixture(database);
    await waitForGateway();
    const token = await signIn(fixture);
    const deviceId = `mes-gateway-${fixture.runId}`;
    let sequence = 0;
    const command = async (
      serviceMethod: string,
      postData: JsonRecord,
      requestId = randomUUID()
    ) => invoke(fixture, token, serviceMethod, {
      ...postData,
      commandId: requestId,
      deviceId,
      localSequence: ++sequence
    }, requestId);

    const capabilityResult = await invoke(fixture, token, 'getCapabilities', {});
    assert.equal(capabilityResult.response.status, 200, JSON.stringify(capabilityResult.payload));
    const capabilities = record(capabilityResult.data, 'capabilities');
    assert.equal(capabilities.canManage, true);

    const releaseRequestId = randomUUID();
    const releasePostData = {
      operationPlanId: fixture.operationPlanId,
      quantity: 10,
      commandId: releaseRequestId,
      deviceId,
      localSequence: ++sequence
    };
    const releaseResult = await invoke(
      fixture,
      token,
      'releaseWorkOrder',
      releasePostData,
      releaseRequestId
    );
    assert.equal(releaseResult.response.status, 200, JSON.stringify(releaseResult.payload));
    const release = record(releaseResult.data, 'release result');
    const workOrder = record(release.workOrder, 'released work order');
    const workOrderId = String(workOrder.id);
    assert.equal(Number(release.operationCount), 2);

    const releaseReplay = await invoke(
      fixture,
      token,
      'releaseWorkOrder',
      releasePostData,
      releaseRequestId
    );
    assert.equal(releaseReplay.response.status, 200, JSON.stringify(releaseReplay.payload));
    assert.equal(String(record(releaseReplay.data, 'release replay').workOrder
      && record(record(releaseReplay.data, 'release replay').workOrder, 'replayed work order').id), workOrderId);
    await expectError(
      () => invoke(fixture, token, 'releaseWorkOrder', {
        ...releasePostData,
        quantity: 9
      }, releaseRequestId),
      409,
      /request id was reused with different write data/i
    );

    const detailResult = await invoke(fixture, token, 'getWorkOrderDetail', { workOrderId });
    assert.equal(detailResult.response.status, 200, JSON.stringify(detailResult.payload));
    const detail = record(detailResult.data, 'work-order detail');
    assert.ok(Array.isArray(detail.operations) && detail.operations.length === 2);
    assert.ok(Array.isArray(detail.components) && detail.components.length === 1);
    const firstOperation = record(detail.operations[0], 'first operation');
    const component = record(detail.components[0], 'component');
    const operationId = String(firstOperation.id);
    const componentId = String(component.id);

    const startResult = await command('startOperation', {
      operationId,
      expectedVersion: numberField(firstOperation.row_version, 'initial operation version')
    });
    assert.equal(startResult.response.status, 200, JSON.stringify(startResult.payload));
    let operation = record(record(startResult.data, 'start result').operation, 'started operation');
    assert.equal(operation.status, 'in_progress');

    const pauseRequestId = randomUUID();
    const pausePostData = {
      operationId,
      expectedVersion: numberField(operation.row_version, 'started operation version'),
      reasonCode: 'planned-maintenance',
      commandId: pauseRequestId,
      deviceId,
      localSequence: ++sequence
    };
    const pauseResult = await invoke(
      fixture,
      token,
      'pauseOperation',
      pausePostData,
      pauseRequestId
    );
    assert.equal(pauseResult.response.status, 200, JSON.stringify(pauseResult.payload));
    operation = record(record(pauseResult.data, 'pause result').operation, 'paused operation');
    assert.equal(operation.status, 'paused');
    const pauseReplay = await invoke(
      fixture,
      token,
      'pauseOperation',
      pausePostData,
      pauseRequestId
    );
    assert.equal(pauseReplay.response.status, 200, JSON.stringify(pauseReplay.payload));
    assert.equal(record(record(pauseReplay.data, 'pause replay').operation, 'replayed pause').status, 'paused');
    await expectError(
      () => invoke(fixture, token, 'pauseOperation', {
        ...pausePostData,
        reasonCode: 'different-reason'
      }, pauseRequestId),
      409,
      /request id was reused with different write data/i
    );

    const resumeResult = await command('resumeOperation', {
      operationId,
      expectedVersion: numberField(operation.row_version, 'paused operation version'),
      reasonCode: 'maintenance-complete'
    });
    assert.equal(resumeResult.response.status, 200, JSON.stringify(resumeResult.payload));
    operation = record(record(resumeResult.data, 'resume result').operation, 'resumed operation');
    assert.equal(operation.status, 'in_progress');

    const issueResult = await command('issueMaterial', {
      componentId,
      expectedOperationVersion: numberField(operation.row_version, 'resumed operation version'),
      quantity: 20,
      lotNo: `LOT-${fixture.runId}`,
      metadata: { source: 'redis-gateway-e2e' }
    });
    assert.equal(issueResult.response.status, 200, JSON.stringify(issueResult.payload));
    const issue = record(issueResult.data, 'issue result');
    const issueTransactionId = String(record(issue.transaction, 'issue transaction').id);
    operation = record(issue.operation, 'operation after issue');

    await expectError(
      () => command('returnMaterial', {
        componentId,
        expectedOperationVersion: numberField(operation.row_version, 'issued operation version'),
        quantity: 21,
        lotNo: `LOT-${fixture.runId}`,
        reasonCode: 'over-return-check'
      }),
      400,
      /exceeds the net issued quantity/i
    );
    const returnResult = await command('returnMaterial', {
      componentId,
      expectedOperationVersion: numberField(operation.row_version, 'issued operation version'),
      quantity: 4,
      lotNo: `LOT-${fixture.runId}`,
      reasonCode: 'excess-material'
    });
    assert.equal(returnResult.response.status, 200, JSON.stringify(returnResult.payload));
    const materialReturn = record(returnResult.data, 'return result');
    const returnTransactionId = String(record(materialReturn.transaction, 'return transaction').id);
    operation = record(materialReturn.operation, 'operation after return');

    const reportResult = await command('reportProduction', {
      operationId,
      expectedVersion: numberField(operation.row_version, 'returned operation version'),
      goodQuantity: 6,
      scrapQuantity: 1,
      metadata: { shift: 'A', source: 'redis-gateway-e2e' }
    });
    assert.equal(reportResult.response.status, 200, JSON.stringify(reportResult.payload));
    const report = record(reportResult.data, 'report result');
    const reportTransactionId = String(record(report.transaction, 'production transaction').id);
    operation = record(report.operation, 'operation after report');

    const completeResult = await command('completeOperation', {
      operationId,
      expectedVersion: numberField(operation.row_version, 'reported operation version')
    });
    assert.equal(completeResult.response.status, 200, JSON.stringify(completeResult.payload));
    const complete = record(completeResult.data, 'complete result');
    operation = record(complete.operation, 'completed operation');
    assert.equal(operation.status, 'completed');
    assert.equal(record(complete.nextOperation, 'next operation').status, 'ready');

    const reverseReportResult = await command('reverseProduction', {
      transactionId: reportTransactionId,
      expectedOperationVersion: numberField(operation.row_version, 'completed operation version'),
      reasonCode: 'incorrect-production-report'
    });
    assert.equal(
      reverseReportResult.response.status,
      200,
      JSON.stringify(reverseReportResult.payload)
    );
    operation = record(
      record(reverseReportResult.data, 'production reversal').operation,
      'operation after production reversal'
    );
    assert.equal(operation.status, 'ready');

    await expectError(
      () => command('reverseMaterial', {
        transactionId: issueTransactionId,
        expectedOperationVersion: numberField(operation.row_version, 'production reversal version'),
        reasonCode: 'reverse-issue-before-return'
      }),
      400,
      /return transactions must be compensated before reversing/i
    );
    const reverseReturnResult = await command('reverseMaterial', {
      transactionId: returnTransactionId,
      expectedOperationVersion: numberField(operation.row_version, 'production reversal version'),
      reasonCode: 'return-entered-in-error'
    });
    assert.equal(reverseReturnResult.response.status, 200, JSON.stringify(reverseReturnResult.payload));
    operation = record(
      record(reverseReturnResult.data, 'return reversal').operation,
      'operation after return reversal'
    );

    const reverseIssueResult = await command('reverseMaterial', {
      transactionId: issueTransactionId,
      expectedOperationVersion: numberField(operation.row_version, 'return reversal version'),
      reasonCode: 'wrong-material-lot'
    });
    assert.equal(reverseIssueResult.response.status, 200, JSON.stringify(reverseIssueResult.payload));
    operation = record(
      record(reverseIssueResult.data, 'issue reversal').operation,
      'operation after issue reversal'
    );
    await expectError(
      () => command('reverseMaterial', {
        transactionId: issueTransactionId,
        expectedOperationVersion: numberField(operation.row_version, 'issue reversal version'),
        reasonCode: 'duplicate-reversal'
      }),
      409,
      /already been reversed/i
    );

    await verifyFacts(
      database,
      fixture,
      workOrderId,
      deviceId,
      reportTransactionId,
      issueTransactionId,
      returnTransactionId
    );

    console.log(JSON.stringify({
      pattern: 'service.mes.execute',
      gatewayUrl: API_URL,
      workOrderId,
      commandCount: 11,
      outboxEventCount: 11,
      compensationOrderVerified: true,
      idempotentReplayVerified: true,
      requestConflictVerified: true,
      mesGatewayWriteVerified: true,
      isolation: 'dedicated persistent MES E2E account'
    }));
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
