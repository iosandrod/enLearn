import VxeUI from 'vxe-pc-ui';
import VxeUITable from 'vxe-table';
import LcVxeModalRenderer from '~/components/LcVxeModalRenderer';
import 'remixicon/fonts/remixicon.css';
import 'vxe-pc-ui/lib/style.css';
import 'vxe-table/lib/style.css';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VxeUI);
  nuxtApp.vueApp.use(VxeUITable);
  nuxtApp.vueApp.component('LcVxeModalRenderer', LcVxeModalRenderer);
});
