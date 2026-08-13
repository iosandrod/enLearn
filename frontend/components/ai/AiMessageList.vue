<template>
  <div ref="listRef" class="ai-message-list">
    <section v-if="!assistant.messages.value.length" class="ai-message-list__empty">
      <span><i class="ri-sparkling-2-line" aria-hidden="true" /></span>
      <strong>准备好一起搭建页面了吗？</strong>
      <p>可以询问当前页面，也可以生成页面、按钮和函数方案。</p>
      <div>
        <button v-for="item in suggestions" :key="item.text" type="button" @click="$emit('suggest', item.text, item.mode)">
          <i :class="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </section>

    <template v-else>
      <article v-for="message in assistant.messages.value" :key="message.id" class="ai-message" :class="[`is-${message.role}`, { 'is-error': message.error }]">
        <span v-if="message.role === 'assistant'" class="ai-message__avatar"><i class="ri-sparkling-2-line" aria-hidden="true" /></span>
        <div>
          <p>{{ message.content }}<span v-if="message.streaming" class="ai-message__cursor" /></p>
          <small>{{ formatTime(message.createdAt) }}</small>
        </div>
      </article>
      <p v-if="assistant.statusText.value" class="ai-message-list__status"><i class="ri-loader-4-line ai-status-spin" /> {{ assistant.statusText.value }}</p>
      <section v-if="assistant.traces.value.length" class="ai-message-list__traces">
        <AiToolTrace v-for="trace in assistant.traces.value" :key="trace.id" :trace="trace" />
      </section>
      <section v-if="assistant.proposals.value.length" class="ai-message-list__proposals">
        <AiProposalCard v-for="proposal in assistant.proposals.value" :key="proposal.id" :proposal="proposal" />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AiRunMode } from '../../types/ai';
import { useAiAssistant } from '../../composables/useAiAssistant';
defineEmits<{ suggest: [text: string, mode: AiRunMode] }>();
const assistant = useAiAssistant();
const listRef = ref<HTMLElement | null>(null);
const suggestions: Array<{ label: string; text: string; mode: AiRunMode; icon: string }> = [
  { label: '解释当前页面', text: '请解释当前页面的数据源、字段和主要操作。', mode: 'ask', icon: 'ri-file-search-line' },
  { label: '生成数据页面', text: '请根据最匹配的业务表生成一个列表页面草案。', mode: 'create_page', icon: 'ri-layout-grid-line' },
  { label: '添加刷新按钮', text: '请为当前页面添加一个刷新按钮。', mode: 'generate_button', icon: 'ri-cursor-line' }
];
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
watch([() => assistant.messages.value.map((item) => item.content).join('|'), () => assistant.proposals.value.length], async () => {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
});
</script>

<style scoped>
.ai-message-list { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 10px; overflow-y: auto; background: #f6f8fb; padding: 14px 12px; }
.ai-message-list__empty { display: grid; min-height: 100%; place-content: center; justify-items: center; gap: 8px; color: #617085; text-align: center; }
.ai-message-list__empty > span { display: inline-grid; width: 42px; height: 42px; place-items: center; border: 1px solid #c8dcfa; border-radius: 7px; background: #eaf2ff; color: #2563eb; font-size: 22px; }
.ai-message-list__empty strong { color: #263448; font-size: 14px; }
.ai-message-list__empty p { max-width: 300px; margin: 0; font-size: 11px; line-height: 1.6; }
.ai-message-list__empty div { display: grid; width: min(300px, 100%); gap: 5px; margin-top: 5px; }
.ai-message-list__empty button { display: grid; min-height: 34px; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: 6px; border: 1px solid #dbe3ee; border-radius: 5px; background: #ffffff; color: #475569; cursor: pointer; text-align: left; padding: 0 10px; font-size: 11px; }
.ai-message-list__empty button:hover { border-color: #9dbce9; color: #1d64d8; }
.ai-message { display: grid; max-width: 94%; grid-template-columns: 26px minmax(0, 1fr); align-items: start; gap: 6px; }
.ai-message.is-user { align-self: flex-end; grid-template-columns: 1fr; }
.ai-message__avatar { display: inline-grid; width: 26px; height: 26px; place-items: center; border-radius: 5px; background: #e7f0ff; color: #2563eb; font-size: 14px; }
.ai-message > div { min-width: 0; }
.ai-message p { margin: 0; border: 1px solid #dfe5ed; border-radius: 6px; background: #ffffff; color: #2d3748; padding: 8px 9px; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
.ai-message.is-user p { border-color: #2563eb; background: #2563eb; color: #ffffff; }
.ai-message.is-error p { border-color: #efb4b4; background: #fff5f5; color: #b83232; }
.ai-message small { display: block; margin-top: 2px; color: #98a3b3; font-size: 9px; }
.ai-message.is-user small { text-align: right; }
.ai-message__cursor { display: inline-block; width: 2px; height: 12px; margin-left: 2px; background: #2563eb; animation: ai-cursor 0.8s step-end infinite; vertical-align: text-bottom; }
.ai-message-list__status { display: flex; align-items: center; gap: 5px; margin: 0 0 0 32px; color: #64748b; font-size: 10px; }
.ai-message-list__traces, .ai-message-list__proposals { display: grid; gap: 6px; margin-left: 32px; }
.ai-status-spin { animation: ai-status-spin 0.8s linear infinite; }
@keyframes ai-status-spin { to { transform: rotate(360deg); } }
@keyframes ai-cursor { 50% { opacity: 0; } }
</style>
