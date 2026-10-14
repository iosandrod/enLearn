import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { ref, toRef } from 'vue';

const tldrawSource = await readFile(new URL('../../packages/tldraw-vue/src/TldrawVue.vue', import.meta.url), 'utf8');
const materialSource = await readFile(new URL('../../packages/lowcode-framework/src/lowcode/block-materials/label-designer/LabelDesignerMaterial.vue', import.meta.url), 'utf8');

assert.match(
  tldrawSource,
  /@contextmenu\.prevent\.stop="openTemplateContextMenu\(template, \$event\)"/,
  'Template cards must open their own context menu on right click.',
);
assert.match(
  materialSource,
  /@template-delete="handleTemplateDelete"/,
  'The print designer material must handle template deletion.',
);
function functionsFrom(source, names) {
  const descriptor = parse(source).descriptor;
  compileScript(descriptor, { id: 'delete-test' });
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'delete-test.vue', id: 'delete-test' }).errors, []);
  const ast = ts.createSourceFile('delete-test.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length);
  return ts.transpileModule(functions.map((node) => node.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

// Execute the real menu handlers: right-clicking a card must target that card,
// without loading it, and Escape/outside-click must only close the menu.
const menuCode = functionsFrom(tldrawSource, ['openTemplateContextMenu', 'closeTemplateContextMenu', 'deleteTemplateFromContextMenu', 'handleTemplateContextMenuKeyDown']);
const menu = ref(null);
const events = [];
const ui = new Function('templateContextMenu', 'emit', 'window', `${menuCode}\nreturn { openTemplateContextMenu, deleteTemplateFromContextMenu, handleTemplateContextMenuKeyDown };`)(menu, (...event) => events.push(event), { innerWidth: 800, innerHeight: 600 });
ui.openTemplateContextMenu({ id: 'other', name: '其他模板' }, { clientX: 790, clientY: 590 });
assert.equal(events.length, 0);
assert.equal(menu.value.templateId, 'other');
assert.ok(menu.value.x < 790 && menu.value.y < 590);
ui.deleteTemplateFromContextMenu();
assert.deepEqual(events, [['template-delete', 'other']]);
assert.equal(menu.value, null);
ui.openTemplateContextMenu({ id: 'current', name: '当前模板' }, { clientX: 50, clientY: 50 });
ui.handleTemplateContextMenuKeyDown({ key: 'Escape' });
assert.equal(menu.value, null);
assert.equal(events.length, 1);

const deleteCode = functionsFrom(materialSource, ['handleTemplateDelete']);
function harness(action, fail = false) {
  const config = { templateId: 'current', templateName: '当前模板', templateVersion: 5, templateStatus: 'active', templateDirty: false };
  const items = ref([{ id: 'current', name: '当前模板' }, { id: 'other', name: '其他模板' }]);
  const total = ref(2);
  const busy = ref(false);
  const dirty = ref(false);
  const message = ref('');
  const calls = [];
  let refreshes = 0;
  let notifications = 0;
  const host = { getServiceApi: () => ({ invoke: async (...args) => {
    calls.push(args);
    if (fail) throw new Error('删除被拒绝');
    return { id: args[2].id };
  } }) };
  const dialog = async (options) => {
    if (action === 'confirm') await options.onConfirm();
    return { action };
  };
  const params = ['templateItems', 'templateTotal', 'busy', 'dirty', 'message', 'templateId', 'templateVersion', 'templateStatus', 'templateDirty', 'host', 'openGlobalDialog', 'refreshTemplateItems', 'emitTemplateInfo'];
  const handler = new Function(...params, `${deleteCode}\nreturn handleTemplateDelete;`)(items, total, busy, dirty, message, toRef(config, 'templateId'), toRef(config, 'templateVersion'), toRef(config, 'templateStatus'), toRef(config, 'templateDirty'), host, dialog, async () => { refreshes++; }, () => { notifications++; });
  return { handler, config, items, total, busy, dirty, message, calls, counts: () => ({ refreshes, notifications }) };
}

const cancelled = harness('cancel');
await cancelled.handler('current');
assert.equal(cancelled.calls.length, 0);
assert.equal(cancelled.config.templateId, 'current');
assert.equal(cancelled.items.value.length, 2);
assert.deepEqual(cancelled.counts(), { refreshes: 0, notifications: 0 });
assert.equal(cancelled.busy.value, false);

const failed = harness('confirm', true);
await failed.handler('current');
assert.equal(failed.items.value.length, 2);
assert.equal(failed.config.templateId, 'current');
assert.equal(failed.config.templateDirty, false);
assert.equal(failed.busy.value, false);
assert.match(failed.message.value, /删除被拒绝/);
assert.deepEqual(failed.counts(), { refreshes: 0, notifications: 0 });

const other = harness('confirm');
await other.handler('other');
assert.deepEqual(other.calls, [['admin', 'deleteItem', { resource: 'print_templates', id: 'other' }]]);
assert.equal(other.config.templateId, 'current');
assert.equal(other.config.templateDirty, false);
assert.deepEqual(other.items.value.map((item) => item.id), ['current']);
assert.equal(other.total.value, 1);
assert.deepEqual(other.counts(), { refreshes: 1, notifications: 0 });

const current = harness('confirm');
await current.handler('current');
assert.deepEqual(current.calls, [['admin', 'deleteItem', { resource: 'print_templates', id: 'current' }]]);
assert.equal(current.config.templateId, '', 'Saving the retained canvas must create a new record.');
assert.equal(current.config.templateName, '当前模板');
assert.equal(current.config.templateVersion, 1);
assert.equal(current.config.templateStatus, '尚未保存');
assert.equal(current.config.templateDirty, true);
assert.equal(current.dirty.value, true);
assert.equal(current.busy.value, false);
assert.deepEqual(current.counts(), { refreshes: 1, notifications: 1 });
assert.match(current.message.value, /已删除/);
console.log('Verified template context-menu targeting, cancellation, generic deletion, failure, refresh and current identity detachment.');
