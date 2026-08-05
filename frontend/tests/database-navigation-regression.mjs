import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutSource = await readFile(
  new URL('../layouts/dashboard.vue', import.meta.url),
  'utf8'
);
const routerSource = await readFile(new URL('../src/router.ts', import.meta.url), 'utf8');
const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260803190000_keep_file_management_in_advanced_tools.sql',
    import.meta.url
  ),
  'utf8'
);

assert.match(
  layoutSource,
  /collectNavigationRoots\(normalizedRoutes\.value, 'top-tool'\)/,
  'Top tools must be projected from database navigation metadata.'
);
assert.match(
  layoutSource,
  /collectNavigationRoots\(nodes, 'sidebar'\)/,
  'The sidebar must be projected independently from database navigation metadata.'
);
assert.doesNotMatch(
  layoutSource,
  /window\.addEventListener\('focus'/,
  'Changing browser focus must not reload unchanged database navigation.'
);
assert.match(
  layoutSource,
  /if \(routesReloadPromise\) return routesReloadPromise;/,
  'Concurrent database navigation refreshes must share one request.'
);
assert.match(
  migrationSource,
  /where route\.code = 'file-management'[\s\S]*advanced_root\.code = 'advanced-root'/,
  'File management must belong to the Advanced Functions route group.'
);
assert.match(
  migrationSource,
  /"group":"advanced"/,
  'File management metadata must identify the advanced group.'
);
assert.match(
  migrationSource,
  /"renderMode":"static"/,
  'File management must remain marked as a static page.'
);
assert.match(
  migrationSource,
  /page_code = null/,
  'The static file manager must not be bound to a low-code page.'
);
assert.match(
  routerSource,
  /path: '\/dashboard\/files'[\s\S]*import\('\.\.\/pages\/dashboard\/files\.vue'\)/,
  'The file manager must render its dedicated Vue page.'
);
const fileRouteLine = routerSource
  .split(/\r?\n/)
  .find((line) => line.includes("path: '/dashboard/files'"));
assert.ok(fileRouteLine, 'The file manager route must be registered.');
assert.doesNotMatch(
  fileRouteLine,
  /\[\.\.\.slug\]\.vue/,
  'The file manager must not be routed through the low-code catch-all renderer.'
);

console.log('Database navigation regression test passed.');
