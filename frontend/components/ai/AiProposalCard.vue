<template>
  <article class="ai-proposal-card" :class="`is-${proposal.status}`">
    <header>
      <span><i :class="proposalIcon" aria-hidden="true" /></span>
      <div>
        <strong>{{ proposal.summary }}</strong>
        <small>{{ kindLabel }} · {{ statusLabel }}</small>
      </div>
    </header>
    <AiProposalDiff :proposal="proposal" />
    <div v-if="proposal.validationIssues.length" class="ai-proposal-card__validation">
      <span v-for="issue in proposal.validationIssues.slice(0, 3)" :key="`${issue.path}-${issue.message}`" :class="`is-${issue.level}`">
        <i :class="issue.level === 'error' ? 'ri-close-circle-line' : 'ri-alert-line'" />
        {{ issue.message }}
      </span>
    </div>
    <footer v-if="proposal.status === 'awaiting_approval' || proposal.status === 'validated'">
      <button type="button" @click="previewOpen = true"><i class="ri-eye-line" /> 预览并确认</button>
    </footer>
    <AiApprovalDialog :open="previewOpen" :proposal="proposal" @close="previewOpen = false" />
  </article>
</template>

<script setup lang="ts">
import type { AiProposal } from '../../types/ai';
const props = defineProps<{ proposal: AiProposal }>();
const previewOpen = ref(false);
const labels = {
  create_page: '新建页面', edit_page: '修改页面', create_button: '按钮动作', create_page_function: '页面函数'
};
const statusLabels = {
  draft: '待修正', validated: '已校验', awaiting_approval: '等待确认', applied: '已应用', rejected: '已拒绝', expired: '已过期', conflicted: '版本冲突'
};
const kindLabel = computed(() => labels[props.proposal.kind]);
const statusLabel = computed(() => statusLabels[props.proposal.status]);
const proposalIcon = computed(() => ({
  create_page: 'ri-layout-grid-line', edit_page: 'ri-file-edit-line', create_button: 'ri-cursor-line', create_page_function: 'ri-braces-line'
})[props.proposal.kind]);
</script>

<style scoped>
.ai-proposal-card { display: grid; gap: 8px; border: 1px solid #b9cdec; border-radius: 6px; background: #f8fbff; padding: 9px; }
.ai-proposal-card.is-applied { border-color: #9fd6b0; background: #f2fbf5; }
.ai-proposal-card.is-rejected, .ai-proposal-card.is-expired, .ai-proposal-card.is-conflicted { border-color: #d8dee8; background: #f8fafc; opacity: 0.8; }
.ai-proposal-card > header { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 7px; }
.ai-proposal-card > header > span { display: inline-grid; width: 28px; height: 28px; place-items: center; border-radius: 5px; background: #e6efff; color: #1d64d8; }
.ai-proposal-card header div { display: grid; gap: 1px; }
.ai-proposal-card header strong { color: #23324a; font-size: 12px; }
.ai-proposal-card header small { color: #738197; font-size: 10px; }
.ai-proposal-card__validation { display: grid; gap: 3px; }
.ai-proposal-card__validation span { display: flex; gap: 4px; color: #9a6700; font-size: 10px; }
.ai-proposal-card__validation span.is-error { color: #b83232; }
.ai-proposal-card footer { display: flex; justify-content: flex-end; border-top: 1px solid #dbe5f2; padding-top: 7px; }
.ai-proposal-card footer button { display: inline-flex; min-height: 28px; align-items: center; gap: 4px; border: 1px solid #1d64d8; border-radius: 4px; background: #1d64d8; color: #ffffff; cursor: pointer; padding: 0 10px; font-size: 11px; }
</style>

