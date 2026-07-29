<template>
  <div class="page-stack">
    <section class="page-intro">
      <p class="section-kicker">Pricing</p>
      <h1>Plans for building with Hikari.</h1>
      <p>
        The original plan structure is now rendered in the SPA. Cards and the
        comparison grid are both driven by data objects.
      </p>
    </section>

    <section class="section-block">
      <div class="pricing-grid">
        <article
          v-for="plan in pricingPlans"
          :key="plan.name"
          :class="['price-card', { 'price-card-featured': plan.featured }]"
        >
          <div>
            <span v-if="plan.featured" class="plan-badge">Popular</span>
            <h2>{{ plan.name }}</h2>
            <p>{{ plan.description }}</p>
          </div>
          <div class="price-stack">
            <p class="price-line">
              <strong>{{ formatPrice(plan.monthlyPrice) }}</strong>
              <span>/ month</span>
            </p>
            <p>{{ formatPrice(plan.yearlyPrice) }} billed yearly</p>
          </div>
          <ul>
            <li v-for="feature in plan.features" :key="feature">
              {{ feature }}
            </li>
          </ul>
          <RouterLink class="site-button site-button-primary" to="/signup">
            Start with {{ plan.name }}
          </RouterLink>
        </article>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Comparison</p>
          <h2>VXE table rendered from one schema object.</h2>
        </div>
      </div>

      <LowCodeGrid
        :schema="comparisonGridSchema"
        :rows="comparisonRows"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { pricingPlans } from '~/data/site';
import type { LowCodeGridSchema } from '@enlearn/lowcode-framework/types/lowcode';

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0
  })}`;
}

const comparisonRows = computed(() =>
  pricingPlans.map((plan) => ({
    plan: plan.name,
    monthly: formatPrice(plan.monthlyPrice),
    yearly: formatPrice(plan.yearlyPrice),
    features: plan.features.length,
    focus: plan.featured ? 'Growing teams' : 'Standard use'
  }))
);

const comparisonGridSchema: LowCodeGridSchema = {
  title: 'Plan Comparison',
  grid: {
    border: true,
    showOverflow: true,
    rowConfig: { isHover: true },
    columns: [
      { field: 'plan', title: 'Plan', minWidth: 140 },
      { field: 'monthly', title: 'Monthly', minWidth: 120 },
      { field: 'yearly', title: 'Yearly', minWidth: 120 },
      { field: 'features', title: 'Included Features', minWidth: 160 },
      { field: 'focus', title: 'Best For', minWidth: 160 }
    ]
  }
};

useSeoMeta({
  title: 'Pricing | Hikari',
  description: 'Compare Hikari plans in the SPA migration.'
});
</script>
