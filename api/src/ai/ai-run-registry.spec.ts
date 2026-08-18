import assert from 'node:assert/strict';
import { AiRunRegistryService, readAiEventSequence } from './ai-run-registry.service';

const registry = new AiRunRegistryService();
const first = registry.createOrGet({
  requestId: 'request-1',
  accountId: 'account-1',
  userId: 'user-1',
  sessionId: 'session-1'
});
assert.equal(first.created, true);
const duplicate = registry.createOrGet({
  requestId: 'request-1',
  accountId: 'account-1',
  userId: 'user-1',
  sessionId: 'session-1'
});
assert.equal(duplicate.created, false);
assert.equal(duplicate.run.id, first.run.id);

const discarded = registry.createOrGet({
  requestId: 'request-discard',
  accountId: 'account-1',
  userId: 'user-1',
  sessionId: 'session-discard'
});
registry.discard(discarded.run.id);
assert.throws(() => registry.get(discarded.run.id), /not found/);

registry.emit(first.run.id, 'run.created', { status: 'running' });
registry.emit(first.run.id, 'assistant.delta', { delta: 'hello' });
const recovered: string[] = [];
const unsubscribe = registry.subscribe(first.run.id, 1, (event) => recovered.push(event.type));
assert.deepEqual(recovered, ['assistant.delta']);
unsubscribe();
assert.equal(readAiEventSequence(`${first.run.id}:19`), 19);

registry.cancel(first.run.id);
assert.equal(first.run.status, 'cancelled');

const rateLimited = new AiRunRegistryService();
for (let index = 0; index < 12; index += 1) {
  const entry = rateLimited.createOrGet({
    requestId: `request-${index}`,
    accountId: 'account-rate',
    userId: 'user-rate',
    sessionId: `session-${index}`
  });
  rateLimited.finish(entry.run.id, 'completed');
}
assert.throws(
  () => rateLimited.createOrGet({
    requestId: 'request-over-limit',
    accountId: 'account-rate',
    userId: 'user-rate',
    sessionId: 'session-over-limit'
  }),
  /per minute/
);

console.log('AI run registry tests passed');
