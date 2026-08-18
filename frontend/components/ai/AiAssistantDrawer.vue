<template>
  <Teleport to="body">
    <Transition name="ai-drawer">
      <aside v-if="assistant.open.value" class="ai-assistant-drawer" aria-label="AI 助手" @click.stop>
        <header class="ai-assistant-drawer__header">
          <div>
            <span><i class="ri-sparkling-2-line" aria-hidden="true" /></span>
            <div><strong>AI 助手</strong><small>页面与数据智能协作</small></div>
          </div>
          <nav>
            <button type="button" title="新对话" aria-label="新对话" @click="assistant.newConversation"><i class="ri-add-line" /></button>
            <button type="button" title="历史对话" aria-label="历史对话" :class="{ 'is-active': historyOpen }" @click="historyOpen = !historyOpen"><i class="ri-history-line" /></button>
            <button type="button" title="关闭" aria-label="关闭" @click="assistant.open.value = false"><i class="ri-close-line" /></button>
          </nav>
        </header>
        <AiContextBar />
        <div class="ai-assistant-drawer__workspace">
          <Transition name="ai-history">
            <AiConversationList v-if="historyOpen" @selected="historyOpen = false" />
          </Transition>
          <main>
            <AiMessageList @suggest="useSuggestion" />
            <p v-if="assistant.errorMessage.value" class="ai-assistant-drawer__error" role="alert">
              <i class="ri-error-warning-line" aria-hidden="true" /> {{ assistant.errorMessage.value }}
            </p>
            <AiPromptComposer ref="composerRef" />
          </main>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { AiRunMode } from '../../types/ai';
import { useAiAssistant } from '../../composables/useAiAssistant';
const assistant = useAiAssistant();
const auth = useAuth();
const historyOpen = ref(false);
const composerRef = ref<{ focus?: () => void } | null>(null);
function useSuggestion(text: string, mode: AiRunMode) {
  assistant.mode.value = mode;
  void assistant.send(text);
}
function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    assistant.open.value = !assistant.open.value;
    if (assistant.open.value) void nextTick(() => composerRef.value?.focus?.());
  }
  if (event.key === 'Escape' && assistant.open.value) assistant.open.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
watch(() => assistant.open.value, (value) => { if (value) void nextTick(() => composerRef.value?.focus?.()); });
watch(
  () => auth.user.value?.id ?? '',
  (userId, previousUserId) => {
    if (userId !== previousUserId) assistant.resetForIdentityChange();
  }
);
</script>

<style scoped>
.ai-assistant-drawer { position: fixed; top: 32px; right: 0; bottom: 0; z-index: 90; display: flex; width: min(480px, calc(100vw - 24px)); flex-direction: column; border-left: 1px solid #cfd7e3; background: #ffffff; box-shadow: -14px 0 36px rgb(15 23 42 / 16%); color: #1f2937; }
.ai-assistant-drawer__header { display: flex; min-height: 48px; flex: none; align-items: center; justify-content: space-between; border-bottom: 1px solid #dfe5ed; padding: 0 8px 0 12px; }
.ai-assistant-drawer__header > div { display: flex; align-items: center; gap: 8px; }
.ai-assistant-drawer__header > div > span { display: inline-grid; width: 30px; height: 30px; place-items: center; border-radius: 6px; background: #e9f1ff; color: #2563eb; font-size: 17px; }
.ai-assistant-drawer__header > div > div { display: grid; gap: 1px; }
.ai-assistant-drawer__header strong { color: #1f2d40; font-size: 13px; }
.ai-assistant-drawer__header small { color: #8591a2; font-size: 10px; }
.ai-assistant-drawer__header nav { display: inline-flex; gap: 2px; }
.ai-assistant-drawer__header nav button { display: inline-grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: #64748b; cursor: pointer; font-size: 16px; }
.ai-assistant-drawer__header nav button:hover, .ai-assistant-drawer__header nav button.is-active { background: #edf3fb; color: #1d64d8; }
.ai-assistant-drawer__workspace { display: flex; min-height: 0; flex: 1; }
.ai-assistant-drawer__workspace > main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.ai-assistant-drawer__error { display: flex; flex: none; align-items: center; gap: 5px; margin: 0; border-top: 1px solid #f3c4c4; background: #fff5f5; color: #b83232; padding: 6px 10px; font-size: 11px; }
.ai-drawer-enter-active, .ai-drawer-leave-active { transition: transform 180ms ease, opacity 180ms ease; }
.ai-drawer-enter-from, .ai-drawer-leave-to { opacity: 0; transform: translateX(100%); }
.ai-history-enter-active, .ai-history-leave-active { transition: width 150ms ease, opacity 150ms ease; overflow: hidden; }
.ai-history-enter-from, .ai-history-leave-to { width: 0; opacity: 0; }
@media (max-width: 720px) {
  .ai-assistant-drawer { top: 0; width: 100vw; border-left: 0; }
  .ai-assistant-drawer__header { min-height: 52px; }
  .ai-assistant-drawer__workspace { position: relative; }
  .ai-assistant-drawer__workspace > :deep(.ai-conversation-list) { position: absolute; inset: 0 auto 0 0; z-index: 3; width: min(82vw, 300px); box-shadow: 10px 0 24px rgb(15 23 42 / 16%); }
}
</style>
