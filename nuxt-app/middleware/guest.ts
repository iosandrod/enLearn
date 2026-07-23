export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return;

  const auth = useAuth();
  await auth.init();

  if (auth.user.value) {
    return navigateTo('/dashboard');
  }
});
