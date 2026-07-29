<template>
  <div class="content-layout">
    <article v-if="post" class="content-article">
      <header class="article-hero">
        <RouterLink class="back-link" to="/blog">Back to blog</RouterLink>
        <p class="section-kicker">{{ formatDate(post.date) }}</p>
        <h1>{{ post.title }}</h1>
        <p>{{ post.description }}</p>
      </header>

      <ContentRenderer :html="post.bodyHtml" />
    </article>

    <aside v-if="post" class="content-aside">
      <section class="meta-panel">
        <p class="section-kicker">Written by</p>
        <strong>{{ post.author ?? 'Hikari' }}</strong>
      </section>

      <section v-if="post.toc.length" class="toc-panel">
        <p class="section-kicker">On this page</p>
        <a
          v-for="item in post.toc"
          :key="item.id"
          :class="`toc-link toc-depth-${item.depth}`"
          :href="`#${item.id}`"
        >
          {{ item.text }}
        </a>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import type { RenderedContent } from '~/types/content';

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ''));
const dataKey = computed(() => `blog-post-${slug.value}`);

const { data, error } = await useAsyncData<RenderedContent>(
  dataKey,
  () => $fetch(`/api/content/blog/${slug.value}`)
);

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Blog post not found'
  });
}

const post = computed(() => data.value);

function formatDate(date?: string) {
  if (!date) return 'Draft';
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(date));
}

useSeoMeta({
  title: () => (post.value ? `${post.value.title} | Hikari` : 'Blog | Hikari'),
  description: () => post.value?.description ?? 'Hikari blog post'
});
</script>
