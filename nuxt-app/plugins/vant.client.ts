import { Lazyload } from 'vant';
import '@vant/touch-emulator';
import 'vant/lib/index.css';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(Lazyload);
});
