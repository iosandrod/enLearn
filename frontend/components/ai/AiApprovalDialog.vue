<template>
  <div v-if="open" class="ai-approval-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-approval-title" @click.self="close">
    <section>
      <header>
        <div>
          <span class="ai-approval-dialog__icon"><i class="ri-shield-check-line" aria-hidden="true" /></span>
          <div>
            <h3 id="ai-approval-title">确认应用页面变更</h3>
            <p>{{ proposal.summary }}</p>
          </div>
        </div>
        <button type="button" title="关闭" aria-label="关闭" :disabled="applying" @click="close"><i class="ri-close-line" /></button>
      </header>
      <div class="ai-approval-dialog__body">
        <div class="ai-approval-dialog__warning">
          <i class="ri-global-line" aria-hidden="true" />
          <span>这是全局页面变更，会影响使用该页面的所有账套。</span>
        </div>
        <AiProposalDiff :proposal="proposal" />
        <div v-if="proposal.validationIssues.length" class="ai-approval-dialog__issues">
          <p v-for="issue in proposal.validationIssues" :key="`${issue.path}-${issue.message}`" :class="`is-${issue.level}`">
            <i :class="issue.level === 'error' ? 'ri-error-warning-line' : 'ri-alert-line'" aria-hidden="true" />
            <span>{{ issue.path }}：{{ issue.message }}</span>
          </p>
        </div>
        <label class="ai-approval-dialog__confirm">
          <input v-model="confirmed" type="checkbox" />
          <span>我已审阅差异，并理解该变更的全局影响。</span>
        </label>
        <p v-if="errorMessage" class="ai-approval-dialog__error" role="alert">{{ errorMessage }}</p>
      </div>
      <footer>
        <button class="is-secondary" type="button" :disabled="applying" @click="reject">拒绝方案</button>
        <button class="is-primary" type="button" :disabled="!confirmed || applying || hasErrors" @click="apply">
          <i :class="applying ? 'ri-loader-4-line ai-dialog-spin' : 'ri-check-line'" aria-hidden="true" />
          <span>{{ applying ? '应用中...' : '确认应用' }}</span>
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { AiProposal } from '../../types/ai';
import { useAiAssistant } from '../../composables/useAiAssistant';

const props = defineProps<{ open: boolean; proposal: AiProposal }>();
const emit = defineEmits<{ close: []; applied: [AiProposal]; rejected: [AiProposal] }>();
const assistant = useAiAssistant();
const confirmed = ref(false);
const applying = ref(false);
const errorMessage = ref('');
const hasErrors = computed(() => props.proposal.validationIssues.some((issue) => issue.level === 'error'));
function close() { if (!applying.value) emit('close'); }
async function apply() {
  applying.value = true;
  errorMessage.value = '';
  try {
    const result = await assistant.applyProposal(props.proposal);
    emit('applied', result.proposal);
    emit('close');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '页面变更应用失败。';
  } finally { applying.value = false; }
}
async function reject() {
  applying.value = true;
  try {
    const result = await assistant.rejectProposal(props.proposal);
    emit('rejected', result);
    emit('close');
  } finally { applying.value = false; }
}
watch(() => props.open, (value) => { if (value) { confirmed.value = false; errorMessage.value = ''; } });
</script>

<style scoped>
.ai-approval-dialog { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; background: rgb(15 23 42 / 46%); padding: 16px; }
.ai-approval-dialog > section { display: flex; width: min(720px, 100%); max-height: min(760px, calc(100vh - 32px)); flex-direction: column; border: 1px solid #d6dde8; border-radius: 7px; background: #ffffff; box-shadow: 0 24px 64px rgb(15 23 42 / 26%); overflow: hidden; }
.ai-approval-dialog header, .ai-approval-dialog footer { display: flex; flex: none; align-items: center; justify-content: space-between; border-bottom: 1px solid #e4e9f0; padding: 12px 16px; }
.ai-approval-dialog header > div { display: flex; align-items: center; gap: 10px; }
.ai-approval-dialog__icon { display: inline-grid; width: 34px; height: 34px; place-items: center; border-radius: 6px; background: #eaf2ff; color: #1d64d8; font-size: 18px; }
.ai-approval-dialog h3, .ai-approval-dialog p { margin: 0; }
.ai-approval-dialog h3 { color: #172033; font-size: 15px; }
.ai-approval-dialog header p { margin-top: 2px; color: #64748b; font-size: 12px; }
.ai-approval-dialog header button { border: 0; background: transparent; color: #64748b; cursor: pointer; font-size: 18px; }
.ai-approval-dialog__body { display: grid; gap: 12px; min-height: 0; overflow: auto; padding: 14px 16px; }
.ai-approval-dialog__warning { display: flex; align-items: center; gap: 8px; border: 1px solid #f2cc79; border-radius: 5px; background: #fffbeb; color: #8a5b0a; padding: 9px 10px; font-size: 12px; }
.ai-approval-dialog__issues { display: grid; gap: 5px; }
.ai-approval-dialog__issues p { display: flex; gap: 6px; color: #975a16; font-size: 11px; }
.ai-approval-dialog__issues p.is-error { color: #c53030; }
.ai-approval-dialog__confirm { display: flex; align-items: flex-start; gap: 7px; color: #334155; cursor: pointer; font-size: 12px; }
.ai-approval-dialog__error { color: #c53030; font-size: 12px; }
.ai-approval-dialog footer { justify-content: flex-end; gap: 8px; border-top: 1px solid #e4e9f0; border-bottom: 0; }
.ai-approval-dialog footer button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 5px; border-radius: 5px; cursor: pointer; padding: 0 14px; font-size: 12px; }
.ai-approval-dialog footer button:disabled { cursor: not-allowed; opacity: 0.55; }
.ai-approval-dialog footer .is-secondary { border: 1px solid #ccd5e1; background: #ffffff; color: #475569; }
.ai-approval-dialog footer .is-primary { border: 1px solid #1d64d8; background: #1d64d8; color: #ffffff; }
.ai-dialog-spin { animation: ai-dialog-spin 0.8s linear infinite; }
@keyframes ai-dialog-spin { to { transform: rotate(360deg); } }
</style>
