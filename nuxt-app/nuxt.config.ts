import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vueJsx from '@vitejs/plugin-vue-jsx';

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

const parentEnv = readEnvFile(resolve(__dirname, '..', '.env.local'));
const env = { ...parentEnv, ...process.env };
const lowcodeFrameworkRoot = resolve(__dirname, '..', 'packages', 'lowcode-framework', 'src');
const approvalWorkflowRoot = resolve(__dirname, '..', 'packages', 'approval-workflow', 'src');
const triggerWorkflowEditorRoot = resolve(__dirname, '..', 'packages', 'trigger-workflow-editor', 'src');
const workflowSchemaRoot = resolve(__dirname, '..', 'packages', 'workflow-schema', 'src');
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
    '@enlearn/trigger-workflow-editor': triggerWorkflowEditorRoot,
    '@enlearn/workflow-schema': workflowSchemaRoot,
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
    plugins: [vueJsx()],
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
