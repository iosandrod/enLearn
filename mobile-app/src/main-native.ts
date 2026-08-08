import {
  BackAndroid,
  createApp,
  EventBus,
  setScreenSize,
  type HippyApp,
} from '@hippy/vue-next';

import App from './app.vue';
import {
  configureRuntime,
  getRuntimeConfig,
  readMobileStorage,
  updateRuntimeAuth,
} from './config';
import { createRouter } from './routes';
import { consumeMobileBackRequest } from './runtime/mobile-back';

globalThis.Hippy?.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Hippy exception', error);
});

globalThis.Hippy?.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Hippy rejection', reason);
});

const app: HippyApp = createApp(App, {
  appName: 'EnLearnMobile',
  iPhone: {
    statusBar: {
      backgroundColor: 4294967295,
    },
  },
  trimWhitespace: true,
});

const router = createRouter();
app.use(router);

EventBus.$on('onSizeChanged', (size: { width?: number; height?: number }) => {
  if (size.width && size.height) {
    setScreenSize({ width: size.width, height: size.height });
  }
});

app.$start().then(async ({ superProps }) => {
  configureRuntime({ superProps });
  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig.accessToken || !runtimeConfig.accountId) {
    const [accessToken, accountId, userId] = await Promise.all([
      readMobileStorage('accessToken'),
      readMobileStorage('accountId'),
      readMobileStorage('userId'),
    ]);
    updateRuntimeAuth(
      runtimeConfig.accessToken || accessToken,
      runtimeConfig.accountId || accountId,
      runtimeConfig.userId || userId,
    );
  }
  const initialPath = typeof superProps?.path === 'string' ? superProps.path.trim() : '';
  await router.push(initialPath || '/');

  BackAndroid.addListener(() => {
    if (consumeMobileBackRequest()) return true;
    if (router.currentRoute.value.path !== '/') {
      router.back();
      return true;
    }

    return false;
  });

  app.mount('#root');
}).catch((error) => {
  console.error('Failed to start EnLearn mobile app.', error);
});
