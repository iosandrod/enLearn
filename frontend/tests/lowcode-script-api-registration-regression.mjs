import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/lowcode-script-apis.ts', import.meta.url),
  'utf8',
);
const mainSource = await readFile(
  new URL('../src/main.ts', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /registerLowCodeScriptApi\('page\.reload'[\s\S]*?authorize:[\s\S]*?context\.policy\?\.apiNames[\s\S]*?handler:[\s\S]*?context\.page[\s\S]*?useServiceApi\(\)\.invoke/,
  'The host must register at least one constrained production script API.',
);
assert.match(
  source,
  /'lowcode',[\s\S]*?'listItems'[\s\S]*?tableName: 'lowcode_pages'/,
  'The sample API must call a fixed backend service and operation.',
);
assert.doesNotMatch(
  source,
  /payload\.(?:serviceName|serviceMethod|tableName)|\.invoke\([^'"`]/,
  'User payload must not choose the backend service, method, or table.',
);
assert.match(
  mainSource,
  /installLowCodeScriptApis\(\)/,
  'The application must install script APIs during startup.',
);

console.log('Low-code production script API registration regression test passed.');
