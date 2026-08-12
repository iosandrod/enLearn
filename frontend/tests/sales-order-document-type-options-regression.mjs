import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL(
    '../../supabase/migrations/20260812191000_sales_order_document_type_options.sql',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  migration,
  /'sales_order_document_type'[\s\S]*?'dict'[\s\S]*?'valueField', 'label'/,
  'Sales-order document types must have a dedicated dictionary option source.',
);
assert.match(
  migration,
  /'sales_order_document_type'[\s\S]*?'STD-SO'/,
  'The dedicated source must include the standard sales-order type.',
);
assert.match(
  migration,
  /v_result->>'field' = 'doc_type_name'[\s\S]*?'optionsCode', 'sales_order_document_type'/,
  'The document-type field must bind to the dedicated option-source code.',
);
assert.match(
  migration,
  /'doc_type_code', 'STD-SO'[\s\S]*?'doc_type_name', U&'\\6807\\51C6\\9500\\552E\\8BA2\\5355'/,
  'New sales orders must use a document-type default that belongs to the new source.',
);
assert.doesNotMatch(
  migration,
  /'optionsCode', 'document_status'/,
  'The sales-order document-type field must not reuse document_status.',
);
assert.match(
  migration,
  /\{props,name\}' = 'doc_type_name'[\s\S]*?'__lowcodeOptionsCode', 'sales_order_document_type'/,
  'The nested visual form model must retain the dedicated option-source code.',
);

console.log('Sales-order document-type option regression test passed.');
