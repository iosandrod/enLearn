import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pageSource, schemaSource, authSource, fetchSource] = await Promise.all([
  readFile(new URL('../pages/signin.vue', import.meta.url), 'utf8'),
  readFile(new URL('../schemas/auth.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/auth/auth.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/spa-compat.ts', import.meta.url), 'utf8'),
]);

assert.doesNotMatch(pageSource, /1\s*\/\s*2|2\s*\/\s*2|step === 'account'/);
assert.match(schemaSource, /field: 'accountId'[\s\S]*?component: 'vxe-select'/);
assert.match(pageSource, /:option-sources="accountOptionSources"/);
assert.match(pageSource, /query: \{ login \}/);
assert.match(pageSource, /if \(!login\) \{[\s\S]*?accountOptionsLoading\.value = false;/);
assert.match(pageSource, /accountId,[\s\S]*?setDefault: preferSelectedAccount\.value/);
assert.match(authSource, /async listLoginAccountOptions\(login\?: string\)/);
assert.match(authSource, /auth\.admin\.listUsers/);
assert.match(authSource, /admin\.rpc\('get_login_account_options'/);
assert.match(authSource, /if \(dto\.accountId && data\.session\?\.access_token\)/);
assert.match(authSource, /this\.selectAccount\([\s\S]*?accountId: dto\.accountId/);
assert.match(fetchSource, /!apiPath\.startsWith\('\/auth\/account-options'\)/);

const [accountServiceSource, accountStateSource, removalMigrationSource] = await Promise.all([
  readFile(new URL('../../api/src/account-service/account.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../composables/useAuthState.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260804160000_remove_personal_accounts.sql', import.meta.url), 'utf8'),
]);

assert.doesNotMatch(accountServiceSource, /get_personal_account|personalAccount|personal_account/);
assert.doesNotMatch(accountStateSource, /personal_account/);
assert.match(removalMigrationSource, /drop trigger if exists on_auth_user_created_basejump_account/);
assert.match(removalMigrationSource, /from basejump\.accounts[\s\S]*?personal_account = true/);
assert.match(removalMigrationSource, /delete from basejump\.accounts[\s\S]*?id = any\(personal_account_ids\)/);
assert.match(removalMigrationSource, /accounts\.personal_account = false/);

const [dashboardSource, appStyleSource] = await Promise.all([
  readFile(new URL('../layouts/dashboard.vue', import.meta.url), 'utf8'),
  readFile(new URL('../assets/styles/app.css', import.meta.url), 'utf8'),
]);

assert.match(
  dashboardSource,
  /admin-account-switcher__item-code[\s\S]*?:title="account\.code \?\? '---'"/,
  'Account codes should expose the complete value when space is constrained.',
);
assert.match(
  dashboardSource,
  /admin-account-switcher__item-state/,
  'Every account row should reserve a stable state column.',
);
assert.match(
  appStyleSource,
  /\.admin-account-switcher__list > button \{[\s\S]*?grid-template-columns:\s*108px minmax\(0, 1fr\) minmax\(18px, auto\);/,
  'Account rows should reserve enough width for long account codes.',
);
assert.match(
  appStyleSource,
  /\.admin-account-switcher__item-code \{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
  'Account code badges must not overflow into account metadata.',
);
assert.match(
  appStyleSource,
  /\.admin-account-switcher__item-meta strong \{[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis;/,
  'Long account names should remain inside the metadata column.',
);

console.log('Account sign-in and switcher regression test passed.');
