import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style'
    },
    rollupOptions: {
      external: [
        'vue',
        '@vue-flow/core',
        '@enlearn/lowcode-framework/components/low-code-form',
        '@enlearn/lowcode-framework/components/json-dialog-input'
      ]
    }
  }
});
