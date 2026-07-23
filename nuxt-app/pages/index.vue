<template>
  <div class="page-stack">
    <section class="hero-section">
      <div class="hero-copy">
        <p class="section-kicker">{{ homeHero.eyebrow }}</p>
        <h1>{{ homeHero.title }}</h1>
        <p>{{ homeHero.description }}</p>

        <div class="hero-actions">
          <NuxtLink
            v-for="action in homeHero.actions"
            :key="action.href"
            :class="[
              'site-button',
              action.primary ? 'site-button-primary' : 'site-button-soft'
            ]"
            :to="action.href"
          >
            {{ action.label }}
          </NuxtLink>
        </div>

        <ul class="hero-checklist">
          <li v-for="item in homeHero.bullets" :key="item">{{ item }}</li>
        </ul>
      </div>

      <aside class="hero-panel" aria-label="Migration overview">
        <p class="section-kicker">Current Surface</p>
        <h2>Nuxt now owns the main product routes.</h2>
        <div class="hero-stat-grid">
          <div v-for="stat in heroStats" :key="stat.label">
            <strong>{{ stat.value }}</strong>
            <span>{{ stat.label }}</span>
          </div>
        </div>
        <div class="hero-flow">
          <span>/</span>
          <span>/pricing</span>
          <span>/blog</span>
          <span>/docs</span>
          <span>/dashboard</span>
        </div>
      </aside>
    </section>

    <section id="features" class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Features</p>
          <h2>Same product surface, Vue-friendly implementation.</h2>
        </div>
        <p>
          The migration keeps Supabase as the backend and changes the frontend
          shell to Nuxt 3, with VXE powering object-driven form and grid screens.
        </p>
      </div>

      <div class="feature-grid">
        <article
          v-for="feature in marketingFeatures"
          :key="feature.title"
          class="feature-card"
        >
          <span>{{ feature.kicker }}</span>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </article>
      </div>
    </section>

    <section id="pricing" class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Pricing</p>
          <h2>Plans migrated from the original starter.</h2>
        </div>
        <NuxtLink class="site-button site-button-soft" to="/pricing">
          Compare all plans
        </NuxtLink>
      </div>

      <div class="pricing-grid">
        <article
          v-for="plan in pricingPlans"
          :key="plan.name"
          :class="['price-card', { 'price-card-featured': plan.featured }]"
        >
          <div>
            <span v-if="plan.featured" class="plan-badge">Popular</span>
            <h3>{{ plan.name }}</h3>
            <p>{{ plan.description }}</p>
          </div>
          <p class="price-line">
            <strong>{{ formatPrice(plan.monthlyPrice) }}</strong>
            <span>/ month</span>
          </p>
          <ul>
            <li v-for="feature in plan.features.slice(0, 4)" :key="feature">
              {{ feature }}
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Blog</p>
          <h2>Latest Hikari notes.</h2>
        </div>
        <NuxtLink class="site-button site-button-soft" to="/blog">
          View all posts
        </NuxtLink>
      </div>

      <div class="post-grid">
        <NuxtLink
          v-for="post in latestPosts"
          :key="post.href"
          class="post-card"
          :to="post.href"
        >
          <span>{{ formatDate(post.date) }}</span>
          <h3>{{ post.title }}</h3>
          <p>{{ post.description }}</p>
        </NuxtLink>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Community</p>
          <h2>Signals from the original project.</h2>
        </div>
      </div>

      <div class="testimonial-grid">
        <article
          v-for="testimonial in testimonials"
          :key="testimonial.name"
          class="testimonial-card"
        >
          <div class="avatar-fallback">{{ testimonial.avatarFallback }}</div>
          <p>{{ testimonial.text }}</p>
          <strong>{{ testimonial.name }}</strong>
          <span>{{ testimonial.title }}</span>
        </article>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-kicker">FAQ</p>
          <h2>Migration notes.</h2>
        </div>
      </div>

      <div class="faq-list">
        <details v-for="item in faqItems" :key="item.question">
          <summary>{{ item.question }}</summary>
          <p>{{ item.answer }}</p>
        </details>
      </div>
    </section>
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
