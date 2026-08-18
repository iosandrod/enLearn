import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiRoot = process.cwd().toLowerCase().endsWith('api')
  ? process.cwd()
  : resolve(process.cwd(), 'api');
const source = readFileSync(resolve(apiRoot, 'src/admin-service/admin.service.ts'), 'utf8');

assert.match(
  source,
  /resolveNavigationAuthorization[\s\S]*?getUserAuthorization\([\s\S]*?refresh: true/,
  'Navigation authorization must refresh permission assignments for an existing login session.'
);
assert.match(
  source,
  /method === 'listNavigationRoutes'[\s\S]*?return this\.listNavigationRoutes\(context\)/,
  'The explicit navigation endpoint must remain available to dashboard clients.'
);

console.log('admin navigation refresh contract tests passed');
