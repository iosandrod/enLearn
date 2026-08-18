import assert from 'node:assert/strict';
import {
  resolveWorkerHealthCheckIntervalMs,
  shouldStartTriggerWorker
} from './trigger-worker-autostart';

function main() {
  assert.equal(
    shouldStartTriggerWorker(['node', 'tsx', 'watch', 'src/main.ts'], {}),
    true,
    'dev api entrypoint should auto-start the worker'
  );

  assert.equal(
    shouldStartTriggerWorker(['node', 'tsx', 'watch', 'src/standalone.ts'], {}),
    true,
    'standalone dev entrypoint should auto-start the worker'
  );

  assert.equal(
    shouldStartTriggerWorker(['node', 'E:\\enLearn\\api\\src\\standalone.ts'], {}),
    true,
    'absolute standalone dev entrypoint should auto-start the worker'
  );

  assert.equal(
    shouldStartTriggerWorker(['node', 'dist/main.js'], {}),
    false,
    'production entrypoints should not auto-start the worker'
  );

  assert.equal(
    shouldStartTriggerWorker(['node', 'tsx', 'watch', 'src/main.ts', '--without-trigger-worker'], {}),
    false,
    'explicit opt-out should win'
  );

  assert.equal(
    shouldStartTriggerWorker(
      ['node', 'dist/standalone.js', '--with-trigger-worker'],
      { TRIGGER_DEV_WORKER_AUTOSTART: 'false' }
    ),
    false,
    'disabled env should win over explicit opt-in'
  );

  assert.equal(
    shouldStartTriggerWorker(['node', 'dist/standalone.js'], { TRIGGER_DEV_WORKER_AUTOSTART: 'true' }),
    true,
    'enabled env should force startup'
  );

  assert.equal(
    resolveWorkerHealthCheckIntervalMs(undefined),
    15_000,
    'health checks should default to 15 seconds'
  );

  assert.equal(
    resolveWorkerHealthCheckIntervalMs('1000'),
    5_000,
    'health checks should not run more frequently than five seconds'
  );

  assert.equal(
    resolveWorkerHealthCheckIntervalMs('off'),
    0,
    'health checks should support explicit opt-out'
  );

  console.log('workflow trigger worker autostart tests passed');
}

main();
