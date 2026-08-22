import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sourcePath = new URL(
  '../../packages/lowcode-framework/src/utils/lowcode.ts',
  import.meta.url,
);
const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
);

const utc = '2026-08-22T00:00:00.000Z';
const formatter = {
  type: 'datetime',
  locale: 'zh-CN',
  options: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  emptyText: '-',
};

assert.match(
  runtime.formatLowCodeGridValue(utc, formatter, 'Asia/Shanghai'),
  /08:00/,
  'The low-code grid must render UTC timestamps in the configured system timezone.',
);
assert.match(
  runtime.formatLowCodeGridValue(utc, formatter, 'UTC'),
  /00:00/,
  'A column-level timeZone override must keep working.',
);

const columns = runtime.normalizeLowCodeGridColumns(
  [{ field: 'created_at', title: '创建时间', formatter }],
  'Asia/Shanghai',
);
assert.match(
  columns[0].formatter({ cellValue: utc }),
  /08:00/,
  'Normalized grid columns must inherit the configured system timezone.',
);

console.log('Low-code grid timezone regression test passed.');
