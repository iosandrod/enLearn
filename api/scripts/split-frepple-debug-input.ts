import { readFile, writeFile } from 'node:fs/promises';

async function main() {
  const input = JSON.parse(await readFile('../artifacts/electronics-frepple-request.json', 'utf8'));
  await Promise.all([
    writeFile('../artifacts/electronics-model-debug.json', JSON.stringify(input.model)),
    writeFile('../artifacts/electronics-request-bridge-debug.json', JSON.stringify({
      bucketDates: input.bucketDates,
      bucketizedResources: input.bucketizedResources,
      parameters: input.parameters
    }))
  ]);
}

void main();
