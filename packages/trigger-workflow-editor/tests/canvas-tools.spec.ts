import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { triggerWorkflowToFlowNodes } from '../src/flow-adapter';
import { getTriggerNodeDefinitionsForKind } from '../src/schema/registry';
import type { TriggerWorkflowModel } from '../src/schema/types';

const source = await readFile(
  new URL('../src/components/TriggerWorkflowEditor.vue', import.meta.url),
  'utf8'
);

assert.match(source, /@node-click="onNodeClick"/);
assert.match(source, /@node-double-click="onNodeDoubleClick"/);
assert.match(source, /@edge-click="onEdgeClick"/);
assert.match(source, /@edge-double-click="onEdgeDoubleClick"/);
assert.match(
  source,
  /function onNodeClick\([\s\S]*?activeInspectorTab\.value = 'config';\s*}\s*function onNodeDoubleClick\([\s\S]*?openSelectedInspectorDialog\(\)/,
  'A node click should only select it; a node double-click should open its form.'
);
assert.match(
  source,
  /function onEdgeClick\([\s\S]*?activeInspectorTab\.value = 'config';\s*}\s*function onEdgeDoubleClick\([\s\S]*?openSelectedInspectorDialog\(\)/,
  'An edge click should only select it; an edge double-click should open its form.'
);

assert.match(source, /role="toolbar" aria-label="画布工具"/);
assert.match(source, /class="trigger-editor__workflow-info" aria-label="当前流程信息"/);
for (const workflowField of [
  'currentModel.name',
  'currentModel.id',
  'currentModel.code',
  'currentKindLabel',
  'currentModel.description',
  'currentModel.nodes.length',
  'currentModel.edges.length'
]) {
  assert.ok(
    source.includes(workflowField),
    `The current workflow information box should display ${workflowField}.`
  );
}

for (const action of ['撤销', '重做', '缩小', '放大', '适应画布', '自动整理节点', '清空画布']) {
  assert.match(source, new RegExp(`aria-label="${action}"`), `Canvas toolbar should expose ${action}.`);
}

assert.match(
  source,
  /async function clearCanvas\(\)[\s\S]*createRequiredCanvasNodes\(\)[\s\S]*VxeUI\.modal\.confirm\([\s\S]*nodes: retainedNodes,[\s\S]*edges: \[\]/,
  'Clearing the canvas must retain or restore the required start and end nodes.'
);
assert.match(
  source,
  /function prepareEditorModel\([\s\S]*model\.nodes\.some\(isEntryCanvasNode\)[\s\S]*node\.type === 'end'[\s\S]*nodes\.unshift\([\s\S]*type: 'start'[\s\S]*nodes\.push\([\s\S]*type: 'end'/,
  'Legacy drafts should recover a missing entry or end node.'
);
assert.match(
  source,
  /if \(props\.modelValue && !modelsMatch\(normalizeTriggerWorkflow\(props\.modelValue\), currentModel\.value\)\) \{\s*emitModel\(currentModel\.value\);\s*\}/,
  'A legacy draft repaired during initial setup should be emitted back to its owner.'
);
assert.match(
  source,
  /const nextFlowNodes = triggerWorkflowToFlowNodes\(currentModel\.value\)[\s\S]*const nextFlowEdges = triggerWorkflowToFlowEdges\(currentModel\.value\)[\s\S]*setNodes\(nextFlowNodes\)[\s\S]*setEdges\(nextFlowEdges\)/,
  'Model synchronization should update both the v-model arrays and Vue Flow store.'
);
assert.match(
  source,
  /function undoCanvasChange\([\s\S]*redoStack[\s\S]*applyHistorySnapshot/,
  'Canvas changes should be undoable.'
);
assert.match(
  source,
  /mergeHistory: true[\s\S]*function rememberMergedSnapshot[\s\S]*historyDebounceMs/,
  'Continuous text editing should be merged into a single undo action.'
);
assert.match(
  source,
  /@node-drag-start="onNodeDragStart"[\s\S]*@node-drag-stop="onNodeDragStop"/,
  'Node moves should be recorded as a single history action.'
);
assert.match(source, /code: 'set-entry'[\s\S]*children: \[/);
assert.match(source, /code: 'set-entry:start'/);
assert.match(source, /code: 'set-entry:webhook'/);
assert.match(source, /code: 'set-entry:schedule'/);
assert.match(source, /function switchEntryNodeType\(/);
assert.match(
  source,
  /const latestNode = currentModel\.value\.nodes\.find\(\(item\) => item\.id === node\.id\)/,
  'Inspector updates must apply to the latest node after each form change.'
);

for (const kind of ['approval', 'dataSync', 'aiAgent', 'custom'] as const) {
  const types = getTriggerNodeDefinitionsForKind(kind).map((definition) => definition.type);
  assert.ok(types.includes('start'), `${kind} palette should expose the start node.`);
  assert.ok(types.includes('end'), `${kind} palette should expose the end node.`);
}

const dragModel: TriggerWorkflowModel = {
  schemaVersion: 1,
  code: 'drag-test',
  name: 'Drag test',
  kind: 'custom',
  nodes: [
    { id: 'start', type: 'start', name: '开始' },
    { id: 'schedule', type: 'schedule', name: '定时触发' },
    { id: 'webhook', type: 'webhook', name: 'Webhook 触发' },
    { id: 'task', type: 'task', name: '执行任务' },
    { id: 'end', type: 'end', name: '结束' }
  ],
  edges: []
};
const dragNodes = new Map(
  triggerWorkflowToFlowNodes(dragModel).map((node) => [node.id, node])
);
for (const id of ['start', 'schedule', 'end']) {
  assert.equal(dragNodes.get(id)?.draggable, true, `${id} should be draggable on the canvas.`);
  assert.equal(dragNodes.get(id)?.deletable, false, `${id} should remain protected from deletion.`);
}
assert.equal(dragNodes.get('webhook')?.draggable, false, 'Webhook entry behavior should remain unchanged.');
assert.equal(dragNodes.get('task')?.draggable, true, 'Regular workflow nodes should remain draggable.');

console.log('trigger-workflow-editor canvas tools tests passed');
