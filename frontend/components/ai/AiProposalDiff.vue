<template>
  <div class="ai-proposal-diff">
    <article
      v-for="item in proposal.diff"
      :key="item.id"
      :class="{ 'is-warning': item.severity === 'warning' }"
    >
      <i :class="iconFor(item.category)" aria-hidden="true" />
      <div>
        <strong>{{ item.label }}</strong>
        <small>{{ categoryLabel(item.category) }}</small>
      </div>
      <button type="button" title="查看结构化差异" aria-label="查看结构化差异" @click="toggle(item.id)">
        <i :class="expanded.has(item.id) ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" aria-hidden="true" />
      </button>
      <pre v-if="expanded.has(item.id)">{{ format(item.after) }}</pre>
    </article>
    <p v-if="!proposal.diff.length" class="ai-proposal-diff__empty">完整候选页面已通过确定性生成器创建。</p>
  </div>
</template>

<script setup lang="ts">
import type { AiProposal, AiProposalDiffItem } from '../../types/ai';

defineProps<{ proposal: AiProposal }>();
const expanded = reactive(new Set<string>());
function toggle(id: string) { expanded.has(id) ? expanded.delete(id) : expanded.add(id); }
function format(value: unknown) { return JSON.stringify(value, null, 2).slice(0, 8000); }
function categoryLabel(category: AiProposalDiffItem['category']) {
  return ({ page: '页面', block: '区块', data_source: '数据源', button: '按钮', function: '函数', security: '安全权限' })[category];
}
function iconFor(category: AiProposalDiffItem['category']) {
  return ({
    page: 'ri-file-edit-line', block: 'ri-layout-grid-line', data_source: 'ri-database-2-line',
    button: 'ri-cursor-line', function: 'ri-braces-line', security: 'ri-shield-keyhole-line'
  })[category];
}
</script>

<style scoped>
.ai-proposal-diff { display: grid; gap: 6px; }
.ai-proposal-diff article {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 7px;
  border: 1px solid #e1e7ef;
  border-radius: 5px;
  background: #ffffff;
  padding: 7px 8px;
}
.ai-proposal-diff article.is-warning { border-color: #f0c36b; background: #fffbeb; }
.ai-proposal-diff article > i { color: #2563eb; }
.ai-proposal-diff article.is-warning > i { color: #b7791f; }
.ai-proposal-diff article div { display: grid; gap: 1px; }
.ai-proposal-diff strong { color: #263244; font-size: 11px; }
.ai-proposal-diff small { color: #8491a3; font-size: 10px; }
.ai-proposal-diff button { display: inline-grid; width: 22px; height: 22px; place-items: center; border: 0; background: transparent; color: #64748b; cursor: pointer; }
.ai-proposal-diff pre { grid-column: 1 / -1; max-height: 180px; margin: 4px 0 0; overflow: auto; border-top: 1px solid #edf1f5; padding-top: 6px; color: #475569; font-size: 10px; white-space: pre-wrap; }
.ai-proposal-diff__empty { margin: 0; color: #64748b; font-size: 11px; }
</style>

