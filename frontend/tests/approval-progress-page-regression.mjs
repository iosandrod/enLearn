import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260805090000_approval_progress_management.sql',
    import.meta.url
  ),
  'utf8'
);

const schemaMatch = migrationSource.match(/\$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/);
assert.ok(schemaMatch, 'Approval progress migration must contain a low-code page schema.');

const schema = JSON.parse(schemaMatch[1]);
assert.equal(schema.code, 'approval-progress');
assert.equal(schema.route, '/dashboard/approval/progress');
assert.equal(schema.title, '\u5ba1\u6279\u8fdb\u5ea6\u7ba1\u7406');
assert.equal(schema.pageType, 'list');

assert.equal(schema.dataSources.approvalInstances.postData.itemType, 'instances');
assert.equal(schema.dataSources.approvalNodeInstances.postData.itemType, 'nodeInstances');
assert.equal(schema.dataSources.approvalTasks.postData.itemType, 'tasks');
assert.equal(schema.dataSources.approvalNodeInstances.autoLoad, false);
assert.equal(schema.dataSources.approvalTasks.autoLoad, false);

const mainGrid = schema.blocks.find((block) => block.id === 'approval-instance-grid');
assert.ok(mainGrid, 'Approval instances must be rendered as the master grid.');
assert.deepEqual(
  mainGrid.schema.events.rowCurrentChange.map((directive) => directive.sourceKey),
  ['approvalNodeInstances', 'approvalTasks'],
  'Selecting an approval instance must refresh both child tables.'
);

const childTabs = schema.blocks.find((block) => block.id === 'approval-progress-child-tabs');
assert.deepEqual(
  childTabs.tabs.map((tab) => tab.key),
  ['nodes', 'tasks'],
  'The detail area must expose node and task tabs.'
);

for (const entityCode of ['wf_process_instance', 'wf_node_instance', 'wf_task']) {
  assert.match(
    migrationSource,
    new RegExp(`'${entityCode}'`),
    `${entityCode} must be registered as an admin entity.`
  );
}

assert.match(
  migrationSource,
  /where parent\.code = 'approval-management-root'/,
  'Approval progress must be nested under Approval Management.'
);
assert.match(
  migrationSource,
  /'workflow\.runtime\.manage'/,
  'Approval progress must require the workflow runtime permission.'
);
assert.match(
  migrationSource,
  /where roles\.code in \('system_admin', 'operations_admin'\)/,
  'Approval progress permission must be granted to the standard management roles.'
);

console.log('Approval progress page regression test passed.');
