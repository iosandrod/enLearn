import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const workspaceDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const roots = [
  join(workspaceDir, 'packages/lowcode-framework/src'),
  join(workspaceDir, 'frontend'),
  join(workspaceDir, 'mobile-app/src'),
];
const extensions = new Set(['.ts', '.tsx', '.vue', '.js', '.mjs']);
const ignoredDirectories = new Set(['dist', 'node_modules']);
const ignoredFiles = new Set([
  'frontend/tests/lc-sub-form-canonical-schema-regression.mjs',
  'frontend/tests/lc-sub-form-database-migration-regression.mjs',
]);
const legacyKeys = new Set(['fields', 'columns', 'layout', 'actions']);
const violations = [];

async function collectFiles(directory) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (extensions.has(extname(entry.name))) files.push(path);
  }

  return files;
}

function propertyName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return '';
}

function objectProperty(object, name) {
  return object.properties.find(
    (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === name,
  );
}

function inspectObject(sourceFile, object, file) {
  const component = objectProperty(object, 'component');
  if (!component || !ts.isStringLiteralLike(component.initializer)) return;
  if (component.initializer.text !== 'lc-sub-form') return;

  const props = objectProperty(object, 'props');
  if (!props || !ts.isObjectLiteralExpression(props.initializer)) {
    violations.push(`${relative(workspaceDir, file)}:${sourceFile.getLineAndCharacterOfPosition(object.pos).line + 1} props must be an object literal with schema`);
    return;
  }

  const keys = props.initializer.properties.map((property) => propertyName(property.name));
  const legacy = keys.filter((key) => legacyKeys.has(key));
  if (legacy.length) {
    violations.push(`${relative(workspaceDir, file)}:${sourceFile.getLineAndCharacterOfPosition(props.pos).line + 1} legacy props.${legacy.join(',props.')}`);
  }
  if (!keys.includes('schema')) {
    violations.push(`${relative(workspaceDir, file)}:${sourceFile.getLineAndCharacterOfPosition(props.pos).line + 1} missing props.schema`);
  }
}

for (const file of (await Promise.all(roots.map(collectFiles))).flat()) {
  if (ignoredFiles.has(relative(workspaceDir, file).replaceAll('\\', '/'))) continue;
  const source = await readFile(file, 'utf8');
  if (!source.includes('lc-sub-form')) continue;
  const script = extname(file) === '.vue'
    ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n')
    : source;
  const sourceFile = ts.createSourceFile(
    pathToFileURL(file).href,
    script,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) inspectObject(sourceFile, node, file);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

assert.deepEqual(violations, [], `Legacy lc-sub-form definitions found:\n${violations.join('\n')}`);
console.log('Canonical lc-sub-form schema regression test passed.');
