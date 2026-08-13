<template>
  <button
    v-if="canUseAssistant"
    class="ai-assistant-button"
    :class="{ 'is-active': assistant.open.value }"
    type="button"
    title="AI 助手"
    aria-label="AI 助手"
    :aria-expanded="assistant.open.value"
    @click.stop="assistant.open.value = !assistant.open.value"
  >
    <i class="ri-sparkling-2-line" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { useAiAssistant } from '../../composables/useAiAssistant';
const assistant = useAiAssistant();
const auth = useAuth();
const canUseAssistant = computed(() =>
  auth.permissions.value.includes('ai.assistant.use') ||
  String(auth.profile.value?.role ?? '').toLowerCase() === 'admin'
);
</script>

<style scoped>
.ai-assistant-button {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.ai-assistant-button:hover,
.ai-assistant-button.is-active {
  background: rgb(255 255 255 / 18%);
}
</style>
