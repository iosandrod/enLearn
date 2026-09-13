import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const workspaceDir = resolve(import.meta.dirname, '../..');
const apiSchemaPath = join(workspaceDir, 'api/src/lowcode-service/lowcode.schema.ts');
const frameworkSchemaPath = join(
  workspaceDir,
  'packages/lowcode-framework/src/lowcode/schema.ts',
);
const fixture = {
  schemaVersion: 1,
  code: 'dependency-test',
  route: '/dependency-test',
  title: 'Dependency test',
  dataSources: {
    record: {
      key: 'record',
      serviceName: 'test',
      serviceMethod: 'listItems',
      autoLoad: true,
    },
    options: {
      key: 'options',
      serviceName: 'test',
      serviceMethod: 'listOptions',
      loadAfterSourceKeys: ['record'],
      autoLoad: true,
    },
  },
  blocks: [],
};
const missingBlockSourceFixture = {
  ...fixture,
  blocks: [{
    id: 'missing-source-form',
    kind: 'form',
    sourceKey: 'missing',
    dataSource: {
      key: 'mismatched-form-source',
      serviceName: '',
      serviceMethod: '',
    },
    schema: {
      fields: [{ field: 'name', label: 'Name', component: 'vxe-input' }],
      actions: [],
    },
  }],
};
async function loadSchemaModule(entryPoint, stubBlockMaterials = false) {
  const outputDir = await mkdtemp(join(tmpdir(), 'lowcode-dependencies-'));
  const outputFile = join(outputDir, 'schema.mjs');
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outputFile,
    plugins: stubBlockMaterials
      ? [{
          name: 'stub-block-materials',
          setup(buildContext) {
            buildContext.onResolve({ filter: /^\.\/block-materials$/ }, () => ({
              path: 'block-materials',
              namespace: 'test-stub',
            }));
            buildContext.onLoad({ filter: /.*/, namespace: 'test-stub' }, () => ({
              contents: 'export function getLowCodeBlockMaterial(type) { return type ? { type } : undefined; }',
              loader: 'js',
            }));
          },
        }]
      : [],
  });
  const module = await import(`${pathToFileURL(outputFile).href}?t=${Date.now()}`);
  return { module, outputDir };
}

const apiBundle = await loadSchemaModule(apiSchemaPath);
const frameworkBundle = await loadSchemaModule(frameworkSchemaPath, true);

try {
  for (const [moduleName, schemaModule] of [
    ['api', apiBundle.module],
    ['framework', frameworkBundle.module],
  ]) {
    const normalized = schemaModule.normalizeLowCodePageSchema(fixture);
    assert.deepEqual(normalized.dataSources.options.loadAfterSourceKeys, ['record']);
    assert.deepEqual(schemaModule.validateLowCodePageSchema(normalized), []);

    const missingDependency = structuredClone(normalized);
    missingDependency.dataSources.options.loadAfterSourceKeys = ['missing'];
    assert.deepEqual(
      schemaModule.validateLowCodePageSchema(missingDependency)
        .filter((issue) => issue.path.startsWith('dataSources.')),
      [],
      `${moduleName}: lowcode_pages data-source dependencies must not be schema validation errors.`,
    );

    const cyclicDependency = structuredClone(normalized);
    cyclicDependency.dataSources.record.loadAfterSourceKeys = ['options'];
    assert.deepEqual(
      schemaModule.validateLowCodePageSchema(cyclicDependency)
        .filter((issue) => issue.path.startsWith('dataSources.')),
      [],
      `${moduleName}: lowcode_pages data-source cycles must not be schema validation errors.`,
    );

    const missingBlockIssues = schemaModule.validateLowCodePageSchema(missingBlockSourceFixture);
    assert.equal(
      missingBlockIssues.some((issue) => (
        issue.path === 'blocks.0.sourceKey'
        || issue.path.startsWith('blocks.0.dataSource.')
      )),
      false,
      `${moduleName}: ${JSON.stringify(missingBlockIssues)}`,
    );

  }

  console.log('Low-code data-source validation removal regression test passed.');
} finally {
  await Promise.all([
    rm(apiBundle.outputDir, { recursive: true, force: true }),
    rm(frameworkBundle.outputDir, { recursive: true, force: true }),
  ]);
}
