import { createApp, defineComponent } from 'vue';
import VxeUI from 'vxe-pc-ui';
import VxeUITable from 'vxe-table';
import 'normalize.css';
import 'animate.css/animate.min.css';
import 'remixicon/fonts/remixicon.css';
import 'vxe-pc-ui/lib/style.css';
import 'vxe-table/lib/style.css';
import '../assets/styles/app.css';
import '../assets/styles/visual-editor-utilities.scss';

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
import { useAuth } from '../composables/useAuth';
import { router } from './router';

const app = createApp(App);
const refs: Record<string, unknown> = {};
const ClientOnly = defineComponent({
  name: 'ClientOnly',
  setup(_, { slots }) {
    return () => slots.default?.() ?? null;
  },
});

app.use(router);
app.use(VxeUI);
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
app.component('VisualEditorProvider', VisualEditorProvider);

app.config.globalProperties.$$refs = refs;
window.$$refs = refs;

if (import.meta.env.DEV) {
  await useAuth().init();
}

app.mount('#app');
