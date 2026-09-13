import assert from 'node:assert/strict';
import { parseRegisteredCommandFunction } from './registered-command.runtime';

const handler = parseRegisteredCommandFunction(`async function ({ payload }) {
  return { bound: typeof this.execute === 'function', value: payload.value };
}`);
const service = { execute: () => undefined };
void (async () => {
  const result = await handler.call(service, {
    payload: { value: 7 },
    context: {},
    service,
    command: { id: '1', serviceName: 'test', commandCode: 'echo', version: 1 }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { bound: true, value: 7 });

  assert.throws(
    () => parseRegisteredCommandFunction('() => process.env.SECRET'),
    /forbidden runtime construct/
  );
  console.log('registered command parser tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
