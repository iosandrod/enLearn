import { defineConfig } from '@trigger.dev/sdk';
import { additionalFiles } from '@trigger.dev/build/extensions/core';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const quickJsWasmAtBundleRoot: ReturnType<typeof additionalFiles> = {
  name: 'quickjs-wasm-at-bundle-root',
  async onBuildComplete(context, manifest) {
    const source = join(
      context.workingDir,
      'node_modules',
      '@jitl',
      'quickjs-wasmfile-release-sync',
      'dist',
      'emscripten-module.wasm'
    );
    const destination = join(manifest.outputPath, 'emscripten-module.wasm');
    await copyFile(source, destination);
    context.logger.debug('[quickjs-wasm-at-bundle-root] Copied QuickJS WASM', destination);
  }
};

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? '',
  maxDuration: 3600,
  dirs: ['./src/workflow/trigger'],
  build: {
    extensions: [
      additionalFiles({
        files: [
          './src/planning-service/execution/frepple-engine.py',
          './src/planning-service/execution/frepple-sidecar.py'
        ]
      }),
      quickJsWasmAtBundleRoot
    ]
  }
});
