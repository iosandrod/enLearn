import assert from 'node:assert/strict';
import { aiContextInternals } from './ai-context.service';

const sanitized = aiContextInternals.sanitizeValue({
  name: 'visible',
  password: 'do-not-send',
  nested: {
    authorization: 'Bearer secret',
    apiKey: 'secret',
    value: 'ok'
  },
  rows: Array.from({ length: 30 }, (_, index) => ({ index, token: `secret-${index}` }))
}) as Record<string, unknown>;

assert.equal(sanitized.name, 'visible');
assert.equal('password' in sanitized, false);
assert.deepEqual(sanitized.nested, { value: 'ok' });
assert.equal((sanitized.rows as unknown[]).length, 20);
assert.equal('token' in ((sanitized.rows as Record<string, unknown>[])[0] ?? {}), false);

const sample = aiContextInternals.sanitizeSampleValue({
  customerName: 'Ada Lovelace',
  orderNo: 'SO-2026-001',
  quantity: 12,
  approved: true,
  password: 'secret'
}) as Record<string, unknown>;
assert.equal(sample.customerName, '[redacted]');
assert.equal(sample.orderNo, '[redacted]');
assert.equal(sample.quantity, 12);
assert.equal(sample.approved, true);
assert.equal('password' in sample, false);

const summary = aiContextInternals.summarizePageRecord({
  id: 'page-1',
  code: 'orders',
  route: '/dashboard/orders',
  title: 'Orders',
  version: 7,
  schema: {
    dataSources: {
      orders: { key: 'orders', serviceName: 'admin', serviceMethod: 'listItems', password: 'hidden' }
    },
    blocks: [{
      id: 'orders-grid',
      kind: 'grid',
      schema: { grid: { columns: [{ field: 'number', title: 'Number' }] } }
    }],
    functions: [{ name: 'refreshOrders', script: 'async function main() {}' }]
  }
}) as Record<string, unknown>;

assert.equal(summary.code, 'orders');
assert.equal(summary.version, 7);
assert.equal(JSON.stringify(summary).includes('async function'), false);
assert.equal(JSON.stringify(summary).includes('hidden'), false);

assert.throws(
  () => aiContextInternals.validateClientPageHint(
    { id: 'page-other', version: 7 },
    { id: 'page-1', version: 7 }
  ),
  /does not match/
);

const bounded = aiContextInternals.enforceByteLimit({
  page: {
    id: 'page-1',
    code: 'orders',
    blocks: Array.from({ length: 30 }, (_, index) => ({
      id: `block-${index}`,
      title: 'x'.repeat(8_000)
    }))
  },
  route: { path: '/dashboard/orders' }
});
assert.ok(Buffer.byteLength(JSON.stringify(bounded), 'utf8') <= 64 * 1024);

console.log('AI context redaction tests passed');
