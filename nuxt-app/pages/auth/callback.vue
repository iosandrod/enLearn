<template>
  <main class="auth-shell">
    <section class="auth-panel">
      <h1 class="page-title">Signing you in</h1>
      <p class="page-description">Please wait while Supabase completes auth.</p>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });

const auth = useAuth();

onMounted(async () => {
  await auth.init();
  await navigateTo(auth.user.value ? '/dashboard' : '/signin');
});
</script>
