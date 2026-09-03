import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [
  rendererSource,
  tabsSource,
  appStylesSource,
  flowSource,
  ganttSource,
  ganttSettingsSource,
  ganttSettingsDefinitionSource,
  bomSource,
  materialRegistrySource,
  nodeRegistrySource,
  blockHelpersSource,
  visualConfigSource,
  visualConverterSource,
  flowMaterialSource,
  ganttMaterialSource,
  bomMaterialSource,
  gridSource,
] = await Promise.all([
  read('../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/tabs/index.vue'),
  read('../assets/styles/app.css'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-flow/index.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-gantt/index.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-gantt/GanttDisplaySettings.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-gantt/display-settings.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-bom/index.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/index.ts'),
  read('../../packages/lowcode-framework/src/runtime/node-action-registry.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/helpers.ts'),
  read('../../packages/lowcode-framework/src/visual.config.tsx'),
  read('../../packages/lowcode-framework/src/lowcode/visual-converters/index.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-flow/index.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-gantt/index.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-bom/index.ts'),
  read('../../packages/lowcode-framework/src/components/LowCodeGrid.vue'),
]);

assert.match(rendererSource, /function searchTargetSourceKeys[\s\S]*targetSourceKeys/);
assert.match(rendererSource, /sourceKeys\.forEach\(\(sourceKey\) => runtime\.replaceSearch/);
assert.match(rendererSource, /await refreshDataSources\(sourceKeys\)/);
assert.match(rendererSource, /const sourceRequestVersions = new Map<string, number>\(\)/);
assert.match(rendererSource, /function beginSourceRequest[\s\S]*runtime\.setSourceLoading\(key, true\)/);
assert.match(rendererSource, /function isCurrentSourceRequest[\s\S]*sourceRequestVersions\.get\(key\) === version/);
assert.match(rendererSource, /if \(!isCurrentSourceRequest\(key, version\)\) return ''/);
assert.match(rendererSource, /runtime\.setSource\(key, undefined\)[\s\S]*invokeDataSource\(key, source, true\)/);
assert.match(
  rendererSource,
  /async function loadDataSourceWaves[\s\S]*source\.loadAfterSourceKeys[\s\S]*hydrateSourceBoundForms\(pageBlocks, sources, new Set\(ready\.map/,
  'Form-dependent data sources must wait for prerequisite rows to hydrate their forms.',
);
assert.match(rendererSource, /@media \(max-width: 820px\)[\s\S]*overflow-y: auto[\s\S]*\.lc-runtime-block--fill\.lc-node-tabs[\s\S]*min-height: min\(560px, calc\(100dvh - 16px\)\)/);
assert.match(blockHelpersSource, /block\.clientFilter === false[\s\S]*return rows/);
assert.match(
  gridSource,
  /const rowConfig = isRecord\(nextConfig\.rowConfig\)[\s\S]*isCurrent: true/,
  'Low-code grids must always enable current-row highlighting at runtime.',
);

assert.match(tabsSource, /lowcode:tab-activated/);
assert.match(tabsSource, /await nextTick\(\)/);
assert.match(appStylesSource, /\.planning-console-inner-tabs/);
assert.match(appStylesSource, /\.planning-console-inner-tabs[\s\S]*height: 32px/);

assert.match(flowSource, /ResizeObserver/);
assert.match(flowSource, /lowcode:tab-activated/);
assert.match(flowSource, /planningFlow\.nodeSelect/);
assert.match(flowSource, /fitView/);
assert.match(flowSource, /viewMode = ref<'lanes' \| 'graph'>\('graph'\)/);
assert.match(flowSource, /lc-planning-flow__view-switch/);
assert.match(flowSource, /v-for="lane in laneRows"/);
assert.match(flowSource, /lc-planning-flow__lane-track/);
assert.match(flowSource, /sequence: readSequence\(row\.sequence, index \+ 1\)/);
assert.match(flowSource, /function readSequence[\s\S]*typeof value === 'number'/);
assert.match(flowSource, /incomingDependencyCount/);
assert.match(flowSource, /node-planning-container/);
assert.match(flowSource, /flowLanes\.value\.map/);
assert.match(flowSource, /const rawEdges = computed/);
assert.match(flowSource, /combined:\$\{sourceId\}:\$\{targetId\}/);
assert.match(flowSource, /allNodes\.value\.filter\(\(node\) => !isContainerType\(node\.data\.type\)\)/);
assert.match(flowSource, /relation === 'owner'/);
assert.match(flowSource, /const label = hasDependency \? '前置约束' : ''/);
assert.match(flowSource, /strokeDasharray: tone === 'dependency'/);
assert.doesNotMatch(flowSource, /return '包含'/);
assert.match(flowSource, /function flowEdgePresentation/);
assert.match(flowSource, /type: 'straight'/);
assert.match(flowSource, /type: 'bezier'/);
assert.match(flowSource, /horizontalDistance <= 420/);
assert.match(flowSource, /pathOptions: \{ curvature \}/);
assert.match(flowSource, /fontSize: 12,[\s\S]*fontWeight: 800/);
assert.match(flowSource, /labelOffset: verticalDirection \* 18/);
assert.doesNotMatch(flowSource, /type: 'smoothstep'/);
assert.match(flowSource, /setCenter\(firstNode\.position\.x \+ 126, firstNode\.position\.y \+ 64/);
assert.match(flowSource, /isContainerType\(node\.data\.type\)/);
assert.match(flowSource, /zoom: 0\.82/);
assert.match(flowSource, /width: 252px/);
assert.match(flowSource, /width: 220px/);

assert.match(ganttSource, /v-if="validRows\.length"/);
assert.match(ganttSource, /from '@svar-ui\/vue-gantt'/);
assert.match(ganttSource, /<Gantt/);
assert.match(ganttSource, /<Willow/);
assert.match(ganttSource, /readonly/);
assert.match(ganttSource, /ganttTasks/);
assert.match(ganttSource, /type: 'summary'/);
assert.match(ganttSource, /duration-unit="hour"/);
assert.match(ganttSource, /:start="ganttViewRange\.start"/);
assert.match(ganttSource, /:end="ganttViewRange\.end"/);
assert.match(ganttSource, /<GanttDisplaySettings/);
assert.match(ganttSource, /v-model="displaySettings"/);
assert.match(ganttSource, /DEFAULT_GANTT_DISPLAY_SETTINGS/);
assert.doesNotMatch(ganttSource, /type="datetime-local"/);
assert.match(ganttSettingsSource, /v-for="field in GANTT_DISPLAY_FIELDS"/);
assert.match(ganttSettingsSource, /function updateField/);
assert.match(ganttSettingsSource, /function resetDisplaySettings/);
assert.match(ganttSettingsDefinitionSource, /key: 'start'.*control: 'datetime-local'/);
assert.match(ganttSettingsDefinitionSource, /key: 'end'.*control: 'datetime-local'/);
assert.match(ganttSettingsDefinitionSource, /key: 'granularity'.*control: 'select'/s);
assert.match(ganttSettingsDefinitionSource, /value: 'week'/);
assert.match(ganttSettingsDefinitionSource, /value: 'month'/);
assert.match(ganttSettingsDefinitionSource, /key: 'cellWidth'.*min: 40.*max: 160/);
assert.match(ganttSettingsDefinitionSource, /key: 'gridWidth'.*min: 176.*max: 420/);
assert.match(ganttSource, /:length-unit="ganttLengthUnit"/);
assert.match(ganttSource, /:auto-scale="false"/);
assert.match(ganttSource, /:key="ganttInstanceKey"/);
assert.match(ganttSource, /const ganttInstanceKey = computed/);
assert.match(ganttSource, /const ganttTimelineSignature = computed/);
assert.match(ganttSource, /const ganttDataRange = computed/);
assert.match(ganttSource, /row\.__start\.getTime\(\)/);
assert.match(ganttSource, /row\.__end\.getTime\(\)/);
assert.doesNotMatch(ganttSource, /const ganttRange = computed/);
assert.match(ganttSource, /:onselecttask="handleTaskSelect"/);
assert.match(ganttSource, /lowcode:tab-activated/);
assert.match(ganttSource, /planningGantt\.taskSelect/);
assert.match(ganttSource, /row\.delay_hours/);
assert.match(ganttSource, /props\.block\.includedTypes/);
assert.match(ganttSource, /const GANTT_MIN_TIMESTAMP = Date\.UTC\(2000, 0, 1\)/);
assert.match(ganttSource, /start\.getTime\(\) < GANTT_MIN_TIMESTAMP/);
assert.match(ganttSource, /const rowLabel = ganttRowLabel\(row\)/);
assert.match(ganttSource, /function ganttRowLabel/);
assert.match(ganttSource, /readString\(row\.demand_name\)/);
assert.match(ganttSource, /未分配对象/);
assert.doesNotMatch(ganttSource, /from 'echarts'/);
assert.doesNotMatch(ganttSource, /row\.lateness_hours/);

assert.match(bomSource, /<VueFlow/);
assert.match(bomSource, /from '@vue-flow\/core'/);
assert.match(bomSource, /buildGraph/);
assert.match(bomSource, /toggleNode/);
assert.match(bomSource, /roots\.forEach\(\(root, index\)/);
assert.match(bomSource, /ResizeObserver/);
assert.match(bomSource, /lowcode:tab-activated/);
assert.match(bomSource, /planningBom\.nodeSelect/);
assert.match(bomSource, /fitView/);
assert.doesNotMatch(bomSource, /PlanningBomNode/);
assert.doesNotMatch(bomSource, /<table/);

assert.match(materialRegistrySource, /import\.meta\.glob<MaterialModule>\('\.\/\*\/index\.ts'/);
for (const kind of ['planningFlow', 'planningGantt', 'planningBom']) {
  assert.match(nodeRegistrySource, new RegExp(`${kind}:\\s*nodeType`));
}

assert.match(visualConfigSource, /Object\.entries\(businessComponent\)/);
for (const [source, componentKey] of [
  [flowMaterialSource, 'planning-flow'],
  [ganttMaterialSource, 'planning-gantt'],
  [bomMaterialSource, 'planning-bom'],
]) {
  assert.match(source, /designer:\s*\(\)\s*=>/);
  assert.match(source, new RegExp(`business-component/${componentKey}`));
  assert.match(source, /converter/);
  assert.match(visualConverterSource, new RegExp(`componentKey: '${componentKey}'`));
}
assert.match(visualConverterSource, /block\.kind === 'planningFlow'/);
assert.match(visualConverterSource, /block\.kind === 'planningGantt'/);
assert.match(visualConverterSource, /block\.kind === 'planningBom'/);

console.log('Planning console runtime regression test passed.');
