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
      `http://localhost:${env.API_PORT ?? '3002'}/api`,
    public: {
      supabaseUrl:
        env.NUXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey:
        env.NUXT_PUBLIC_SUPABASE_ANON_KEY ??
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        ''
    }
  },
  typescript: {
    strict: false
  }
});
