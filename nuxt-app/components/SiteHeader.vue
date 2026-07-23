<template>
  <header class="site-header">
    <NuxtLink class="site-brand" to="/">
      <span class="site-brand-mark">H</span>
      <span>Hikari</span>
    </NuxtLink>

    <nav class="site-nav" aria-label="Primary navigation">
      <NuxtLink
        v-for="item in publicNav"
        :key="item.href"
        class="site-nav-link"
        :to="item.href"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>

    <div class="site-actions">
      <NuxtLink
        v-if="signedIn"
        class="site-button site-button-primary"
        to="/dashboard"
      >
        Dashboard
      </NuxtLink>
      <template v-else>
        <NuxtLink class="site-button" to="/signin">Sign in</NuxtLink>
        <NuxtLink class="site-button site-button-primary" to="/signup">
          Get started
        </NuxtLink>
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
