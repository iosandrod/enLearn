import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { transform as transformWithEsbuild } from 'esbuild';

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};

  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return env;
      }

      const separatorIndex = trimmedLine.indexOf('=');

      if (separatorIndex === -1) {
        return env;
      }

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
const tldrawVueRoot = resolve(__dirname, '..', 'packages', 'tldraw-vue');
const tldrawVueSrcRoot = resolve(tldrawVueRoot, 'src');
const tldrawVuePackageSrc = (name: string) => resolve(tldrawVueRoot, 'packages', name, 'src', 'index.ts');
const tldrawVueDep = (name: string) => resolve(tldrawVueRoot, 'node_modules', ...name.split('/'));
const tldrawVueRootForVite = toVitePath(tldrawVueRoot);
const applicationVueJsxPlugin = {
  ...vueJsx({
    include: [
      `${toVitePath(__dirname)}/**/*.{jsx,tsx}`,
      `${toVitePath(lowcodeFrameworkRoot)}/**/*.{jsx,tsx}`
    ]
  }),
  name: 'enlearn-vue-jsx'
};
function isTldrawVueSourceId(id: string) {
  return toVitePath(id).startsWith(`${tldrawVueRootForVite}/`);
}
function disableDefaultVueJsxPlugin() {
  return {
    name: 'disable-default-vue-jsx',
    enforce: 'pre' as const,
    configResolved(config: { plugins: Array<{ name?: string; transform?: unknown }> }) {
      for (const plugin of config.plugins) {
        if (plugin.name !== 'vite:vue-jsx' || !plugin.transform) continue;

        if (typeof plugin.transform === 'function') {
          plugin.transform = () => null;
          continue;
        }

        if (typeof plugin.transform === 'object' && 'handler' in plugin.transform) {
          const transform = plugin.transform as {
            handler?: (this: unknown, code: string, id: string, ...args: unknown[]) => unknown;
          };
          if (typeof transform.handler !== 'function') continue;

          transform.handler = () => null;
        }
      }
    }
  };
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
            useDefineForClassFields: true
          }
        }
      });

      return {
        code: result.code,
        map: result.map
      };
    }
  };
}
const lowcodeComponentNames = [
  'LowCodeBlockChildren',
  'LowCodeBlockRenderer',
  'LowCodeForm',
  'LowCodeFormField',
  'LowCodeFormLayout',
  'LowCodeGrid',
  'LowCodePageRenderer',
  'LowCodeTreeItem',
  'LowCodeVisualDesigner',
  'VisualEditorProvider'
];
const lowcodeComponentAliases = Object.fromEntries(
  lowcodeComponentNames.flatMap((name) => {
    const target = resolve(lowcodeFrameworkRoot, 'components', `${name}.vue`);
    return [
      [`~/components/${name}`, target],
      [`~/components/${name}.vue`, target],
      [`@/components/${name}`, target],
      [`@/components/${name}.vue`, target]
    ];
  })
);

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  ssr: true,
  dir: {
    public: '../public'
  },
  routeRules: {
    '/signin': { ssr: false },
    '/signup': { ssr: false },
    '/auth/**': { ssr: false },
    '/dashboard/**': { ssr: false }
  },
  alias: {
    ...lowcodeComponentAliases,
    '@enlearn/lowcode-framework': lowcodeFrameworkRoot,
    '@enlearn/approval-workflow': approvalWorkflowRoot,
    '@enlearn/chat-widget': chatWidgetRoot,
    '@enlearn/trigger-workflow-editor': triggerWorkflowEditorRoot,
    '@enlearn/workflow-schema': workflowSchemaRoot,
    'tldraw-vue-phase-one': resolve(tldrawVueSrcRoot, 'index.ts'),
    'tldraw-vue-phase-one/style.css': resolve(tldrawVueSrcRoot, 'styles.css'),
    '@tldraw/editor': resolve(tldrawVueRoot, 'packages', 'editor', 'src', 'vue-core.ts'),
    '@tldraw/state': tldrawVuePackageSrc('state'),
    '@tldraw/state-react': tldrawVuePackageSrc('state-react'),
    '@tldraw/store': tldrawVuePackageSrc('store'),
    '@tldraw/tlschema': tldrawVuePackageSrc('tlschema'),
    '@tldraw/utils': tldrawVuePackageSrc('utils'),
    '@tldraw/validate': tldrawVuePackageSrc('validate'),
    '@/editor': resolve(tldrawVueSrcRoot, 'editor'),
    '@/print': resolve(tldrawVueSrcRoot, 'print'),
    '@/vue': resolve(tldrawVueSrcRoot, 'vue'),
    '@/components/shapes': resolve(tldrawVueSrcRoot, 'components', 'shapes'),
    '@floating-ui/dom': tldrawVueDep('@floating-ui/dom'),
    '@tiptap/core': tldrawVueDep('@tiptap/core'),
    '@tiptap/pm': tldrawVueDep('@tiptap/pm'),
    '@tiptap/react': tldrawVueDep('@tiptap/react'),
    classnames: tldrawVueDep('classnames'),
    eventemitter3: tldrawVueDep('eventemitter3'),
    idb: tldrawVueDep('idb'),
    'is-plain-object': tldrawVueDep('is-plain-object'),
    'lodash.isequal': tldrawVueDep('lodash.isequal'),
    'lodash.isequalwith': tldrawVueDep('lodash.isequalwith'),
    'lodash.throttle': tldrawVueDep('lodash.throttle'),
    'lodash.uniq': tldrawVueDep('lodash.uniq'),
    rbush: tldrawVueDep('rbush'),
    react: tldrawVueDep('react'),
    'react-dom/client': resolve(tldrawVueDep('react-dom'), 'client.js'),
    'react-dom': tldrawVueDep('react-dom'),
    '@vue-flow/core': resolve(
      __dirname,
      '..',
      'packages',
      'trigger-workflow-editor',
      'node_modules',
      '@vue-flow',
      'core'
    ),
    '@enlearn/approval-workflow/components': resolve(approvalWorkflowRoot, 'components'),
    '@enlearn/approval-workflow/hooks': resolve(approvalWorkflowRoot, 'hooks'),
    '@enlearn/approval-workflow/types': resolve(approvalWorkflowRoot, 'types'),
    '@enlearn/chat-widget/components': resolve(chatWidgetRoot, 'components'),
    '@enlearn/chat-widget/types': resolve(chatWidgetRoot, 'types'),
    '@enlearn/trigger-workflow-editor/components': resolve(triggerWorkflowEditorRoot, 'components'),
    '@enlearn/trigger-workflow-editor/schema': resolve(triggerWorkflowEditorRoot, 'schema'),
    '@enlearn/trigger-workflow-editor/compiler': resolve(triggerWorkflowEditorRoot, 'compiler'),
    '@enlearn/trigger-workflow-editor/templates': resolve(triggerWorkflowEditorRoot, 'templates'),
    '@enlearn/workflow-schema/schema': resolve(workflowSchemaRoot, 'schema'),
    '@enlearn/workflow-schema/validator': resolve(workflowSchemaRoot, 'validator'),
    '@/visual.config': resolve(lowcodeFrameworkRoot, 'visual.config.tsx'),
    '@/visual-editor': resolve(lowcodeFrameworkRoot, 'visual-editor'),
    '@/packages': resolve(lowcodeFrameworkRoot, 'packages'),
    '@/hooks/useGlobalProperties': resolve(lowcodeFrameworkRoot, 'hooks/useGlobalProperties.ts'),
    '@/hooks/useAnimate': resolve(lowcodeFrameworkRoot, 'hooks/useAnimate.ts'),
    '@/enums': resolve(lowcodeFrameworkRoot, 'enums'),
    '@/enums/httpEnum': resolve(lowcodeFrameworkRoot, 'enums/httpEnum.ts'),
    '~/core': resolve(lowcodeFrameworkRoot, 'core'),
    '~/runtime': resolve(lowcodeFrameworkRoot, 'runtime'),
    '~/lowcode': resolve(lowcodeFrameworkRoot, 'lowcode'),
    '~/types/lowcode': resolve(lowcodeFrameworkRoot, 'types/lowcode.ts'),
    '~/utils/lowcode': resolve(lowcodeFrameworkRoot, 'utils/lowcode.ts'),
    '~/utils/visual-to-lowcode': resolve(lowcodeFrameworkRoot, 'utils/visual-to-lowcode.ts'),
    '~/assets/styles/visual-editor-utilities.scss': resolve(
      lowcodeFrameworkRoot,
      'styles',
      'visual-editor-utilities.scss'
    ),
    'vue/jsx-runtime': resolve(__dirname, 'runtime/vue-jsx-runtime.ts')
  },
  css: [
    'normalize.css',
    'animate.css/animate.min.css',
    '~/assets/styles/app.css',
    '~/assets/styles/visual-editor-utilities.scss'
  ],
  vite: {
    plugins: [
      transformTldrawVueTsxPlugin(),
      disableDefaultVueJsxPlugin(),
      applicationVueJsxPlugin
    ],
    resolve: {
      alias: [
        { find: /^@\/editor(\/.*)?$/, replacement: `${resolve(tldrawVueSrcRoot, 'editor')}$1` },
        { find: /^@\/print(\/.*)?$/, replacement: `${resolve(tldrawVueSrcRoot, 'print')}$1` },
        { find: /^@\/vue(\/.*)?$/, replacement: `${resolve(tldrawVueSrcRoot, 'vue')}$1` },
        {
          find: /^@\/components\/shapes(\/.*)?$/,
          replacement: `${resolve(tldrawVueSrcRoot, 'components', 'shapes')}$1`
        }
      ],
      dedupe: ['vue', 'react', 'react-dom', 'vxe-pc-ui', 'vxe-table']
    },
    server: {
      fs: {
        allow: [resolve(__dirname, '..')]
      }
    },
    css: {
      modules: {
        localsConvention: 'camelCase'
      },
      preprocessorOptions: {
        scss: {
          charset: false
        }
      }
    }
  },
  runtimeConfig: {
    apiBaseUrl:
      env.NUXT_API_BASE_URL ??
      env.API_BASE_URL ??
      `http://localhost:${env.API_PORT ?? '3002'}/api`
  },
  typescript: {
    strict: false
  }
});
