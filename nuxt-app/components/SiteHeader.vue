<template>
  <header class="site-header">
    <RouterLink class="site-brand" to="/">
      <span class="site-brand-mark">H</span>
      <span>Hikari</span>
    </RouterLink>

    <nav class="site-nav" aria-label="Primary navigation">
      <RouterLink
        v-for="item in publicNav"
        :key="item.href"
        class="site-nav-link"
        :to="item.href"
      >
        {{ item.label }}
      </RouterLink>
    </nav>

    <div class="site-actions">
      <RouterLink
        v-if="signedIn"
        class="site-button site-button-primary"
        to="/dashboard"
      >
        Dashboard
      </RouterLink>
      <template v-else>
        <RouterLink class="site-button" to="/signin">Sign in</RouterLink>
        <RouterLink class="site-button site-button-primary" to="/signup">
          Get started
        </RouterLink>
      </template>
    </div>
  </header>
</template>

<script setup lang="ts">
import { publicNav } from '~/data/site';

const auth = useAuth();
const signedIn = computed(() => Boolean(auth.user.value));

onMounted(() => {
  auth.init();
});
</script>
