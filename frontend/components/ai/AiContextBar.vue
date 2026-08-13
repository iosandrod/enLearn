<template>
  <section class="ai-context-bar">
    <span class="ai-context-bar__icon"><i class="ri-layout-4-line" aria-hidden="true" /></span>
    <div>
      <strong>{{ pageTitle }}</strong>
      <small>{{ pageSubtitle }}</small>
    </div>
    <label v-if="assistant.currentPage.value && canIncludeSamples" class="ai-context-bar__sample" title="仅发送经过限量和脱敏的当前页面样例数据">
      <input v-model="assistant.includeSampleData.value" type="checkbox" />
      <span>样例数据</span>
    </label>
  </section>
</template>

<script setup lang="ts">
import { useAiAssistant } from '../../composables/useAiAssistant';
const assistant = useAiAssistant();
const pageContext = useAiPageContext();
const canIncludeSamples = computed(() => pageContext.build(false).hasSampleData);
const pageTitle = computed(() => String(assistant.currentPage.value?.title ?? '未关联低代码页面'));
const pageSubtitle = computed(() => assistant.currentPage.value
  ? `${assistant.currentPage.value.code ?? ''} · v${assistant.currentPage.value.version ?? 1}`
  : '仍可进行通用问答或生成新页面');
</script>

<style scoped>
.ai-context-bar {
  display: grid;
  min-height: 48px;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #e5e9f0;
  background: #f8fafc;
  padding: 6px 12px;
}

.ai-context-bar__icon {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid #cdddf5;
  border-radius: 6px;
  background: #ffffff;
  color: #2563eb;
}

.ai-context-bar div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.ai-context-bar strong,
.ai-context-bar small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-context-bar strong {
  color: #172033;
  font-size: 12px;
}

.ai-context-bar small {
  color: #718096;
  font-size: 11px;
}

.ai-context-bar__sample {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #526070;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
}
</style>
