import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageSource = await readFile(
  new URL('../pages/dashboard/entity-design.vue', import.meta.url),
  'utf8'
);
const arrayTableSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue',
    import.meta.url
  ),
  'utf8'
);
const formDefinitionSource = await readFile(
  new URL('../utils/lowCodeFormDefinitions.ts', import.meta.url),
  'utf8'
);
const formDefinitionMigration = await readFile(
  new URL(
    '../../supabase/migrations/20260808210000_entity_design_load_physical_tables_form.sql',
    import.meta.url
  ),
  'utf8'
);

assert.match(
  formDefinitionSource,
  /entityDesignLoadPhysicalTables: 'entity-design-load-physical-tables'/,
  'The physical-table picker must have a stable database form code.'
);
assert.match(
  formDefinitionMigration,
  /'entity-design-load-physical-tables'[\s\S]*?"component": "lc-array-table"[\s\S]*?"field": "checked"[\s\S]*?"type": "checkbox"/,
  'The database migration must persist the physical-table picker schema and checkbox column.'
);
assert.match(
  pageSource,
  /loadLowCodeFormDefinitions\(serviceApi, \[[\s\S]*?LOW_CODE_FORM_CODES\.entityDesignLoadPhysicalTables[\s\S]*?loadPhysicalTablesFormSchema\.value\s*=\s*definitions\[LOW_CODE_FORM_CODES\.entityDesignLoadPhysicalTables\]\.schema/,
  'The entity designer must load the physical-table picker schema from the database.'
);
assert.match(
  pageSource,
  /const loadTablesSchema = loadPhysicalTablesFormSchema\.value;[\s\S]*?openGlobalDialog<PhysicalTableLoaderForm>\(\{[\s\S]*?form: \{[\s\S]*?schema: loadTablesSchema/,
  'The entity designer must open the physical-table picker through the global dialog service.'
);
assert.match(
  pageSource,
  /const confirmDisabled = computed\(\(\) => selectedTableCount\.value === 0\)[\s\S]*?disabled: confirmDisabled/,
  'The load action must remain disabled until the schema table contains a selection.'
);
assert.doesNotMatch(
  pageSource,
  /LcVxeModalRenderer|const modalConfigs|h\('vxe-table'|const loadPhysicalTablesSchema\s*:/,
  'The entity designer must not retain a hand-written modal or inline picker schema.'
);
assert.match(
  arrayTableSource,
  /v-if="column\.type"[\s\S]*?:type="column\.type"[\s\S]*?@checkbox-change="commitRows"[\s\S]*?@checkbox-all="commitRows"|@checkbox-change="commitRows"[\s\S]*?@checkbox-all="commitRows"[\s\S]*?v-if="column\.type"[\s\S]*?:type="column\.type"/,
  'The array-table material must render and persist schema-defined checkbox columns.'
);

console.log('Entity designer load-tables dialog regression test passed.');
