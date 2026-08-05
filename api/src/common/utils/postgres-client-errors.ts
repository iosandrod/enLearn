import { type ClientBase, type Pool } from 'pg';

const guardedClients = new WeakSet<ClientBase>();
const guardedPools = new WeakSet<Pool>();

export function guardPostgresClientErrorEvent<T extends ClientBase>(client: T): T {
  if (guardedClients.has(client)) return client;

  guardedClients.add(client);
  client.on('error', handlePostgresClientError);
  return client;
}

export function guardPostgresPoolClientErrorEvents<T extends Pool>(pool: T): T {
  if (guardedPools.has(pool)) return pool;

  guardedPools.add(pool);
  pool.on('acquire', guardPostgresClientErrorEvent);
  return pool;
}

function handlePostgresClientError() {
  // pg still rejects the active query. This listener prevents EventEmitter from
  // terminating Node while pg-pool has its idle-client listener detached.
}
