import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const controllerSource = readFileSync(resolve(__dirname, 'auth.controller.ts'), 'utf8');
const dtoSource = readFileSync(resolve(__dirname, 'auth.dto.ts'), 'utf8');
const serviceSource = readFileSync(resolve(__dirname, 'auth.service.ts'), 'utf8');

assert.doesNotMatch(controllerSource, /dev-impersonate|impersonateDevUser/);
assert.doesNotMatch(dtoSource, /DevImpersonateAuthDto/);
assert.doesNotMatch(serviceSource, /impersonateDevUser|generateLink|verifyOtp/);

assert.match(controllerSource, /@Get\('lowcode-materials'\)[\s\S]*listPublishedLowCodeMaterials\(\)/);
assert.match(controllerSource, /@Get\('lowcode-catalog'\)[\s\S]*listPublicLowCodeCatalog\(\)/);
assert.match(serviceSource, /async listPublishedLowCodeMaterials\(\)/);
assert.match(serviceSource, /async listPublicLowCodeCatalog\(\)/);
assert.match(serviceSource, /\.from\('lowcode_materials'\)/);
assert.match(serviceSource, /\.from\('lowcode_form_definitions'\)/);
assert.match(serviceSource, /\.eq\('enabled', true\)[\s\S]*\.eq\('status', 'published'\)/);
assert.match(serviceSource, /\.order\('material_kind',[\s\S]*\.order\('sort_order',[\s\S]*\.order\('code',/);
assert.match(serviceSource, /PUBLIC_CATALOG_PAGE_SIZE = 1000/);
assert.match(serviceSource, /\.range\(from, to\)/);
assert.match(serviceSource, /return \{ materials, formDefinitions \}/);

console.log('auth route regression tests passed');
