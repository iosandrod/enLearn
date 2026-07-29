<template>
  <div class="ecw-chat">
    <button
      class="ecw-chat__trigger"
      type="button"
      title="聊天"
      aria-label="聊天"
      @click="toggleOpen"
    >
      <i class="ri-chat-3-line" aria-hidden="true" />
      <span v-if="totalUnread > 0" class="ecw-chat__badge">{{ unreadLabel }}</span>
    </button>

    <section
      v-if="open"
      :class="['ecw-chat__panel', { 'ecw-chat__panel--wide': wide }]"
      aria-label="聊天窗口"
    >
      <header class="ecw-chat__header">
        <div class="ecw-chat__heading">
          <strong>{{ title }}</strong>
          <span :class="['ecw-chat__status', `ecw-chat__status--${socketStatus}`]">
            <span class="ecw-chat__status-dot" />
            {{ statusLabel }}
          </span>
        </div>

        <div class="ecw-chat__header-actions">
          <button type="button" title="重连" aria-label="重连" @click="reconnect">
            <i class="ri-link" aria-hidden="true" />
          </button>
          <button type="button" title="刷新" aria-label="刷新" @click="loadConversations">
            <i class="ri-refresh-line" aria-hidden="true" />
          </button>
          <button type="button" :title="wide ? '收起' : '展开'" :aria-label="wide ? '收起' : '展开'" @click="wide = !wide">
            <i :class="wide ? 'ri-contract-left-right-line' : 'ri-expand-left-right-line'" aria-hidden="true" />
          </button>
          <button type="button" title="关闭" aria-label="关闭" @click="open = false">
            <i class="ri-close-line" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div v-if="socket.lastError.value" class="ecw-chat__alert">
        <span>{{ socket.lastError.value.message }}</span>
        <button type="button" @click="reconnect">重试</button>
      </div>

      <div class="ecw-chat__tools">
        <label class="ecw-chat__search">
          <i class="ri-search-line" aria-hidden="true" />
          <input v-model.trim="conversationKeyword" type="search" placeholder="搜索会话" />
        </label>
        <button
          :class="['ecw-chat__tool-button', { 'ecw-chat__tool-button--active': showNewDirect }]"
          type="button"
          title="新建单聊"
          aria-label="新建单聊"
          @click="showNewDirect = !showNewDirect"
        >
          <i class="ri-user-add-line" aria-hidden="true" />
        </button>
      </div>

      <div v-if="showNewDirect" class="ecw-chat__new">
        <input
          v-model.trim="targetUserId"
          type="text"
          placeholder="输入用户 ID 发起单聊"
          @keydown.enter.prevent="createDirect"
        />
        <button type="button" title="创建" aria-label="创建" :disabled="!targetUserId" @click="createDirect">
          <i class="ri-add-line" aria-hidden="true" />
        </button>
      </div>

      <div class="ecw-chat__body">
        <aside class="ecw-chat__conversations">
          <p v-if="loadingConversations" class="ecw-chat__state">加载中...</p>
          <p v-else-if="conversationError" class="ecw-chat__state ecw-chat__state--error">
            {{ conversationError }}
          </p>
          <p v-else-if="filteredConversations.length === 0" class="ecw-chat__state">
            {{ conversations.length ? '没有匹配会话' : '暂无会话' }}
          </p>

          <button
            v-for="conversation in filteredConversations"
            v-else
            :key="conversation.id"
            :class="[
              'ecw-chat__conversation',
              { 'ecw-chat__conversation--active': conversation.id === activeConversationId }
            ]"
            type="button"
            @click="selectConversation(conversation.id)"
          >
            <span class="ecw-chat__avatar">{{ getConversationAvatar(conversation) }}</span>
            <span class="ecw-chat__conversation-main">
              <span class="ecw-chat__conversation-title">
                {{ getConversationTitle(conversation) }}
              </span>
              <span class="ecw-chat__conversation-preview">
                {{ getConversationPreview(conversation) }}
              </span>
            </span>
            <span class="ecw-chat__conversation-side">
              <time>{{ formatShortTime(conversation.lastMessageAt ?? conversation.updatedAt) }}</time>
              <span v-if="getUnreadCount(conversation) > 0" class="ecw-chat__conversation-badge">
                {{ getUnreadCount(conversation) > 99 ? '99+' : getUnreadCount(conversation) }}
              </span>
            </span>
          </button>
        </aside>

        <section class="ecw-chat__messages">
          <template v-if="activeConversationId">
            <div class="ecw-chat__active-bar">
              <div>
                <strong>{{ activeConversation ? getConversationTitle(activeConversation) : '会话' }}</strong>
                <span>{{ visibleMessages.length }} 条消息</span>
              </div>
              <button type="button" title="标记已读" aria-label="标记已读" @click="markActiveRead">
                <i class="ri-check-double-line" aria-hidden="true" />
              </button>
            </div>

            <div ref="messageListEl" class="ecw-chat__message-list">
              <p v-if="loadingMessages" class="ecw-chat__state">加载消息中...</p>
              <p v-else-if="messageError" class="ecw-chat__state ecw-chat__state--error">
                {{ messageError }}
              </p>
              <p v-else-if="visibleMessages.length === 0" class="ecw-chat__state">
                还没有消息
              </p>

              <template v-for="item in timelineItems" v-else :key="item.key">
                <div v-if="item.kind === 'date'" class="ecw-chat__date-separator">
                  {{ item.label }}
                </div>
                <article
                  v-else
                  :class="[
                    'ecw-chat__message',
                    { 'ecw-chat__message--mine': isMine(item.message) }
                  ]"
                >
                  <div class="ecw-chat__message-avatar">
                    {{ isMine(item.message) ? '我' : 'TA' }}
                  </div>
                  <div class="ecw-chat__bubble">
                    <p>{{ item.message.status === 'deleted' ? '消息已删除' : item.message.content }}</p>
                    <footer>
                      <span>{{ item.message.status === 'sending' ? '发送中' : formatShortTime(item.message.createdAt) }}</span>
                      <span v-if="item.message.status === 'edited'">已编辑</span>
                    </footer>
                  </div>
                </article>
              </template>
            </div>

            <div v-if="typingSummary" class="ecw-chat__typing">{{ typingSummary }}</div>

            <form class="ecw-chat__composer" @submit.prevent="sendActiveMessage">
              <textarea
                v-model="draft"
                rows="1"
                maxlength="2000"
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                @focus="setTyping(true)"
                @blur="setTyping(false)"
                @keydown.enter.exact.prevent="sendActiveMessage"
              />
              <div class="ecw-chat__composer-side">
                <span>{{ draft.length }}/2000</span>
                <button type="submit" title="发送" aria-label="发送" :disabled="!draft.trim()">
                  <i class="ri-send-plane-2-line" aria-hidden="true" />
                </button>
              </div>
            </form>
          </template>

          <div v-else class="ecw-chat__empty">
            <i class="ri-chat-smile-3-line" aria-hidden="true" />
            <strong>选择一个会话开始聊天</strong>
            <span>也可以点击左上角新建单聊</span>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type {
  ChatWidgetApi,
  ChatWidgetConversation,
  ChatWidgetMessage,
  ChatWidgetSocket
} from '../types/chat';

type TimelineItem =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'message'; key: string; message: ChatWidgetMessage };

const props = withDefaults(
  defineProps<{
    api: ChatWidgetApi;
    socket: ChatWidgetSocket;
    currentUserId?: string;
    title?: string;
  }>(),
  {
    currentUserId: '',
    title: '聊天'
  }
);

const open = ref(false);
const wide = ref(false);
const showNewDirect = ref(false);
const targetUserId = ref('');
const conversationKeyword = ref('');
const conversations = ref<ChatWidgetConversation[]>([]);
const activeConversationId = ref('');
const loadingConversations = ref(false);
const loadingMessages = ref(false);
const conversationError = ref('');
const messageError = ref('');
const draft = ref('');
const messageListEl = ref<HTMLElement | null>(null);

const socketStatus = computed(() => props.socket.status.value);
const activeConversation = computed(() =>
  conversations.value.find((conversation) => conversation.id === activeConversationId.value) ?? null
);
const visibleMessages = computed(() =>
  props.socket.messages.value
    .filter((message) => message.conversationId === activeConversationId.value)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
);
const filteredConversations = computed(() => {
  const keyword = conversationKeyword.value.toLowerCase();
  if (!keyword) return conversations.value;

  return conversations.value.filter((conversation) =>
    getConversationTitle(conversation).toLowerCase().includes(keyword) ||
    getConversationPreview(conversation).toLowerCase().includes(keyword)
  );
});
const totalUnread = computed(() =>
  conversations.value.reduce((total, conversation) => total + getUnreadCount(conversation), 0)
);
const unreadLabel = computed(() => (totalUnread.value > 99 ? '99+' : String(totalUnread.value)));
const statusLabel = computed(() => {
  switch (socketStatus.value) {
    case 'connected':
      return '已连接';
    case 'connecting':
      return '连接中';
    case 'error':
      return '连接异常';
    case 'disconnected':
      return '已断开';
    default:
      return '未连接';
  }
});
const timelineItems = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = [];
  let lastDate = '';

  for (const message of visibleMessages.value) {
    const dateLabel = formatDateLabel(message.createdAt);
    if (dateLabel && dateLabel !== lastDate) {
      lastDate = dateLabel;
      items.push({ kind: 'date', key: `date:${dateLabel}`, label: dateLabel });
    }
    items.push({ kind: 'message', key: `message:${message.id}`, message });
  }

  return items;
});
const typingSummary = computed(() => '');

async function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    await reconnect();
    await loadConversations();
  }
}

async function reconnect() {
  props.socket.disconnect?.();
  await props.socket.connect();
}

async function loadConversations() {
  loadingConversations.value = true;
  conversationError.value = '';

  try {
    conversations.value = await props.api.listConversations({ pageSize: 50 });
    if (!activeConversationId.value && conversations.value[0]) {
      await selectConversation(conversations.value[0].id);
    }
  } catch (error) {
    conversationError.value = error instanceof Error ? error.message : '会话加载失败';
  } finally {
    loadingConversations.value = false;
  }
}

async function selectConversation(conversationId: string) {
  if (activeConversationId.value && activeConversationId.value !== conversationId) {
    await props.socket.leaveConversation(activeConversationId.value);
  }

  activeConversationId.value = conversationId;
  messageError.value = '';
  loadingMessages.value = true;

  try {
    const loadedMessages = await props.api.listMessages({ conversationId, pageSize: 80 });
    props.socket.messages.value = [
      ...props.socket.messages.value.filter((message) => message.conversationId !== conversationId),
      ...loadedMessages
    ];
    await props.socket.joinConversation(conversationId);
    await markActiveRead();
    await nextTick(scrollToBottom);
  } catch (error) {
    messageError.value = error instanceof Error ? error.message : '消息加载失败';
  } finally {
    loadingMessages.value = false;
  }
}

async function createDirect() {
  if (!targetUserId.value) return;

  conversationError.value = '';

  try {
    const conversation = await props.api.createDirectConversation({
      targetUserId: targetUserId.value
    });
    targetUserId.value = '';
    showNewDirect.value = false;
    conversations.value = [
      conversation,
      ...conversations.value.filter((item) => item.id !== conversation.id)
    ];
    await selectConversation(conversation.id);
  } catch (error) {
    conversationError.value = error instanceof Error ? error.message : '新建会话失败';
  }
}

async function sendActiveMessage() {
  const content = draft.value.trim();
  if (!content || !activeConversationId.value) return;

  draft.value = '';
  await props.socket.sendMessage({
    conversationId: activeConversationId.value,
    content
  });
  await nextTick(scrollToBottom);
}

async function markActiveRead() {
  if (!activeConversationId.value) return;
  const lastMessage = visibleMessages.value[visibleMessages.value.length - 1];
  await props.socket.markRead(activeConversationId.value, lastMessage?.id);
  conversations.value = conversations.value.map((conversation) =>
    conversation.id === activeConversationId.value
      ? { ...conversation, unreadCount: 0, unread_count: 0 }
      : conversation
  );
}

async function setTyping(isTyping: boolean) {
  if (!activeConversationId.value) return;
  await props.socket.setTyping(activeConversationId.value, isTyping);
}

function getConversationTitle(conversation: ChatWidgetConversation) {
  if (conversation.title) return conversation.title;
  if (conversation.type === 'direct') return '单聊会话';
  if (conversation.type === 'system') return '系统会话';
  return '群聊';
}

function getConversationAvatar(conversation: ChatWidgetConversation) {
  const title = getConversationTitle(conversation);
  if (conversation.type === 'direct') return title.slice(0, 1).toUpperCase();
  if (conversation.type === 'system') return '系';
  return '群';
}

function getConversationPreview(conversation: ChatWidgetConversation) {
  const source = conversation.metadata?.lastMessagePreview;
  if (typeof source === 'string' && source.trim()) return source;
  if (conversation.lastMessageAt) return '最近有新消息';
  return '还没有消息';
}

function getUnreadCount(conversation: ChatWidgetConversation) {
  return conversation.unreadCount ?? conversation.unread_count ?? 0;
}

function isMine(message: ChatWidgetMessage) {
  return message.senderId === props.currentUserId || message.sender_id === props.currentUserId || message.status === 'sending';
}

function formatShortTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function scrollToBottom() {
  if (!messageListEl.value) return;
  messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
}

watch(
  () => visibleMessages.value.length,
  () => nextTick(scrollToBottom)
);
</script>

<style scoped>
.ecw-chat {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 24px;
}

.ecw-chat__trigger {
  position: relative;
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

.ecw-chat__trigger:hover {
  background: rgba(255, 255, 255, 0.16);
}

.ecw-chat__badge,
.ecw-chat__conversation-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e11d48;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
}

.ecw-chat__badge {
  position: absolute;
  top: 1px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
}

.ecw-chat__panel {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 70;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: min(820px, calc(100vw - 24px));
  height: min(620px, calc(100vh - 88px));
  border: 1px solid #cfd8e6;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.22);
  color: #111827;
  overflow: hidden;
}

.ecw-chat__panel--wide {
  width: min(1080px, calc(100vw - 24px));
  height: min(720px, calc(100vh - 72px));
}

.ecw-chat__header,
.ecw-chat__tools,
.ecw-chat__new {
  border-bottom: 1px solid #e5eaf1;
}

.ecw-chat__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  padding: 0 12px;
}

.ecw-chat__heading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ecw-chat__heading strong {
  font-size: 14px;
}

.ecw-chat__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #64748b;
  font-size: 12px;
}

.ecw-chat__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #94a3b8;
}

.ecw-chat__status--connected {
  color: #047857;
}

.ecw-chat__status--connected .ecw-chat__status-dot {
  background: #10b981;
}

.ecw-chat__status--error,
.ecw-chat__state--error {
  color: #dc2626;
}

.ecw-chat__status--error .ecw-chat__status-dot {
  background: #ef4444;
}

.ecw-chat__header-actions {
  display: inline-flex;
  gap: 6px;
}

.ecw-chat__header-actions button,
.ecw-chat__tool-button,
.ecw-chat__new button,
.ecw-chat__active-bar button,
.ecw-chat__composer button {
  display: inline-grid;
  place-items: center;
  border: 0;
  cursor: pointer;
}

.ecw-chat__header-actions button,
.ecw-chat__tool-button,
.ecw-chat__active-bar button {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  font-size: 16px;
}

.ecw-chat__header-actions button:hover,
.ecw-chat__tool-button:hover,
.ecw-chat__tool-button--active,
.ecw-chat__active-bar button:hover {
  background: #eef4ff;
  color: #2563eb;
}

.ecw-chat__alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #fecaca;
  background: #fff1f2;
  color: #be123c;
  font-size: 12px;
}

.ecw-chat__alert button {
  border: 0;
  background: transparent;
  color: #be123c;
  cursor: pointer;
  font-weight: 700;
}

.ecw-chat__tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 8px;
  padding: 9px 12px;
}

.ecw-chat__search {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  height: 34px;
  border: 1px solid #d7dee8;
  border-radius: 6px;
  padding: 0 9px;
  color: #64748b;
}

.ecw-chat__search input,
.ecw-chat__new input,
.ecw-chat__composer textarea {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #0f172a;
  outline: none;
}

.ecw-chat__new {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 8px;
  padding: 10px 12px;
  background: #f8fafc;
}

.ecw-chat__new input {
  height: 34px;
  border: 1px solid #d7dee8;
  border-radius: 6px;
  padding: 0 10px;
  background: #ffffff;
}

.ecw-chat__new button,
.ecw-chat__composer button {
  border-radius: 6px;
  background: #2563eb;
  color: #ffffff;
  font-size: 17px;
}

.ecw-chat__new button:disabled,
.ecw-chat__composer button:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.ecw-chat__body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 0;
}

.ecw-chat__conversations {
  min-height: 0;
  border-right: 1px solid #e5eaf1;
  background: #fbfdff;
  overflow-y: auto;
}

.ecw-chat__conversation {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 10px;
  width: 100%;
  min-height: 66px;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  background: transparent;
  padding: 10px 12px;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.ecw-chat__conversation:hover,
.ecw-chat__conversation--active {
  background: #eef6ff;
}

.ecw-chat__avatar,
.ecw-chat__message-avatar {
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 700;
}

.ecw-chat__avatar {
  width: 36px;
  height: 36px;
  align-self: center;
  font-size: 13px;
}

.ecw-chat__conversation-main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.ecw-chat__conversation-title,
.ecw-chat__conversation-preview,
.ecw-chat__conversation-side time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ecw-chat__conversation-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.ecw-chat__conversation-preview,
.ecw-chat__conversation-side {
  color: #64748b;
  font-size: 11px;
}

.ecw-chat__conversation-side {
  display: grid;
  justify-items: end;
  gap: 7px;
}

.ecw-chat__conversation-badge {
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
}

.ecw-chat__messages {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  min-height: 0;
  background: #f7f9fc;
}

.ecw-chat__active-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid #e5eaf1;
  background: #ffffff;
}

.ecw-chat__active-bar div {
  display: grid;
  gap: 2px;
}

.ecw-chat__active-bar strong {
  color: #0f172a;
  font-size: 14px;
}

.ecw-chat__active-bar span {
  color: #64748b;
  font-size: 11px;
}

.ecw-chat__message-list {
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
}

.ecw-chat__date-separator {
  width: fit-content;
  margin: 6px auto 14px;
  border-radius: 999px;
  background: #e2e8f0;
  padding: 3px 9px;
  color: #475569;
  font-size: 11px;
}

.ecw-chat__message {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.ecw-chat__message--mine {
  grid-template-columns: minmax(0, 1fr) 28px;
}

.ecw-chat__message--mine .ecw-chat__message-avatar {
  grid-column: 2;
}

.ecw-chat__message--mine .ecw-chat__bubble {
  grid-column: 1;
  grid-row: 1;
  justify-self: end;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.ecw-chat__message-avatar {
  width: 28px;
  height: 28px;
  align-self: end;
  font-size: 11px;
}

.ecw-chat__bubble {
  max-width: min(78%, 460px);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  padding: 9px 10px 7px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.ecw-chat__bubble p {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.ecw-chat__bubble footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 5px;
  color: #64748b;
  font-size: 10px;
}

.ecw-chat__typing {
  min-height: 20px;
  padding: 0 14px 6px;
  color: #64748b;
  font-size: 12px;
}

.ecw-chat__composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #e5eaf1;
  background: #ffffff;
}

.ecw-chat__composer textarea {
  height: 42px;
  max-height: 120px;
  border: 1px solid #d7dee8;
  border-radius: 6px;
  padding: 10px;
  resize: vertical;
}

.ecw-chat__composer-side {
  display: grid;
  gap: 6px;
  justify-items: end;
}

.ecw-chat__composer-side span {
  color: #94a3b8;
  font-size: 10px;
}

.ecw-chat__composer button {
  width: 40px;
  height: 34px;
}

.ecw-chat__state,
.ecw-chat__empty {
  margin: 0;
  padding: 24px 12px;
  color: #64748b;
  text-align: center;
}

.ecw-chat__empty {
  display: grid;
  min-height: 100%;
  place-items: center;
  align-content: center;
  gap: 8px;
}

.ecw-chat__empty i {
  color: #2563eb;
  font-size: 32px;
}

.ecw-chat__empty strong {
  color: #0f172a;
}

.ecw-chat__empty span {
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 760px) {
  .ecw-chat__panel,
  .ecw-chat__panel--wide {
    position: fixed;
    inset: 56px 10px 10px;
    width: auto;
    height: auto;
  }

  .ecw-chat__body {
    grid-template-columns: 154px minmax(0, 1fr);
  }

  .ecw-chat__conversation {
    grid-template-columns: minmax(0, 1fr);
  }

  .ecw-chat__avatar,
  .ecw-chat__conversation-side {
    display: none;
  }
}
</style>

