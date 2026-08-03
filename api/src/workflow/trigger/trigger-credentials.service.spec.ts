import { strict as assert } from 'node:assert';
import {
  TriggerCredentialsService,
  type TriggerCredentials
} from './trigger-credentials.service';
import {
  decryptPersonalAccessToken,
  encryptToken,
  hashToken
} from './trigger-credentials.crypto';

async function main() {
  await testCacheHitAndForcedRefresh();
  await testConcurrentRefreshCoalescing();
  await testStaleCacheFallback();
  testPersonalAccessTokenCrypto();
  console.log('workflow-api Trigger.dev credential cache tests passed');
}

function testPersonalAccessTokenCrypto() {
  const key = '12345678901234567890123456789012';
  const token = 'tr_pat_123456789abcdefghijkmnopqrstuvwxyz1234';
  const encryptedToken = encryptToken(token, key);
  assert.equal(
    decryptPersonalAccessToken(
      { id: 'pat_test', name: 'test', encryptedToken, hashedToken: hashToken(token) },
      key
    ),
    token
  );

  assert.throws(
    () =>
      decryptPersonalAccessToken(
        { id: 'pat_test', name: 'test', encryptedToken, hashedToken: hashToken(`${token}x`) },
        key
      ),
    /failed validation/
  );
  assert.throws(
    () =>
      decryptPersonalAccessToken(
        { id: 'pat_test', name: 'test', encryptedToken, hashedToken: hashToken(token) },
        'abcdefghijklmnopqrstuvwxyz123456'
      )
  );
}

async function testCacheHitAndForcedRefresh() {
  let now = 1_000;
  let loads = 0;
  const service = new TriggerCredentialsService({
    cacheTtlMs: 100,
    loadCredentials: async () => credential(++loads),
    now: () => now
  });

  const first = await service.getCredentials();
  const cached = await service.getCredentials();
  assert.strictEqual(cached, first);
  assert.equal(loads, 1);

  const forced = await service.getCredentials(true);
  assert.notStrictEqual(forced, first);
  assert.equal(loads, 2);

  now += 101;
  const expired = await service.getCredentials();
  assert.notStrictEqual(expired, forced);
  assert.equal(loads, 3);
  await service.onModuleDestroy();
}

async function testConcurrentRefreshCoalescing() {
  let loads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new TriggerCredentialsService({
    loadCredentials: async () => {
      loads += 1;
      await gate;
      return credential(loads);
    }
  });

  const first = service.getCredentials();
  const second = service.getCredentials();
  release();
  assert.strictEqual(await first, await second);
  assert.equal(loads, 1);
  await service.onModuleDestroy();
}

async function testStaleCacheFallback() {
  let now = 2_000;
  let fail = false;
  const service = new TriggerCredentialsService({
    cacheTtlMs: 50,
    loadCredentials: async () => {
      if (fail) throw new Error('database unavailable');
      return credential(1);
    },
    now: () => now
  });

  const first = await service.getCredentials();
  fail = true;
  now += 51;
  assert.strictEqual(await service.getCredentials(), first);

  service.invalidate();
  await assert.rejects(() => service.getCredentials(true), /database unavailable/);
  await service.onModuleDestroy();
}

function credential(sequence: number): TriggerCredentials {
  return {
    accessToken: `tr_pat_test_${sequence}`,
    adminEmail: 'admin@example.test',
    apiUrl: 'http://localhost:3030',
    environment: 'dev',
    environmentId: `env_${sequence}`,
    loadedAt: new Date(sequence).toISOString(),
    projectName: 'enlearn-workflow-local',
    projectRef: `proj_test_${sequence}`,
    secretKey: `tr_dev_test_${sequence}`,
    selection: 'project-name',
    source: 'trigger-database'
  };
}

void main();
