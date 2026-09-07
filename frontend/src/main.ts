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
const DEV_SERVICE_WORKER_RELOAD_KEY = 'enlearn_dev_service_worker_reloaded';



async function cleanupDevServiceWorkers() {
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) return;

    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
    }

    if (
      navigator.serviceWorker.controller &&
      window.sessionStorage.getItem(DEV_SERVICE_WORKER_RELOAD_KEY) !== '1'
    ) {
      window.sessionStorage.setItem(DEV_SERVICE_WORKER_RELOAD_KEY, '1');
      window.location.reload();
      await new Promise<void>(() => { });
    }
  } catch (error) {
    console.warn('Dev service worker cleanup failed.', error);
  }
}

await cleanupDevServiceWorkers();

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
