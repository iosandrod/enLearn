import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [
  rendererSource,
  tabsSource,
  flowSource,
  ganttSource,
  bomSource,
  materialRegistrySource,
  nodeRegistrySource,
  blockHelpersSource,
  visualConfigSource,
  visualConverterSource,
  flowMaterialSource,
  ganttMaterialSource,
  bomMaterialSource,
] = await Promise.all([
  read('../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/tabs/index.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-flow/index.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-gantt/index.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-bom/index.vue'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/index.ts'),
  read('../../packages/lowcode-framework/src/runtime/node-action-registry.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/helpers.ts'),
  read('../../packages/lowcode-framework/src/visual.config.tsx'),
  read('../../packages/lowcode-framework/src/lowcode/visual-converters/index.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-flow/index.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-gantt/index.ts'),
  read('../../packages/lowcode-framework/src/lowcode/block-materials/planning-bom/index.ts'),
]);

assert.match(rendererSource, /function searchTargetSourceKeys[\s\S]*targetSourceKeys/);
assert.match(rendererSource, /sourceKeys\.forEach\(\(sourceKey\) => runtime\.replaceSearch/);
assert.match(rendererSource, /await refreshDataSources\(sourceKeys\)/);
assert.match(rendererSource, /const sourceRequestVersions = new Map<string, number>\(\)/);
assert.match(rendererSource, /function beginSourceRequest[\s\S]*runtime\.setSourceLoading\(key, true\)/);
assert.match(rendererSource, /function isCurrentSourceRequest[\s\S]*sourceRequestVersions\.get\(key\) === version/);
assert.match(rendererSource, /if \(!isCurrentSourceRequest\(key, version\)\) return ''/);
assert.match(rendererSource, /runtime\.setSource\(key, undefined\)[\s\S]*invokeDataSource\(key, source, true\)/);
assert.match(rendererSource, /@media \(max-width: 820px\)[\s\S]*overflow-y: auto[\s\S]*\.lc-runtime-block--fill\.lc-node-tabs[\s\S]*min-height: min\(560px, calc\(100dvh - 16px\)\)/);
assert.match(blockHelpersSource, /block\.clientFilter === false[\s\S]*return rows/);

assert.match(tabsSource, /lowcode:tab-activated/);
assert.match(tabsSource, /await nextTick\(\)/);

assert.match(flowSource, /ResizeObserver/);
assert.match(flowSource, /lowcode:tab-activated/);
assert.match(flowSource, /planningFlow\.nodeSelect/);
assert.match(flowSource, /fitView/);

assert.match(ganttSource, /v-show="validRows\.length"/);
assert.match(ganttSource, /chart\?\.clear\(\)/);
assert.match(ganttSource, /chart\?\.dispose\(\)/);
assert.match(ganttSource, /lowcode:tab-activated/);
assert.match(ganttSource, /planningGantt\.taskSelect/);
assert.match(ganttSource, /row\.delay_hours/);
assert.doesNotMatch(ganttSource, /row\.lateness_hours/);

assert.match(bomSource, /PlanningBomNode/);
assert.match(bomSource, /planningBom\.nodeSelect/);
assert.match(bomSource, /overflow:\s*auto/);

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
