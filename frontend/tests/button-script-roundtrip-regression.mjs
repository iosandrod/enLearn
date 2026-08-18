import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [converterSource, reverseConverterSource] = await Promise.all([
  readFile(
    new URL('lowcode/visual-converters/lowcode-button-group/index.ts', frameworkRoot),
    'utf8',
  ),
  readFile(new URL('lowcode/visual-converters/index.ts', frameworkRoot), 'utf8'),
]);

function normalizeVisualButton(row, indexPath) {
  const children = Array.isArray(row.children)
    ? row.children.map((child, index) => normalizeVisualButton(child, [...indexPath, index + 1]))
    : [];
  const script = typeof row.script === 'string' ? row.script : '';

  return {
    code: String(row.code || `button_${indexPath.join('_')}`),
    label: String(row.label || row.code || `button_${indexPath.join('_')}`),
    ...(script.trim() ? { script } : {}),
    ...(children.length ? { children } : {}),
  };
}

function runtimeActionToVisualButton(action) {
  return {
    code: action.code,
    label: action.label,
    script: action.script ?? '',
    children: Array.isArray(action.children)
      ? action.children.map(runtimeActionToVisualButton)
      : [],
  };
}

const rootScript = `
const row = this.grids.records?.currentRow;
await this.$message.info(String(row?.id ?? 'none'));
`;
const childScript = `
await this.$api.invoke('records.archive', { id: this.event.row?.id });
`;
const runtimeActions = [
  { code: 'refresh', label: '刷新', script: rootScript },
  {
    code: 'more',
    label: '更多',
    children: [{ code: 'archive', label: '归档', script: childScript }],
  },
];

const visualButtons = runtimeActions.map(runtimeActionToVisualButton);
assert.equal(visualButtons[0].script, rootScript);
assert.equal(visualButtons[1].children[0].script, childScript);

const roundTripped = visualButtons.map((button, index) =>
  normalizeVisualButton(button, [index + 1]),
);
assert.equal(roundTripped[0].script, rootScript);
assert.equal(roundTripped[1].children[0].script, childScript);

assert.match(
  converterSource,
  /const children = normalizeRows\(childrenSource\)[\s\S]*?const script = typeof row\.script === 'string'[\s\S]*?script\.trim\(\) \? \{ script \}[\s\S]*?children\.length \? \{ children \}/,
  'The visual-to-runtime converter must retain root and nested scripts.',
);
assert.match(
  reverseConverterSource,
  /function runtimeActionToVisualButton[\s\S]*?script: action\.script \?\? ''[\s\S]*?children\.map\(runtimeActionToVisualButton\)/,
  'The runtime-to-visual converter must recursively restore scripts.',
);

console.log('Button script visual/runtime round-trip regression test passed.');
