import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const controllerSource = readFileSync(resolve(__dirname, 'auth.controller.ts'), 'utf8');
const dtoSource = readFileSync(resolve(__dirname, 'auth.dto.ts'), 'utf8');
const serviceSource = readFileSync(resolve(__dirname, 'auth.service.ts'), 'utf8');

assert.doesNotMatch(controllerSource, /dev-impersonate|impersonateDevUser/);
assert.doesNotMatch(dtoSource, /DevImpersonateAuthDto/);
assert.doesNotMatch(serviceSource, /impersonateDevUser|generateLink|verifyOtp/);

console.log('auth development impersonation route removal tests passed');
