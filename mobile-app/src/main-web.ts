import { HippyWebEngine } from '@hippy/web-renderer';

import {
  configureRuntime,
  getRuntimeConfig,
  getWebPreviewConfig,
} from './config';

async function startWebPreview() {
  const query = new URLSearchParams(window.location.search);
  const queryPageCode = (
    query.get('page')
    ?? query.get('pageCode')
    ?? query.get('code')
    ?? ''
  ).trim();
  const queryPath = (query.get('path') ?? '/').trim() || '/';
  const runtimeConfig = {
    ...getRuntimeConfig(),
    ...getWebPreviewConfig(),
    ...(queryPageCode ? { pageCode: queryPageCode } : {}),
  };
  configureRuntime(runtimeConfig);

  await import('./main-native');

  const engine = HippyWebEngine.create({
    modules: {},
    components: {},
  });

  engine.start({
    id: 'app',
    name: 'EnLearnMobile',
    params: {
      path: queryPath,
      ...runtimeConfig,
    },
  });
}

void startWebPreview().catch((error) => {
  console.error('Failed to start EnLearn mobile Web preview.', error);
});
