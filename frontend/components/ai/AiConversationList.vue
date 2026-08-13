<template>
  <aside class="ai-conversation-list">
    <header>
      <strong>对话记录</strong>
      <button type="button" title="刷新对话" aria-label="刷新对话" @click="load">
        <i :class="loading ? 'ri-loader-4-line ai-history-spin' : 'ri-refresh-line'" aria-hidden="true" />
      </button>
    </header>
    <div class="ai-conversation-list__body">
      <button
        v-for="conversation in assistant.conversations.value"
        :key="conversation.id"
        type="button"
        :class="{ 'is-active': assistant.sessionId.value === conversation.id }"
        @click="openConversation(conversation)"
      >
        <i class="ri-message-3-line" aria-hidden="true" />
        <span>
          <strong>{{ conversation.title }}</strong>
          <small>{{ formatTime(conversation.updatedAt) }}</small>
        </span>
      </button>
      <p v-if="!loading && !assistant.conversations.value.length">暂无历史对话</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { AiConversation } from '../../types/ai';
import { useAiAssistant } from '../../composables/useAiAssistant';
const assistant = useAiAssistant();
const emit = defineEmits<{ selected: [] }>();
const loading = ref(false);
async function load() {
  loading.value = true;
  try { await assistant.loadConversations(); } finally { loading.value = false; }
}
async function openConversation(conversation: AiConversation) {
  await assistant.openConversation(conversation);
  emit('selected');
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
onMounted(load);
</script>

<style scoped>
.ai-conversation-list { display: flex; width: 250px; min-width: 0; flex-direction: column; border-right: 1px solid #dfe5ed; background: #f8fafc; }
.ai-conversation-list header { display: flex; min-height: 42px; align-items: center; justify-content: space-between; border-bottom: 1px solid #e3e8ef; padding: 0 10px 0 12px; color: #273447; font-size: 12px; }
.ai-conversation-list header button { display: inline-grid; width: 25px; height: 25px; place-items: center; border: 0; background: transparent; color: #64748b; cursor: pointer; }
.ai-conversation-list__body { display: grid; align-content: start; gap: 3px; overflow: auto; padding: 6px; }
.ai-conversation-list__body > button { display: grid; min-height: 48px; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: 6px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: #4a586a; cursor: pointer; text-align: left; padding: 5px 7px; }
.ai-conversation-list__body > button:hover, .ai-conversation-list__body > button.is-active { border-color: #d2e1f7; background: #ffffff; color: #1d64d8; }
.ai-conversation-list__body span { display: grid; min-width: 0; gap: 2px; }
.ai-conversation-list__body strong { overflow: hidden; color: inherit; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.ai-conversation-list__body small { color: #94a0b0; font-size: 10px; }
.ai-conversation-list__body p { margin: 20px 0; color: #94a0b0; font-size: 11px; text-align: center; }
.ai-history-spin { animation: ai-history-spin 0.8s linear infinite; }
@keyframes ai-history-spin { to { transform: rotate(360deg); } }
</style>
