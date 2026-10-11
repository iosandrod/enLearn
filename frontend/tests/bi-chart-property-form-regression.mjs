import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../supabase/migrations/20261011150000_print_designer_bi_chart_form.sql', import.meta.url), 'utf8');
const applyScript = await readFile(new URL('../../api/scripts/apply-print-designer-bi-chart-form.ts', import.meta.url), 'utf8');
const panel = await readFile(new URL('../../packages/tldraw-vue/src/components/LowCodeFormPanel.vue', import.meta.url), 'utf8');
const schemaMatch = migration.match(/\$schema\$\s*([\s\S]*?)\s*\$schema\$/);
assert.ok(schemaMatch, 'migration must contain an embedded BI chart form schema');
const schema = JSON.parse(schemaMatch[1]);
const fields = new Map(schema.fields.map(field => [field.field, field]));

for (const field of ['chartType', 'title', 'chartColor', 'background', 'showLegend', 'showTooltip', 'dataJson', 'optionJson', 'x', 'y', 'w', 'h', 'rotation', 'opacity', 'isLocked']) {
  assert.ok(fields.has(field), `BI chart form must contain ${field}`);
}
assert.deepEqual(fields.get('chartType').options.map(option => option.value), ['bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'radar']);
assert.equal(fields.get('dataJson').component, 'lc-json-editor');
assert.equal(fields.get('optionJson').component, 'lc-json-editor');
assert.deepEqual(schema.layout[0].tabs.map(tab => tab.label), ['基本属性', '数据配置', '样式属性', '高级属性']);
assert.match(migration, /on conflict \(code\) do update/);
assert.match(applyScript, /requestedEnvFile\(\) \?\? '\.env\.remote'/);
assert.match(panel, /shape\.type === 'bi-chart' && biChartPropertyRegistry\.has\(key\)/);

console.log('BI chart database-backed property form regression test passed.');
