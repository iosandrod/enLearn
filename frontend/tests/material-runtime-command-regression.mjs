import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const runtimeSource = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts', import.meta.url),
  'utf8',
);

assert.match(runtimeSource, /command\.startsWith\('material\.'\)/);
assert.match(
  runtimeSource,
  /command\.slice\('material\.'\.length\)\.trim\(\)[\s\S]*executeLowCodeMaterialRuntimeAction\(block\.id, method, \.\.\.args\)/,
);
assert.doesNotMatch(
  runtimeSource,
  /case 'material\.[^']+'/,
  'Material actions must not require a hard-coded runtime command case.',
);

const registryUrl = new URL(
  '../../packages/lowcode-framework/src/runtime/material-controller-registry.ts',
  import.meta.url,
);
const bundled = await build({
  entryPoints: [fileURLToPath(registryUrl)],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const registry = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

// Exercise the actual host bridge without loading its UI and worker dependencies.
const ast = ts.createSourceFile('runtime.ts', runtimeSource, ts.ScriptTarget.Latest, true);
const runtimeClass = ast.statements.find(
  (statement) => ts.isClassDeclaration(statement) && statement.name?.text === 'LowCodePageScriptRuntime',
);
const methodNames = new Set([
  'readScriptStringArg', 'readScriptRecordArg', 'handleNodeRuntimeCommand',
]);
const methods = runtimeClass.members
  .filter((member) => ts.isMethodDeclaration(member) && methodNames.has(member.name.getText(ast)))
  .map((member) => member.getText(ast)).join('\n');
const compiled = ts.transpileModule(`class Runtime { ${methods} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Runtime = new Function(
  'executeLowCodeMaterialRuntimeAction', 'readString', 'cloneRuntimeValue', 'isRecord',
  `${compiled}\nreturn Runtime;`,
)(
  registry.executeLowCodeMaterialRuntimeAction,
  (value) => typeof value === 'string' ? value.trim() : '',
  structuredClone,
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
);
const bridge = new Runtime();
bridge.dependencies = {};
const call = (command, payload) => bridge.handleNodeRuntimeCommand(
  { name: 'node.runtime', args: [command, payload] },
  { id: 'dynamic-node', kind: 'customMaterial' },
  {},
);

const unregister = registry.registerLowCodeMaterialRuntimeController('dynamic-node', {
  futureAction: async (...args) => ({ args }),
});
assert.deepEqual(
  await call('material.futureAction', { data: [1, { ok: true }] }),
  { args: [1, { ok: true }] },
  'A newly registered controller action must be callable without changing the runtime switch.',
);
assert.deepEqual(await call('material.futureAction', { data: { ok: true } }), { args: [{ ok: true }] });
assert.deepEqual(await call('material.futureAction', { option: true }), { args: [{ option: true }] });
assert.deepEqual(await call('material.futureAction'), { args: [] });
assert.deepEqual(await call('material.futureAction', { data: null }), { args: [null] });
await assert.rejects(call('material.'), /未知节点运行时命令/);
await assert.rejects(call('unknown.futureAction'), /未知节点运行时命令/);
await assert.rejects(
  call('material.toString'),
  /未挂载动作 "toString"/,
  'Inherited object properties must not be exposed as material actions.',
);
unregister();

await assert.rejects(
  call('material.futureAction'),
  /未挂载动作 "futureAction"/,
);

console.log('Dynamic material runtime command regression test passed.');
