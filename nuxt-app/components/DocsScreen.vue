<template>
  <div class="docs-layout">
    <aside class="docs-sidebar" aria-label="Documentation navigation">
      <div v-for="group in docsNavGroups" :key="group.title" class="docs-group">
        <h2>{{ group.title }}</h2>
        <NuxtLink
          v-for="item in group.items"
          :key="item.href"
          class="docs-link"
          :to="item.href"
        >
          {{ item.label }}
        </NuxtLink>
      </div>
    </aside>

    <article v-if="doc" class="docs-article">
      <header class="article-hero">
        <p class="section-kicker">Documentation</p>
        <h1>{{ doc.title }}</h1>
        <p>{{ doc.description }}</p>
      </header>

      <ContentRenderer :html="doc.bodyHtml" />
    </article>

    <aside v-if="doc?.toc.length" class="docs-toc" aria-label="Page outline">
      <p class="section-kicker">On this page</p>
      <a
        v-for="item in doc.toc"
        :key="item.id"
        :class="`toc-link toc-depth-${item.depth}`"
        :href="`#${item.id}`"
      >
        {{ item.text }}
      </a>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { docsNavGroups } from '~/data/docs';
import type { RenderedContent } from '~/types/content';

const route = useRoute();
const slugParts = computed(() => {
  const rawSlug = route.params.slug;

  if (Array.isArray(rawSlug)) {
    return rawSlug;
  }

  return rawSlug ? [String(rawSlug)] : [];
});

const contentPath = computed(() =>
  slugParts.value.length
    ? `/api/content/docs/${slugParts.value.join('/')}`
    : '/api/content/docs'
);

const dataKey = computed(
  () => `docs-page-${slugParts.value.join('/') || 'index'}`
);

const { data, error } = await useAsyncData<RenderedContent>(
  dataKey,
  () => $fetch(contentPath.value)
);

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Documentation page not found'
  });
}

const doc = computed(() => data.value);

useSeoMeta({
  title: () => (doc.value ? `${doc.value.title} | Hikari Docs` : 'Hikari Docs'),
  description: () => doc.value?.description ?? 'Hikari documentation'
});
</script>
