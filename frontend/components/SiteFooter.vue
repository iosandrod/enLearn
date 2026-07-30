<template>
  <footer class="site-footer">
    <div class="site-footer-intro">
      <RouterLink class="site-brand" to="/">
        <span class="site-brand-mark">H</span>
        <span>Hikari</span>
      </RouterLink>
      <p>{{ siteDescription }}</p>
    </div>

    <div class="site-footer-columns">
      <div v-for="column in footerColumns" :key="column.title">
        <h2>{{ column.title }}</h2>
        <RouterLink
          v-for="link in column.links"
          :key="link.href"
          :to="link.href"
        >
          {{ link.label }}
        </RouterLink>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { footerColumns, siteDescription } from '~/data/site';
</script>
