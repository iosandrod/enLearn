import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

const TRANSACTION_START = /^(?:\s*--[^\r\n]*(?:\r?\n|$))*\s*begin\s*;\s*/i;
const TRANSACTION_END = /\s*commit\s*;\s*$/i;

export function unwrapMigrationTransaction(sql: string) {
  if (!TRANSACTION_START.test(sql) || !TRANSACTION_END.test(sql)) {
    throw new Error('Planning migration must have a single outer BEGIN/COMMIT transaction.');
  }

  return sql
    .replace(TRANSACTION_START, '')
    .replace(TRANSACTION_END, '')
    .trim();
}

export async function assertTransactionActive(client: Client) {
  const setting = 'planning.transaction_probe';
  const marker = randomUUID();
  await client.query('savepoint planning_transaction_probe');
  await client.query('select set_config($1, $2, false)', [setting, marker]);
  await client.query('rollback to savepoint planning_transaction_probe');
  const { rows } = await client.query<{ marker: string | null }>(
    "select nullif(current_setting($1, true), '') as marker",
    [setting]
  );
  await client.query('release savepoint planning_transaction_probe');
  if (rows[0]?.marker === marker) {
    throw new Error('Planning verification transaction is not active.');
  }
}
