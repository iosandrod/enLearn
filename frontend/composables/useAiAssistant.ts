import { computed, ref } from 'vue';
import type {
  AiConversation,
  AiMessage,
  AiProposal,
  AiRunMode,
  AiRunRequest,
  AiStreamEvent,
  AiToolTrace
} from '../types/ai';
import { useAiStream } from './useAiStream';
import { useAiPageContext } from './useAiPageContext';

const open = ref(false);
const mode = ref<AiRunMode>('ask');
const sessionId = ref<string>();
const runId = ref<string>();
const lastEventSequence = ref(0);
const running = ref(false);
const statusText = ref('');
const messages = ref<AiMessage[]>([]);
const traces = ref<AiToolTrace[]>([]);
const proposals = ref<AiProposal[]>([]);
const conversations = ref<AiConversation[]>([]);
const errorMessage = ref('');
const includeSampleData = ref(false);
let abortController: AbortController | undefined;
const appliedEvent = 'enlearn:ai-page-applied';

function id(prefix: string) {
  return `${prefix}-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()}`;
}

export function useAiAssistant() {
  const stream = useAiStream();
  const pageContext = useAiPageContext();
  const { request } = useAuthenticatedFetch();

  const currentPage = computed(() => pageContext.pageRecord.value);
  const canUsePageMode = computed(() => Boolean(currentPage.value?.id));

  function handleEvent(event: AiStreamEvent) {
    if (event.sequence <= lastEventSequence.value && event.runId === runId.value) return;
    runId.value = event.runId;
    sessionId.value = event.sessionId;
    lastEventSequence.value = Math.max(lastEventSequence.value, event.sequence);
    if (event.type === 'assistant.status') {
      statusText.value = String(event.payload.message ?? '');
      return;
    }
    if (event.type === 'assistant.delta') {
      const target = [...messages.value].reverse().find((message) => message.streaming);
      if (target) target.content += String(event.payload.delta ?? '');
      return;
    }
    if (event.type === 'tool.call') {
      traces.value.push({
        id: String(event.payload.toolCallId ?? id('tool')),
        name: String(event.payload.name ?? 'tool'),
        status: 'running',
        arguments: event.payload.arguments as Record<string, unknown> | undefined
      });
      return;
    }
    if (event.type === 'tool.result') {
      const trace = traces.value.find((item) => item.id === event.payload.toolCallId);
      if (trace) {
        trace.status = event.payload.status === 'failed' ? 'failed' : 'completed';
        trace.result = event.payload.result;
      }
      return;
    }
    if (event.type === 'proposal.created') {
      const proposal = event.payload.proposal as AiProposal | undefined;
      if (proposal && !proposals.value.some((item) => item.id === proposal.id)) {
        proposals.value.push(proposal);
      }
      return;
    }
    if (event.type === 'error') {
      const message = String(event.payload.message ?? 'AI 生成失败。');
      errorMessage.value = message;
      const target = [...messages.value].reverse().find((message) => message.streaming);
      if (target) {
        target.error = true;
        if (!target.content) target.content = message;
      }
      return;
    }
    if (event.type === 'done') {
      const target = [...messages.value].reverse().find((message) => message.streaming);
      if (target) {
        target.streaming = false;
        if (!target.content) {
          target.content = event.payload.status === 'cancelled'
            ? '已取消生成。'
            : event.payload.status === 'failed'
              ? errorMessage.value || 'AI 生成失败。'
              : '处理完成。';
        }
      }
      running.value = false;
      statusText.value = '';
    }
  }

  async function send(message: string) {
    const text = message.trim();
    if (!text || running.value) return;
    if (mode.value !== 'ask' && !canUsePageMode.value && mode.value !== 'create_page') {
      errorMessage.value = '请先打开一个低代码页面，再生成页面修改、按钮或函数。';
      return;
    }
    errorMessage.value = '';
    const context = pageContext.build(includeSampleData.value);
    messages.value.push({ id: id('user'), role: 'user', content: text, createdAt: new Date().toISOString() });
    messages.value.push({ id: id('assistant'), role: 'assistant', content: '', createdAt: new Date().toISOString(), streaming: true });
    running.value = true;
    statusText.value = '正在连接 AI...';
    abortController = new AbortController();
    const controller = abortController;
    const requestId = id('request');
    lastEventSequence.value = 0;
    const input: AiRunRequest = {
      sessionId: sessionId.value,
      mode: mode.value,
      message: text,
      pageRef: context.pageRef,
      selection: pageContext.selection.value,
      clientContext: context.clientContext,
      includeSampleData: includeSampleData.value
    };
    try {
      await stream.start(input, { requestId, signal: controller.signal, onEvent: handleEvent });
    } catch (error) {
      if (controller.signal.aborted) return;
      const targetRunId = runId.value;
      try {
        if (targetRunId) {
          await stream.resume(targetRunId, lastEventSequence.value, {
            signal: controller.signal,
            onEvent: handleEvent
          });
        } else {
          await stream.start(input, {
            requestId,
            signal: controller.signal,
            onEvent: handleEvent
          });
        }
        return;
      } catch {
        // Surface the original connection error after a single recovery attempt.
      }
      running.value = false;
      statusText.value = '';
      errorMessage.value = error instanceof Error ? error.message : 'AI 连接失败。';
      const target = [...messages.value].reverse().find((item) => item.streaming);
      if (target) {
        target.streaming = false;
        target.error = true;
        target.content ||= errorMessage.value;
      }
    } finally {
      if (abortController === controller) abortController = undefined;
    }
  }

  async function cancel() {
    const targetRunId = runId.value;
    const wasRunning = running.value;
    abortController?.abort();
    running.value = false;
    statusText.value = '';
    if (wasRunning && targetRunId) {
      await request(`/api/ai/runs/${encodeURIComponent(targetRunId)}/cancel`, { method: 'POST' }).catch(() => undefined);
    }
  }

  async function loadConversations() {
    conversations.value = await request<AiConversation[]>('/api/ai/conversations');
  }

  async function openConversation(conversation: AiConversation) {
    sessionId.value = conversation.id;
    mode.value = conversation.mode;
    const rows = await request<Array<{ id: string; role: AiMessage['role']; content: string; createdAt?: string; created_at?: string }>>(
      `/api/ai/conversations/${encodeURIComponent(conversation.id)}/messages`
    );
    messages.value = rows
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        createdAt: item.createdAt ?? item.created_at ?? new Date().toISOString()
      }));
  }

  function newConversation() {
    void cancel();
    sessionId.value = undefined;
    runId.value = undefined;
    lastEventSequence.value = 0;
    messages.value = [];
    traces.value = [];
    proposals.value = [];
    errorMessage.value = '';
    includeSampleData.value = false;
  }

  function resetForIdentityChange() {
    abortController?.abort();
    abortController = undefined;
    open.value = false;
    mode.value = 'ask';
    sessionId.value = undefined;
    runId.value = undefined;
    lastEventSequence.value = 0;
    running.value = false;
    statusText.value = '';
    messages.value = [];
    traces.value = [];
    proposals.value = [];
    conversations.value = [];
    errorMessage.value = '';
    includeSampleData.value = false;
  }

  async function applyProposal(proposal: AiProposal) {
    const response = await request<{ proposal: AiProposal; page?: Record<string, unknown> }>(
      `/api/ai/proposals/${encodeURIComponent(proposal.id)}/apply`,
      { method: 'POST' }
    );
    const index = proposals.value.findIndex((item) => item.id === proposal.id);
    if (index >= 0) proposals.value[index] = response.proposal;
    window.dispatchEvent(new CustomEvent(appliedEvent, { detail: response.page }));
    return response;
  }

  async function rejectProposal(proposal: AiProposal) {
    const updated = await request<AiProposal>(
      `/api/ai/proposals/${encodeURIComponent(proposal.id)}/reject`,
      { method: 'POST' }
    );
    const index = proposals.value.findIndex((item) => item.id === proposal.id);
    if (index >= 0) proposals.value[index] = updated;
    return updated;
  }

  return {
    open,
    mode,
    sessionId,
    runId,
    running,
    statusText,
    messages,
    traces,
    proposals,
    conversations,
    errorMessage,
    includeSampleData,
    currentPage,
    canUsePageMode,
    send,
    cancel,
    loadConversations,
    openConversation,
    newConversation,
    resetForIdentityChange,
    applyProposal,
    rejectProposal
  };
}
