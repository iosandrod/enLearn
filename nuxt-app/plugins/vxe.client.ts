import VxeUI from 'vxe-pc-ui';
import VxeUITable from 'vxe-table';
import 'vxe-pc-ui/lib/style.css';
import 'vxe-table/lib/style.css';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VxeUI);
  nuxtApp.vueApp.use(VxeUITable);
});
