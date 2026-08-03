import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? '',
  maxDuration: 3600,
  dirs: ['./src/workflow/trigger']
});
