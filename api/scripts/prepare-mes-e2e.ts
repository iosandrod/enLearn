import { createHash } from 'node:crypto';

import {
  createMesE2eDatabase,
  createMesE2eFixture,
  releaseMesE2eWorkOrder
} from './mes-e2e-fixture';

async function main() {
  const database = await createMesE2eDatabase();
  try {
    const fixture = await createMesE2eFixture(database);
    const workOrder = await releaseMesE2eWorkOrder(database, fixture);
    console.log(JSON.stringify({
      accountId: fixture.accountId,
      email: fixture.email,
      password: fixture.password,
      operationPlanId: fixture.operationPlanId,
      workOrderId: workOrder.workOrderId,
      workOrderNo: workOrder.workOrderNo,
      passwordFingerprint: createHash('sha256').update(fixture.password).digest('hex').slice(0, 12),
      isolation: 'dedicated persistent MES E2E account'
    }));
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
