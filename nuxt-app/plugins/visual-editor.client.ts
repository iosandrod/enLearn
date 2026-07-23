export default defineNuxtPlugin((nuxtApp) => {
  const refs: Record<string, unknown> = {};
  nuxtApp.vueApp.config.globalProperties.$$refs = refs;

  if (typeof window !== 'undefined') {
    window.$$refs = refs;
  }
});
