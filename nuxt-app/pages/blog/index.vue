<template>
  <div class="page-stack">
    <section class="page-intro">
      <p class="section-kicker">Blog</p>
      <h1>Hikari Blog</h1>
      <p>Design language, setup notes, and migration-friendly project updates.</p>
    </section>

    <section class="section-block">
      <div class="post-grid post-grid-wide">
        <NuxtLink
          v-for="post in posts"
          :key="post.href"
          class="post-card"
          :to="post.href"
        >
          <span>{{ formatDate(post.date) }}</span>
          <h2>{{ post.title }}</h2>
          <p>{{ post.description }}</p>
          <small>{{ post.author }}</small>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ContentSummary } from '~/types/content';

const { data } = await useAsyncData<ContentSummary[]>(
  'blog-posts',
  () => $fetch('/api/content/blog'),
  { default: () => [] }
);

const posts = computed(() => data.value ?? []);

function formatDate(date?: string) {
  if (!date) return 'Draft';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(date));
}

useSeoMeta({
  title: 'Blog | Hikari',
  description: 'Read Hikari blog posts from the Nuxt migration.'
});
</script>
