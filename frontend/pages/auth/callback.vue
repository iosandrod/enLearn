<template>
  <main class="auth-shell">
    <section class="auth-panel">
      <h1 class="page-title">Signing you in</h1>
      <p class="page-description">Please wait while your session is completed.</p>
    </section>
  </main>
</template>

<script setup lang="ts">
const auth = useAuth();

onMounted(async () => {
  await auth.completeOAuthRedirect();
  await navigateTo(auth.user.value ? '/dashboard' : '/signin');
});
</script>
