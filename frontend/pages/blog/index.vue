<template>
  <div class="page-stack">
    <section class="page-intro">
      <p class="section-kicker">学习记录</p>
      <h1>{{ SITE_NAME }}学习记录</h1>
      <p>整理低代码、智能排程和工程实践中的笔记。</p>
    </section>

    <section class="section-block"></section>
  </div>
</template>

<script setup lang="ts">
import type { ContentSummary } from '~/types/content';
import { SITE_NAME } from '../../config/site';

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
  title: `学习记录 | ${SITE_NAME}`,
  description: `${SITE_NAME}的个人技术学习记录。`
});
</script>
