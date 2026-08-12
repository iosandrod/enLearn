import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { defineConfig } from 'vite';
import { transform as transformWithEsbuild } from 'esbuild';

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};

  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return env;
      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) return env;
      const key = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      env[key] = rawValue.replace(/^["']|["']$/g, '');
      return env;
    }, {});
}

const toVitePath = (filePath: string) => filePath.replace(/\\/g, '/');
const parentEnv = readEnvFile(resolve(__dirname, '..', '.env.local'));
const env = { ...parentEnv, ...process.env };
const lowcodeFrameworkRoot = resolve(__dirname, '..', 'packages', 'lowcode-framework', 'src');
const approvalWorkflowRoot = resolve(__dirname, '..', 'packages', 'approval-workflow', 'src');
const chatWidgetRoot = resolve(__dirname, '..', 'packages', 'chat-widget', 'src');
const triggerWorkflowEditorRoot = resolve(__dirname, '..', 'packages', 'trigger-workflow-editor', 'src');
const workflowSchemaRoot = resolve(__dirname, '..', 'packages', 'workflow-schema', 'src');
const areaPluginRoot = resolve(__dirname, '..', 'packages', 'area-plugin');
const tableSearchPluginRoot = resolve(__dirname, '..', 'packages', 'table-search-plugin');
const ganttRoot = resolve(__dirname, '..', 'packages', 'gantt-main');
const tldrawVueRoot = resolve(__dirname, '..', 'packages', 'tldraw-vue');
const tldrawVueSrcRoot = resolve(tldrawVueRoot, 'src');
const tldrawVueEntry = existsSync(resolve(tldrawVueSrcRoot, 'index.ts'))
  ? resolve(tldrawVueSrcRoot, 'index.ts')
  : resolve(__dirname, 'src', 'stubs', 'tldraw-vue-phase-one.tsx');
const tldrawVueStyle = existsSync(resolve(tldrawVueSrcRoot, 'styles.css'))
  ? resolve(tldrawVueSrcRoot, 'styles.css')
  : resolve(__dirname, 'src', 'stubs', 'tldraw-vue-phase-one.css');
const tldrawVuePackageSrc = (name: string) => resolve(tldrawVueRoot, 'packages', name, 'src', 'index.ts');
const tldrawVueDep = (name: string) => resolve(tldrawVueRoot, 'node_modules', ...name.split('/'));
const tldrawVueRootForVite = toVitePath(tldrawVueRoot);

function isTldrawVueSourceId(id: string) {
  return toVitePath(id).startsWith(`${tldrawVueRootForVite}/`);
}

function transformTldrawVueTsxPlugin() {
  return {
    name: 'transform-tldraw-vue-tsx',
    enforce: 'pre' as const,
    async transform(code: string, id: string) {
      const [filePath] = id.split('?');
      if (!filePath.endsWith('.tsx') || !isTldrawVueSourceId(filePath)) return null;

      const result = await transformWithEsbuild(code, {
        loader: 'tsx',
        target: 'es2022',
        jsx: 'automatic',
        jsxImportSource: 'react',
        sourcefile: filePath,
        sourcemap: true,
        tsconfigRaw: {
          compilerOptions: {
            experimentalDecorators: true,
            jsx: 'react-jsx',
            useDefineForClassFields: true,
          },
        },
      });

      return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  publicDir: resolve(__dirname, '..', 'public'),
  define: {
    'import.meta.server': 'false',
    'import.meta.client': 'true',
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      env.VITE_API_BASE_URL ??
        env.NUXT_API_BASE_URL ??
        env.API_BASE_URL ??
        `http://localhost:${env.API_PORT ?? '3002'}/api`,
    ),
    'import.meta.env.VITE_SOCKET_BASE_URL': JSON.stringify(
      env.VITE_SOCKET_BASE_URL ?? `http://localhost:${env.API_PORT ?? '3002'}`,
    ),
  },
  plugins: [
    transformTldrawVueTsxPlugin(),
    tailwindcss(),
    vue(),
    vueJsx({
      include: [`${toVitePath(__dirname)}/**/*.{jsx,tsx}`, `${toVitePath(lowcodeFrameworkRoot)}/**/*.{jsx,tsx}`],
    }),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        {
          '@/src/spa-compat': [
            '$fetch',
            'createError',
            'navigateTo',
            'useAsyncData',
            'useSeoMeta',
            'useState',
          ],
        },
      ],
      dirs: ['./composables'],
      dts: './src/auto-imports.d.ts',
      vueTemplate: true,
    }),
    Components({
      dirs: ['./components', resolve(lowcodeFrameworkRoot, 'components')],
      dts: './src/components.d.ts',
    }),
  ],
  resolve: {
    alias: [
      { find: /^~\/lowcode(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/lowcode$1` },
      { find: /^@\/lowcode(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/lowcode$1` },
      { find: /^~\/packages(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/packages$1` },
      { find: /^@\/packages(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/packages$1` },
      { find: /^~\/visual-editor(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/visual-editor$1` },
      { find: /^@\/visual-editor(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/visual-editor$1` },
      { find: /^~\/hooks(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/hooks$1` },
      { find: /^@\/hooks(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/hooks$1` },
      { find: /^~\/enums(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/enums$1` },
      { find: /^@\/enums(\/.*)?$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/enums$1` },
      { find: /^~\/utils\/(lowcode|visual-to-lowcode)$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/utils/$1.ts` },
      { find: /^@\/utils\/(lowcode|visual-to-lowcode)$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/utils/$1.ts` },
      { find: /^~\/types\/lowcode$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/types/lowcode.ts` },
      { find: /^@\/types\/lowcode$/, replacement: `${toVitePath(lowcodeFrameworkRoot)}/types/lowcode.ts` },
      { find: '@enlearn/lowcode-framework/runtime/global-dialog', replacement: resolve(lowcodeFrameworkRoot, 'runtime', 'global-dialog.ts') },
      { find: '@enlearn/lowcode-framework/runtime/global-drawer', replacement: resolve(lowcodeFrameworkRoot, 'runtime', 'global-drawer.ts') },
      { find: '@enlearn/lowcode-framework/runtime/lowcode-context-drawer', replacement: resolve(lowcodeFrameworkRoot, 'runtime', 'lowcode-context-drawer.tsx') },
      { find: '@enlearn/lowcode-framework/runtime/page-reference-dialog', replacement: resolve(lowcodeFrameworkRoot, 'runtime', 'page-reference-dialog.tsx') },
      { find: '@enlearn/lowcode-framework/runtime/directives', replacement: resolve(lowcodeFrameworkRoot, 'runtime', 'directives.ts') },
      { find: '@enlearn/lowcode-framework/runtime/scripts', replacement: resolve(lowcodeFrameworkRoot, 'runtime', 'scripts.ts') },
      { find: '@enlearn/lowcode-framework/runtime', replacement: resolve(lowcodeFrameworkRoot, 'runtime', 'index.ts') },
      { find: '@enlearn/lowcode-framework/designer/design-dialog', replacement: resolve(lowcodeFrameworkRoot, 'designer', 'design-dialog.ts') },
      { find: '@enlearn/lowcode-framework/designer', replacement: resolve(lowcodeFrameworkRoot, 'designer', 'index.ts') },
      { find: '@enlearn/lowcode-framework/materials', replacement: resolve(lowcodeFrameworkRoot, 'materials', 'index.ts') },
      { find: '@enlearn/lowcode-framework/core/host', replacement: resolve(lowcodeFrameworkRoot, 'core', 'host.ts') },
      { find: '@enlearn/lowcode-framework/core', replacement: resolve(lowcodeFrameworkRoot, 'core', 'index.ts') },
      { find: '@enlearn/lowcode-framework/types/lowcode', replacement: resolve(lowcodeFrameworkRoot, 'types', 'lowcode.ts') },
      { find: '@enlearn/lowcode-framework/lowcode/schema', replacement: resolve(lowcodeFrameworkRoot, 'lowcode', 'schema.ts') },
      { find: '@enlearn/lowcode-framework/components/low-code-form', replacement: resolve(lowcodeFrameworkRoot, 'components', 'LowCodeForm.vue') },
      { find: '@enlearn/lowcode-framework/components/json-dialog-input', replacement: resolve(lowcodeFrameworkRoot, 'components', 'JsonDialogInput.vue') },
      { find: '@enlearn/lowcode-framework', replacement: lowcodeFrameworkRoot },
      { find: '@enlearn/approval-workflow', replacement: approvalWorkflowRoot },
      { find: '@enlearn/chat-widget', replacement: chatWidgetRoot },
      { find: '@enlearn/trigger-workflow-editor', replacement: triggerWorkflowEditorRoot },
      { find: '@enlearn/workflow-schema', replacement: workflowSchemaRoot },
      { find: '@svar-ui/vue-gantt/style.css', replacement: resolve(ganttRoot, 'vue', 'src', 'runtime-style.ts') },
      { find: '@svar-ui/vue-gantt', replacement: resolve(ganttRoot, 'vue', 'src', 'index.ts') },
      { find: '@svar-ui/gantt-locales', replacement: resolve(ganttRoot, 'locales', 'index.ts') },
      { find: '@svar-ui/gantt-store', replacement: resolve(ganttRoot, 'store', 'src', 'index.ts') },
      {
        find: /^vxe-table-plugin-extend-cell-area\/style\.css$/,
        replacement: resolve(areaPluginRoot, 'dist', 'style.css'),
      },
      {
        find: /^vxe-table-plugin-extend-cell-area$/,
        replacement: resolve(areaPluginRoot, 'dist', 'index.js'),
      },
      {
        find: /^vxe-table-plugin-search-panel\/style\.css$/,
        replacement: resolve(tableSearchPluginRoot, 'dist', 'style.css'),
      },
      {
        find: /^vxe-table-plugin-search-panel$/,
        replacement: resolve(tableSearchPluginRoot, 'dist', 'index.js'),
      },
      { find: 'tldraw-vue-phase-one/style.css', replacement: tldrawVueStyle },
      { find: 'tldraw-vue-phase-one', replacement: tldrawVueEntry },
      { find: 'echarts', replacement: resolve(__dirname, 'node_modules', 'echarts') },
      { find: '@tldraw/editor', replacement: resolve(tldrawVueRoot, 'packages', 'editor', 'src', 'vue-core.ts') },
      { find: '@tldraw/state', replacement: tldrawVuePackageSrc('state') },
      { find: '@tldraw/state-react', replacement: tldrawVuePackageSrc('state-react') },
      { find: '@tldraw/store', replacement: tldrawVuePackageSrc('store') },
      { find: '@tldraw/tlschema', replacement: tldrawVuePackageSrc('tlschema') },
      { find: '@tldraw/utils', replacement: tldrawVuePackageSrc('utils') },
      { find: '@tldraw/validate', replacement: tldrawVuePackageSrc('validate') },
      { find: '@floating-ui/dom', replacement: tldrawVueDep('@floating-ui/dom') },
      { find: '@tiptap/core', replacement: tldrawVueDep('@tiptap/core') },
      { find: '@tiptap/pm', replacement: tldrawVueDep('@tiptap/pm') },
      { find: '@tiptap/react', replacement: tldrawVueDep('@tiptap/react') },
      { find: 'classnames', replacement: tldrawVueDep('classnames') },
      { find: 'eventemitter3', replacement: tldrawVueDep('eventemitter3') },
      { find: 'idb', replacement: tldrawVueDep('idb') },
      { find: 'is-plain-object', replacement: tldrawVueDep('is-plain-object') },
      { find: 'lodash.isequal', replacement: tldrawVueDep('lodash.isequal') },
      { find: 'lodash.isequalwith', replacement: tldrawVueDep('lodash.isequalwith') },
      { find: 'lodash.throttle', replacement: tldrawVueDep('lodash.throttle') },
      { find: 'lodash.uniq', replacement: tldrawVueDep('lodash.uniq') },
      { find: 'rbush', replacement: tldrawVueDep('rbush') },
      { find: 'react-dom/client', replacement: resolve(tldrawVueDep('react-dom'), 'client.js') },
      { find: 'react-dom', replacement: tldrawVueDep('react-dom') },
      { find: 'react', replacement: tldrawVueDep('react') },
      {
        find: '@vue-flow/core',
        replacement: resolve(__dirname, '..', 'packages', 'trigger-workflow-editor', 'node_modules', '@vue-flow', 'core'),
      },
      { find: 'vue/jsx-runtime', replacement: resolve(__dirname, 'runtime/vue-jsx-runtime.tsx') },
      { find: /^@\/editor(\/.*)?$/, replacement: `${resolve(tldrawVueSrcRoot, 'editor')}$1` },
      { find: /^@\/print(\/.*)?$/, replacement: `${resolve(tldrawVueSrcRoot, 'print')}$1` },
      { find: /^@\/vue(\/.*)?$/, replacement: `${resolve(tldrawVueSrcRoot, 'vue')}$1` },
      { find: /^@\/components\/shapes(\/.*)?$/, replacement: `${resolve(tldrawVueSrcRoot, 'components', 'shapes')}$1` },
      { find: '~', replacement: __dirname },
      { find: '@', replacement: __dirname },
    ],
    dedupe: ['vue', 'react', 'react-dom', '@vxe-ui/core', 'vxe-pc-ui', 'vxe-table', '@svar-ui/lib-dom', '@svar-ui/lib-state', '@svar-ui/lib-vue'],
  },
  optimizeDeps: {
    include: ['vue', 'vue-router'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: env.VITE_API_BASE_URL ?? env.NUXT_API_BASE_URL ?? env.API_BASE_URL ?? `http://localhost:${env.API_PORT ?? '3002'}/api`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
    preprocessorOptions: {
      scss: {
        charset: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
  },
});
