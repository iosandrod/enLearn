import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const entrypoints = ['../main.ts', '../standalone.ts'];

for (const entrypoint of entrypoints) {
  const source = readFileSync(resolve(__dirname, entrypoint), 'utf8');

  assert.match(
    source,
    /app\.useBodyParser\(['"]json['"],\s*\{\s*limit:\s*['"]20mb['"]\s*\}\);/,
    `${entrypoint} must accept JSON request bodies up to 20mb`
  );
  assert.match(
    source,
    /app\.useBodyParser\(['"]urlencoded['"],\s*\{\s*limit:\s*['"]20mb['"],\s*extended:\s*true\s*\}\);/,
    `${entrypoint} must accept URL-encoded request bodies up to 20mb`
  );
}

console.log('request body limit configuration tests passed');
