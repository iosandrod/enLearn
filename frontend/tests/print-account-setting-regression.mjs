import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, header, router, definitions, migration] = await Promise.all([
  readFile(new URL('../pages/print-account-setting.vue', import.meta.url), 'utf8'),
  readFile(new URL('../components/PrintDesignerHeader.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/router.ts', import.meta.url), 'utf8'),
  readFile(new URL('../utils/lowCodeFormDefinitions.ts', import.meta.url), 'utf8'),
  readFile(
    new URL('../../supabase/migrations/20260921130000_print_account_setting_form.sql', import.meta.url),
    'utf8',
  ),
]);

assert.match(
  router,
  /path: '\/print-account-setting'[\s\S]*?layout: false[\s\S]*?auth: true/,
  'The print account settings page must have its own authenticated standalone route.',
);
assert.match(header, /to="\/print-account-setting"[\s\S]*?账号设置/);
assert.match(definitions, /printAccountSetting: 'print-account-setting'/);
assert.match(page, /<LowCodeForm[\s\S]*?:schema="formSchema"/);
assert.match(
  page,
  /loadLowCodeFormDefinition\([\s\S]*?LOW_CODE_FORM_CODES\.printAccountSetting/,
  'The account form schema must be loaded from the low-code database registry.',
);
assert.match(page, /serviceApi\.invoke\('user', 'updateProfile'/);
assert.match(page, /serviceApi\.invoke\('user', 'updateEmail'/);
assert.match(
  migration,
  /insert into public\.lowcode_form_definitions[\s\S]*?'print-account-setting'[\s\S]*?"field": "fullName"[\s\S]*?"field": "email"/,
  'The low-code account form definition must be persisted by a database migration.',
);

console.log('Print account setting regression test passed.');
