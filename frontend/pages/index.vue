<template>
  <div class="page-stack">
   
  </div>
</template>

<script setup lang="ts">
import {
  faqItems,
  heroStats,
  homeHero,
  marketingFeatures,
  pricingPlans,
  siteDescription,
  siteName,
  testimonials
} from '~/data/site';
import type { ContentSummary } from '~/types/content';

const { data: posts } = await useAsyncData<ContentSummary[]>(
  'home-latest-posts',
  () => $fetch('/api/content/blog', { query: { limit: 3 } }),
  { default: () => [] }
);

const latestPosts = computed(() => posts.value ?? []);

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0
  })}`;
}

function formatDate(date?: string) {
  if (!date) return 'Draft';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(date));
}

useSeoMeta({
  title: siteName,
  description: siteDescription
});
</script>
