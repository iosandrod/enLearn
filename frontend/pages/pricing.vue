<template>
 <div></div>
</template>

<script setup lang="ts">
import { pricingPlans } from '~/data/site';
import type { LowCodeGridSchema } from '@enlearn/lowcode-framework/types/lowcode';
import { SITE_NAME } from '../config/site';

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
  title: `学习资源 | ${SITE_NAME}`,
  description: `${SITE_NAME}学习资源页。`
});
</script>
