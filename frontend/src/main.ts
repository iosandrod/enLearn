import { createApp, defineComponent } from 'vue';
import { install as installVxeUI } from 'vxe-pc-ui';
import VxeUITable, { VxeUI } from 'vxe-table';
import 'normalize.css';
import 'animate.css/animate.min.css';
import 'remixicon/fonts/remixicon.css';
import 'vxe-pc-ui/lib/style.css';
import 'vxe-table/lib/style.css';
import 'vxe-table-plugin-advanced-filter/style.css';
import 'vxe-table-plugin-search-panel/style.css';
import 'tldraw-vue-phase-one/style.css';
import '../assets/styles/app.css';
import '../assets/styles/visual-editor-utilities.scss';

import AdvancedFilterPlugin from 'vxe-table-plugin-advanced-filter';
import TableSearchPanel from 'vxe-table-plugin-search-panel';

import {
  LcVxeModalRenderer,
  LowCodeBlockChildren,
  LowCodeBlockRenderer,
  LowCodeForm,
  LowCodeFormField,
  LowCodeFormLayout,
  LowCodeGrid,
  LowCodeOverlayHost,
  LowCodePageRenderer,
  LowCodeTreeItem,
} from '../../packages/lowcode-framework/src/runtime/index.ts';
import {
  createLowCodeBrowserScriptExecutor,
  registerLowCodeScriptExecutor,
} from '../../packages/lowcode-framework/src/runtime/scripts.ts';
import {
  LowCodeVisualDesigner,
  VisualEditorProvider,
} from '../../packages/lowcode-framework/src/designer/index.ts';
import App from '../app.vue';
import ChatPopup from '../components/ChatPopup.vue';
import ContentRenderer from '../components/ContentRenderer.vue';
import DocsScreen from '../components/DocsScreen.vue';
import NotificationBell from '../components/NotificationBell.vue';
import SiteFooter from '../components/SiteFooter.vue';
import SiteHeader from '../components/SiteHeader.vue';
import ApprovalDesigner from '../../packages/approval-workflow/src/components/ApprovalDesigner.vue';
import TriggerWorkflowEditor from '../../packages/trigger-workflow-editor/src/components/TriggerWorkflowEditor.vue';
import TldrawVue from 'tldraw-vue-phase-one';
import {
  initializeSystemSettings,
  installSystemSettingsListeners,
} from '../composables/useSystemSettings';
import { installLowCodeScriptApis } from './lowcode-script-apis';
import { router } from './router';
import './mainStyle.ts'
const SERVICE_WORKER_RELOAD_KEY = 'enlearn_service_worker_cleanup_reloaded';
const PRELOAD_ERROR_RELOAD_KEY = 'enlearn_preload_error_reloaded_at';
const PRELOAD_ERROR_RELOAD_WINDOW_MS = 30_000;



function installPreloadErrorRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();

    const now = Date.now();
    const lastReload = Number(window.sessionStorage.getItem(PRELOAD_ERROR_RELOAD_KEY));
    if (Number.isFinite(lastReload) && now - lastReload < PRELOAD_ERROR_RELOAD_WINDOW_MS) {
      return;
    }

    window.sessionStorage.setItem(PRELOAD_ERROR_RELOAD_KEY, String(now));
    window.location.reload();
  });
}

async function cleanupLegacyServiceWorkers() {
  const supportsServiceWorkers = 'serviceWorker' in navigator;
  const supportsCacheStorage = 'caches' in window;
  if (!supportsServiceWorkers && !supportsCacheStorage) return;

  try {
    const registrations = supportsServiceWorkers
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    const cacheKeys = supportsCacheStorage ? await window.caches.keys() : [];
    if (!registrations.length && !cacheKeys.length) return;

    await Promise.all(registrations.map((registration) => registration.unregister()));
    await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));

    if (
      supportsServiceWorkers &&
      navigator.serviceWorker.controller &&
      window.sessionStorage.getItem(SERVICE_WORKER_RELOAD_KEY) !== '1'
    ) {
      window.sessionStorage.setItem(SERVICE_WORKER_RELOAD_KEY, '1');
      window.location.reload();
      await new Promise<void>(() => { });
    }
  } catch (error) {
    console.warn('Legacy service worker cleanup failed.', error);
  }
}

installPreloadErrorRecovery();
await cleanupLegacyServiceWorkers();

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_LOWCODE_SCRIPT_RUNTIME === 'browser'
) {
  registerLowCodeScriptExecutor(createLowCodeBrowserScriptExecutor());
  console.warn(
    '[LowCode] Browser script runtime enabled for local debugging. Scripts run in the page realm.',
  );
}

VxeUI.use(TableSearchPanel, {
  defaultExpanded: true,
});
VxeUI.use(AdvancedFilterPlugin, {
  autoEnable: true,
  caseSensitive: false,
  emptyLabel: '暂无',
  maxVisibleOptions: 500,
});

const app = createApp(App);
Object.defineProperty(window, '__LOWCODE_APP__', {
  configurable: true,
  enumerable: false,
  value: app,
});
const refs: Record<string, unknown> = {};
const ClientOnly = defineComponent({
  name: 'ClientOnly',
  setup(_, { slots }) {
    return () => slots.default?.() ?? null;
  },
});

app.use(router);
app.use(installVxeUI);
app.use(VxeUITable);

app.component('ChatPopup', ChatPopup);
app.component('ClientOnly', ClientOnly);
app.component('ContentRenderer', ContentRenderer);
app.component('DocsScreen', DocsScreen);
app.component('NotificationBell', NotificationBell);
app.component('SiteFooter', SiteFooter);
app.component('SiteHeader', SiteHeader);
app.component('LcVxeModalRenderer', LcVxeModalRenderer);
app.component('LowCodeBlockChildren', LowCodeBlockChildren);
app.component('LowCodeBlockRenderer', LowCodeBlockRenderer);
app.component('LowCodeForm', LowCodeForm);
app.component('LowCodeFormField', LowCodeFormField);
app.component('LowCodeFormLayout', LowCodeFormLayout);
app.component('LowCodeGrid', LowCodeGrid);
app.component('LowCodeOverlayHost', LowCodeOverlayHost);
app.component('LowCodePageRenderer', LowCodePageRenderer);
app.component('LowCodeTreeItem', LowCodeTreeItem);
app.component('LowCodeVisualDesigner', LowCodeVisualDesigner);
app.component('ApprovalDesigner', ApprovalDesigner);
app.component('TriggerWorkflowEditor', TriggerWorkflowEditor);
// Database-backed print designer materials resolve this host component by name.
app.component('TldrawVue', TldrawVue);
app.component('VisualEditorProvider', VisualEditorProvider);

app.config.globalProperties.$$refs = refs;
window.$$refs = refs;

installSystemSettingsListeners();
installLowCodeScriptApis();
await initializeSystemSettings().catch((error) => {
  console.warn('System settings initialization failed.', error);
});

app.mount('#app');
