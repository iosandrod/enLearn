<template>
  <details class="ai-tool-trace">
    <summary>
      <i :class="trace.status === 'running' ? 'ri-loader-4-line ai-spin' : 'ri-tools-line'" aria-hidden="true" />
      <span>{{ toolLabel }}</span>
      <small>{{ statusLabel }}</small>
    </summary>
    <div class="ai-tool-trace__body">
      <code>{{ trace.name }}</code>
      <pre v-if="trace.arguments">{{ format(trace.arguments) }}</pre>
      <pre v-if="trace.result">{{ format(trace.result) }}</pre>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { AiToolTrace } from '../../types/ai';

const props = defineProps<{ trace: AiToolTrace }>();
const toolNames: Record<string, string> = {
  'current_page.describe': '读取页面结构',
  'lowcode.list_table_options': '读取数据表',
  'lowcode.inspect_table': '检查表字段',
  'proposal.create_page': '生成页面方案',
  'proposal.patch_page': '生成页面修改',
  'proposal.create_button': '生成按钮方案',
  'proposal.create_page_function': '生成页面函数'
};
const toolLabel = computed(() => toolNames[props.trace.name] ?? '调用受控工具');
const statusLabel = computed(() => props.trace.status === 'running' ? '执行中' : props.trace.status === 'completed' ? '已完成' : '失败');
function format(value: unknown) {
  return JSON.stringify(value, null, 2).slice(0, 4000);
}
</script>

<style scoped>
.ai-tool-trace {
  border: 1px solid #e1e7ef;
  border-radius: 6px;
  background: #f8fafc;
  overflow: hidden;
}

.ai-tool-trace summary {
  display: grid;
  min-height: 34px;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: #475569;
  cursor: pointer;
  list-style: none;
  padding: 0 10px;
  font-size: 12px;
}

.ai-tool-trace summary::-webkit-details-marker { display: none; }
.ai-tool-trace summary small { color: #8a96a8; }
.ai-tool-trace__body { border-top: 1px solid #e1e7ef; padding: 8px 10px; }
.ai-tool-trace__body code { color: #2563eb; font-size: 11px; }
.ai-tool-trace pre { max-height: 140px; margin: 6px 0 0; overflow: auto; color: #475569; font-size: 10px; white-space: pre-wrap; }
.ai-spin { animation: ai-spin 0.8s linear infinite; }
@keyframes ai-spin { to { transform: rotate(360deg); } }
</style>

