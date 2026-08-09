import { defineConfig } from '@trigger.dev/sdk';
import { additionalFiles } from '@trigger.dev/build/extensions/core';

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
      })
    ]
  }
});
