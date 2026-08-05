import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import type { ClientBase, Pool } from 'pg';
import {
  guardPostgresClientErrorEvent,
  guardPostgresPoolClientErrorEvents
} from './postgres-client-errors';

function main() {
  const pool = new EventEmitter() as Pool;
  const client = new EventEmitter() as ClientBase;
  const pgPoolIdleListener = () => undefined;
  client.on('error', pgPoolIdleListener);

  guardPostgresPoolClientErrorEvents(pool);
  guardPostgresPoolClientErrorEvents(pool);
  assert.equal(pool.listenerCount('acquire'), 1);

  pool.emit('acquire', client);
  client.removeListener('error', pgPoolIdleListener);
  pool.emit('acquire', client);
  assert.equal(client.listenerCount('error'), 1);
  assert.doesNotThrow(() => client.emit('error', new Error('Connection terminated unexpectedly')));

  const directClient = new EventEmitter() as ClientBase;
  guardPostgresClientErrorEvent(directClient);
  guardPostgresClientErrorEvent(directClient);
  assert.equal(directClient.listenerCount('error'), 1);
  assert.doesNotThrow(() => directClient.emit('error', Object.assign(new Error('read ECONNRESET'), {
    code: 'ECONNRESET'
  })));

  console.log('PostgreSQL client error guard tests passed');
}

main();
