import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../pages/dashboard/task/console.vue', import.meta.url), 'utf8');
const layout = await readFile(new URL('../layouts/dashboard.vue', import.meta.url), 'utf8');
const router = await readFile(new URL('../src/router.ts', import.meta.url), 'utf8');

assert.match(page, /getTaskConsole/);
assert.match(page, /getTaskConsoleDetail/);
assert.match(page, /selectTask\(nextSelection, false\)/);
assert.doesNotMatch(page, /selectTask\(nextSelection, false, forceRefresh\)/);
assert.match(page, /runJob/);
assert.match(page, /updateJobStatus/);
assert.match(page, /Trigger\.dev 部分状态不可用/);
assert.match(page, /setInterval\(.*15_000/s);
assert.match(layout, /任务总控/);
assert.match(layout, /\/dashboard\/task\/console/);
assert.match(router, /pages\/dashboard\/task\/console\.vue/);

console.log('task console regression tests passed');
