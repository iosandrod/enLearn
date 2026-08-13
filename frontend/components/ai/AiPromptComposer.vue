<template>
  <footer class="ai-prompt-composer">
    <div class="ai-prompt-composer__modes" role="tablist" aria-label="AI 工作模式">
      <button
        v-for="item in modes"
        :key="item.value"
        type="button"
        role="tab"
        :aria-selected="assistant.mode.value === item.value"
        :title="item.description"
        :disabled="item.requiresPage && !assistant.canUsePageMode.value"
        @click="assistant.mode.value = item.value"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="ai-prompt-composer__input">
      <textarea
        ref="inputRef"
        v-model="draft"
        rows="3"
        :placeholder="placeholder"
        :disabled="assistant.running.value"
        @keydown="handleKeydown"
      />
      <div class="ai-prompt-composer__footer">
        <span><i class="ri-shield-check-line" aria-hidden="true" /> 写操作需确认</span>
        <button
          v-if="assistant.running.value"
          class="ai-prompt-composer__cancel"
          type="button"
          title="停止生成"
          aria-label="停止生成"
          @click="assistant.cancel"
        >
          <i class="ri-stop-circle-line" aria-hidden="true" />
        </button>
        <button
          v-else
          class="ai-prompt-composer__send"
          type="button"
          title="发送"
          aria-label="发送"
          :disabled="!draft.trim()"
          @click="submit"
        >
          <i class="ri-arrow-up-line" aria-hidden="true" />
        </button>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { AiRunMode } from '../../types/ai';
import { useAiAssistant } from '../../composables/useAiAssistant';

const assistant = useAiAssistant();
const draft = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const modes: Array<{ value: AiRunMode; label: string; description: string; requiresPage?: boolean }> = [
  { value: 'ask', label: '问页面', description: '结合当前页面结构回答问题' },
  { value: 'create_page', label: '生成页面', description: '根据数据库元数据生成新页面草案' },
  { value: 'edit_page', label: '修改页面', description: '生成当前页面的修改方案', requiresPage: true },
  { value: 'generate_button', label: '按钮', description: '为当前页面生成按钮动作', requiresPage: true },
  { value: 'generate_function', label: '函数', description: '生成受控页面函数', requiresPage: true }
];
const placeholder = computed(() => ({
  ask: '询问当前页面的字段、数据源或操作逻辑...',
  create_page: '例如：根据销售订单表生成一个列表页...',
  edit_page: '描述需要修改的页面结构...',
  generate_button: '例如：添加一个刷新按钮...',
  generate_function: '例如：生成一个刷新数据并提示成功的函数...'
})[assistant.mode.value]);
async function submit() {
  const value = draft.value.trim();
  if (!value) return;
  draft.value = '';
  await assistant.send(value);
  await nextTick();
  inputRef.value?.focus();
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submit();
  }
}
defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<style scoped>
.ai-prompt-composer { display: grid; flex: none; gap: 7px; border-top: 1px solid #dfe5ed; background: #ffffff; padding: 8px 10px 10px; }
.ai-prompt-composer__modes { display: flex; gap: 4px; overflow-x: auto; }
.ai-prompt-composer__modes button { min-height: 25px; flex: none; border: 1px solid #dce3ec; border-radius: 4px; background: #ffffff; color: #526070; cursor: pointer; padding: 0 8px; font-size: 11px; }
.ai-prompt-composer__modes button[aria-selected='true'] { border-color: #7eaaec; background: #edf4ff; color: #1459bd; font-weight: 700; }
.ai-prompt-composer__modes button:disabled { opacity: 0.4; cursor: not-allowed; }
.ai-prompt-composer__input { border: 1px solid #bec9d8; border-radius: 7px; background: #ffffff; overflow: hidden; }
.ai-prompt-composer__input:focus-within { border-color: #4f8fdf; box-shadow: 0 0 0 2px rgb(37 99 235 / 10%); }
.ai-prompt-composer textarea { display: block; width: 100%; min-height: 60px; max-height: 140px; resize: none; border: 0; outline: 0; color: #1f2937; font: inherit; font-size: 12px; line-height: 1.5; padding: 9px 10px 3px; }
.ai-prompt-composer textarea::placeholder { color: #98a3b3; }
.ai-prompt-composer__footer { display: flex; min-height: 30px; align-items: center; justify-content: space-between; padding: 2px 5px 4px 9px; }
.ai-prompt-composer__footer > span { display: inline-flex; align-items: center; gap: 4px; color: #8591a2; font-size: 10px; }
.ai-prompt-composer__send, .ai-prompt-composer__cancel { display: inline-grid; width: 28px; height: 28px; place-items: center; border-radius: 5px; cursor: pointer; font-size: 16px; }
.ai-prompt-composer__send { border: 1px solid #1d64d8; background: #1d64d8; color: #ffffff; }
.ai-prompt-composer__send:disabled { border-color: #cbd5e1; background: #e2e8f0; cursor: not-allowed; }
.ai-prompt-composer__cancel { border: 1px solid #d9a5a5; background: #fff5f5; color: #c53030; }
</style>
