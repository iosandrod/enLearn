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

    <section v-if="open" :class="['ecw-chat__panel', { 'ecw-chat__panel--wide': wide }]">
      <aside class="ecw-chat__rail">
        <button
          v-for="item in navItems"
          :key="item.key"
          :class="['ecw-chat__rail-button', { 'ecw-chat__rail-button--active': activeNav === item.key }]"
          type="button"
          :title="item.label"
          :aria-label="item.label"
          @click="activeNav = item.key"
        >
          <i :class="item.icon" aria-hidden="true" />
          <span v-if="item.key === 'chats' && totalUnread > 0" class="ecw-chat__rail-badge" />
        </button>

        <div class="ecw-chat__rail-bottom">
          <button type="button" title="重连" aria-label="重连" @click="reconnect">
            <i class="ri-link" aria-hidden="true" />
          </button>
          <button type="button" :title="wide ? '收起' : '展开'" :aria-label="wide ? '收起' : '展开'" @click="wide = !wide">
            <i :class="wide ? 'ri-contract-left-right-line' : 'ri-expand-left-right-line'" aria-hidden="true" />
          </button>
          <button type="button" title="关闭" aria-label="关闭" @click="open = false">
            <i class="ri-close-line" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <section class="ecw-chat__list-pane">
        <header class="ecw-chat__list-header">
          <div>
            <strong>{{ activeNavLabel }}</strong>
            <span :class="['ecw-chat__status', `ecw-chat__status--${socketStatus}`]">
              <span class="ecw-chat__status-dot" />
              {{ statusLabel }}
            </span>
          </div>
          <button type="button" title="刷新" aria-label="刷新" @click="loadConversations">
            <i class="ri-refresh-line" aria-hidden="true" />
          </button>
        </header>

        <div v-if="socket.lastError.value" class="ecw-chat__alert">
          <span>{{ socket.lastError.value.message }}</span>
          <button type="button" @click="reconnect">重试</button>
        </div>

        <div class="ecw-chat__search-row">
          <label class="ecw-chat__search">
            <i class="ri-search-line" aria-hidden="true" />
            <input v-model.trim="keyword" type="search" :placeholder="searchPlaceholder" />
          </label>
          <button
            class="ecw-chat__square-button"
            type="button"
            title="新建单聊"
            aria-label="新建单聊"
            @click="showNewDirect = !showNewDirect"
          >
            <i class="ri-user-add-line" aria-hidden="true" />
          </button>
        </div>

        <div v-if="showNewDirect" class="ecw-chat__new-direct">
          <input
            v-model.trim="targetUserId"
            type="text"
            placeholder="输入用户 ID"
            @keydown.enter.prevent="createDirect"
          />
          <button type="button" :disabled="!targetUserId" @click="createDirect">发起</button>
        </div>

        <div class="ecw-chat__list">
          <p v-if="loadingConversations" class="ecw-chat__state">加载中...</p>
          <p v-else-if="conversationError" class="ecw-chat__state ecw-chat__state--error">
            {{ conversationError }}
          </p>

          <template v-else-if="activeNav === 'chats'">
            <p v-if="visibleConversations.length === 0" class="ecw-chat__state">暂无聊天记录</p>
            <button
              v-for="conversation in visibleConversations"
              v-else
              :key="conversation.id"
              :class="[
                'ecw-chat__list-item',
                { 'ecw-chat__list-item--active': conversation.id === activeConversationId }
              ]"
              type="button"
              @click="selectConversation(conversation.id)"
            >
              <span :class="['ecw-chat__avatar', `ecw-chat__avatar--${conversation.type}`]">
                {{ getConversationAvatar(conversation) }}
              </span>
              <span class="ecw-chat__item-main">
                <span class="ecw-chat__item-title">{{ getConversationTitle(conversation) }}</span>
                <span class="ecw-chat__item-preview">{{ getConversationPreview(conversation) }}</span>
              </span>
              <span class="ecw-chat__item-side">
                <time>{{ formatShortTime(conversation.lastMessageAt ?? conversation.updatedAt) }}</time>
                <span v-if="getUnreadCount(conversation) > 0" class="ecw-chat__item-badge">
                  {{ getUnreadCount(conversation) > 99 ? '99+' : getUnreadCount(conversation) }}
                </span>
              </span>
            </button>
          </template>

          <template v-else-if="activeNav === 'friends'">
            <p v-if="visibleFriends.length === 0" class="ecw-chat__state">暂无好友会话</p>
            <button
              v-for="friend in visibleFriends"
              v-else
              :key="friend.id"
              :class="[
                'ecw-chat__list-item',
                { 'ecw-chat__list-item--active': friend.id === activeConversationId }
              ]"
              type="button"
              @click="selectConversation(friend.id)"
            >
              <span class="ecw-chat__avatar ecw-chat__avatar--direct">{{ getConversationAvatar(friend) }}</span>
              <span class="ecw-chat__item-main">
                <span class="ecw-chat__item-title">{{ getConversationTitle(friend) }}</span>
                <span class="ecw-chat__item-preview">点击进入单聊</span>
              </span>
            </button>
          </template>

          <template v-else>
            <p v-if="visibleGroups.length === 0" class="ecw-chat__state">暂无群聊</p>
            <button
              v-for="group in visibleGroups"
              v-else
              :key="group.id"
              :class="[
                'ecw-chat__list-item',
                { 'ecw-chat__list-item--active': group.id === activeConversationId }
              ]"
              type="button"
              @click="selectConversation(group.id)"
            >
              <span class="ecw-chat__avatar ecw-chat__avatar--group">{{ getConversationAvatar(group) }}</span>
              <span class="ecw-chat__item-main">
                <span class="ecw-chat__item-title">{{ getConversationTitle(group) }}</span>
                <span class="ecw-chat__item-preview">{{ getConversationPreview(group) }}</span>
              </span>
            </button>
          </template>
        </div>
      </section>

      <main class="ecw-chat__workspace">
        <template v-if="activeConversation">
          <header class="ecw-chat__chat-header">
            <div class="ecw-chat__chat-title">
              <strong>{{ getConversationTitle(activeConversation) }}</strong>
              <span>{{ getConversationMeta(activeConversation) }}</span>
            </div>
            <div class="ecw-chat__chat-actions">
              <button type="button" title="标记已读" aria-label="标记已读" @click="markActiveRead">
                <i class="ri-check-double-line" aria-hidden="true" />
              </button>
              <button type="button" title="更多" aria-label="更多">
                <i class="ri-more-line" aria-hidden="true" />
              </button>
            </div>
          </header>

          <section ref="messageListEl" class="ecw-chat__messages">
            <p v-if="loadingMessages" class="ecw-chat__state">加载消息中...</p>
            <p v-else-if="messageError" class="ecw-chat__state ecw-chat__state--error">
              {{ messageError }}
            </p>
            <div v-else-if="visibleMessages.length === 0" class="ecw-chat__empty-dialog">
              <i class="ri-chat-smile-3-line" aria-hidden="true" />
              <strong>还没有消息</strong>
              <span>发送第一条消息开始对话</span>
            </div>

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
          </section>

          <form class="ecw-chat__composer" @submit.prevent="sendActiveMessage">
            <div class="ecw-chat__composer-toolbar">
              <button type="button" title="表情" aria-label="表情">
                <i class="ri-emotion-line" aria-hidden="true" />
              </button>
              <button type="button" title="图片" aria-label="图片">
                <i class="ri-image-line" aria-hidden="true" />
              </button>
              <button type="button" title="文件" aria-label="文件">
                <i class="ri-folder-open-line" aria-hidden="true" />
              </button>
              <button type="button" title="截图" aria-label="截图">
                <i class="ri-scissors-cut-line" aria-hidden="true" />
              </button>
            </div>
            <textarea
              v-model="draft"
              maxlength="2000"
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              @focus="setTyping(true)"
              @blur="setTyping(false)"
              @keydown.enter.exact.prevent="sendActiveMessage"
            />
            <div class="ecw-chat__composer-footer">
              <span>{{ draft.length }}/2000</span>
              <button type="submit" :disabled="!draft.trim()">发送</button>
            </div>
          </form>
        </template>

        <div v-else class="ecw-chat__empty-workspace">
          <i class="ri-chat-voice-line" aria-hidden="true" />
          <strong>选择一个聊天</strong>
          <span>左侧可以查看聊天记录、好友和群聊</span>
        </div>
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type {
  ChatWidgetApi,
  ChatWidgetConversation,
  ChatWidgetMessage,
  ChatWidgetSocket
} from '../types/chat';

type NavKey = 'chats' | 'friends' | 'groups';
type TimelineItem =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'message'; key: string; message: ChatWidgetMessage };

const props = withDefaults(
  defineProps<{
    api: ChatWidgetApi;
    socket: ChatWidgetSocket;
    currentUserId?: string;
  }>(),
  {
    currentUserId: ''
  }
);

const navItems: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: 'chats', label: '聊天', icon: 'ri-message-3-line' },
  { key: 'friends', label: '好友', icon: 'ri-contacts-line' },
  { key: 'groups', label: '群聊', icon: 'ri-group-line' }
];

const open = ref(false);
const wide = ref(true);
const activeNav = ref<NavKey>('chats');
const showNewDirect = ref(false);
const targetUserId = ref('');
const keyword = ref('');
const conversations = ref<ChatWidgetConversation[]>([]);
const activeConversationId = ref('');
const loadingConversations = ref(false);
const loadingMessages = ref(false);
const conversationError = ref('');
const messageError = ref('');
const draft = ref('');
const messageListEl = ref<HTMLElement | null>(null);
let socketRetained = false;

const socketStatus = computed(() => props.socket.status.value);
const activeNavLabel = computed(() => navItems.find((item) => item.key === activeNav.value)?.label ?? '聊天');
const searchPlaceholder = computed(() => {
  if (activeNav.value === 'friends') return '搜索好友';
  if (activeNav.value === 'groups') return '搜索群聊';
  return '搜索聊天记录';
});
const activeConversation = computed(() =>
  conversations.value.find((conversation) => conversation.id === activeConversationId.value) ?? null
);
const visibleMessages = computed(() =>
  props.socket.messages.value
    .filter((message) => message.conversationId === activeConversationId.value)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
);
const directConversations = computed(() => conversations.value.filter((conversation) => conversation.type === 'direct'));
const groupConversations = computed(() => conversations.value.filter((conversation) => conversation.type === 'group'));
const visibleConversations = computed(() => filterConversations(conversations.value));
const visibleFriends = computed(() => filterConversations(directConversations.value));
const visibleGroups = computed(() => filterConversations(groupConversations.value));
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

async function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    await reconnect();
    await loadConversations();
  }
}

async function reconnect() {
  if (socketRetained) return props.socket.connect();
  await props.socket.connect();
  socketRetained = true;
}

onBeforeUnmount(() => {
  if (socketRetained) props.socket.release?.();
});

async function loadConversations() {
  loadingConversations.value = true;
  conversationError.value = '';

  try {
    conversations.value = await props.api.listConversations({ pageSize: 80 });
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
    const loadedMessages = await props.api.listMessages({ conversationId, pageSize: 100 });
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
    activeNav.value = 'chats';
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

function filterConversations(source: ChatWidgetConversation[]) {
  const normalizedKeyword = keyword.value.toLowerCase();
  if (!normalizedKeyword) return source;

  return source.filter((conversation) =>
    getConversationTitle(conversation).toLowerCase().includes(normalizedKeyword) ||
    getConversationPreview(conversation).toLowerCase().includes(normalizedKeyword)
  );
}

function getConversationTitle(conversation: ChatWidgetConversation) {
  if (conversation.title) return conversation.title;
  if (conversation.type === 'direct') return '单聊会话';
  if (conversation.type === 'system') return '系统会话';
  return '群聊';
}

function getConversationAvatar(conversation: ChatWidgetConversation) {
  const title = getConversationTitle(conversation);
  if (conversation.type === 'system') return '系';
  if (conversation.type === 'group') return '群';
  return title.slice(0, 1).toUpperCase();
}

function getConversationPreview(conversation: ChatWidgetConversation) {
  const source = conversation.metadata?.lastMessagePreview;
  if (typeof source === 'string' && source.trim()) return source;
  if (conversation.lastMessageAt) return '最近有新消息';
  return conversation.type === 'group' ? '群聊会话' : '还没有消息';
}

function getConversationMeta(conversation: ChatWidgetConversation) {
  if (conversation.type === 'direct') return '单聊';
  if (conversation.type === 'group') return '群聊';
  return '系统会话';
}

function getUnreadCount(conversation: ChatWidgetConversation) {
  return conversation.unreadCount ?? conversation.unread_count ?? 0;
}

function isMine(message: ChatWidgetMessage) {
  return message.senderId === props.currentUserId ||
    message.sender_id === props.currentUserId ||
    message.status === 'sending';
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

.ecw-chat__badge {
  position: absolute;
  top: 1px;
  right: -4px;
  display: inline-flex;
  min-width: 14px;
  height: 14px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e11d48;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.ecw-chat__panel {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 80;
  display: grid;
  grid-template-columns: 58px 292px minmax(0, 1fr);
  width: min(980px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 82px));
  overflow: hidden;
  border: 1px solid #d5dce6;
  border-radius: 8px;
  background: #f5f6f8;
  box-shadow: 0 22px 52px rgba(15, 23, 42, 0.24);
  color: #111827;
}

.ecw-chat__panel--wide {
  width: min(1180px, calc(100vw - 24px));
  height: min(740px, calc(100vh - 70px));
}

.ecw-chat__rail {
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-content: start;
  gap: 8px;
  padding: 14px 8px;
  background: #273142;
}

.ecw-chat__rail-button,
.ecw-chat__rail-bottom button {
  position: relative;
  display: inline-grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #b9c2cf;
  cursor: pointer;
  font-size: 21px;
}

.ecw-chat__rail-button:hover,
.ecw-chat__rail-button--active,
.ecw-chat__rail-bottom button:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.ecw-chat__rail-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ef4444;
}

.ecw-chat__rail-bottom {
  display: grid;
  gap: 6px;
}

.ecw-chat__list-pane {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  min-width: 0;
  border-right: 1px solid #d8dee8;
  background: #f7f8fa;
}

.ecw-chat__list-header {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
}

.ecw-chat__list-header div {
  display: grid;
  gap: 4px;
}

.ecw-chat__list-header strong {
  color: #111827;
  font-size: 16px;
}

.ecw-chat__list-header button,
.ecw-chat__square-button,
.ecw-chat__chat-actions button,
.ecw-chat__composer-toolbar button {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 17px;
}

.ecw-chat__list-header button:hover,
.ecw-chat__square-button:hover,
.ecw-chat__chat-actions button:hover,
.ecw-chat__composer-toolbar button:hover {
  background: #e8edf4;
  color: #111827;
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
  color: #059669;
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

.ecw-chat__alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid #fecaca;
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

.ecw-chat__search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 8px;
  padding: 0 12px 12px;
}

.ecw-chat__search {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  height: 34px;
  border-radius: 6px;
  background: #e9edf3;
  padding: 0 9px;
  color: #64748b;
}

.ecw-chat__search input,
.ecw-chat__new-direct input,
.ecw-chat__composer textarea {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #111827;
  outline: none;
}

.ecw-chat__new-direct {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px;
  gap: 8px;
  padding: 0 12px 12px;
}

.ecw-chat__new-direct input {
  height: 34px;
  border: 1px solid #d5dce6;
  border-radius: 6px;
  background: #ffffff;
  padding: 0 10px;
}

.ecw-chat__new-direct button {
  border: 0;
  border-radius: 6px;
  background: #16a34a;
  color: #ffffff;
  cursor: pointer;
}

.ecw-chat__new-direct button:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.ecw-chat__list {
  min-height: 0;
  overflow-y: auto;
}

.ecw-chat__list-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 10px;
  width: 100%;
  min-height: 72px;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  background: transparent;
  padding: 11px 12px;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.ecw-chat__list-item:hover,
.ecw-chat__list-item--active {
  background: #e9edf3;
}

.ecw-chat__avatar,
.ecw-chat__message-avatar {
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  font-weight: 700;
}

.ecw-chat__avatar {
  width: 42px;
  height: 42px;
  align-self: center;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 14px;
}

.ecw-chat__avatar--group {
  background: #dcfce7;
  color: #15803d;
}

.ecw-chat__avatar--system {
  background: #fee2e2;
  color: #b91c1c;
}

.ecw-chat__item-main {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ecw-chat__item-title,
.ecw-chat__item-preview,
.ecw-chat__item-side time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ecw-chat__item-title {
  color: #111827;
  font-size: 14px;
  font-weight: 700;
}

.ecw-chat__item-preview,
.ecw-chat__item-side {
  color: #64748b;
  font-size: 12px;
}

.ecw-chat__item-side {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.ecw-chat__item-badge {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e11d48;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
}

.ecw-chat__workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) 184px;
  min-width: 0;
  background: #f3f4f6;
}

.ecw-chat__chat-header {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #d8dee8;
  background: #f7f8fa;
  padding: 0 18px;
}

.ecw-chat__chat-title {
  display: grid;
  gap: 4px;
}

.ecw-chat__chat-title strong {
  color: #111827;
  font-size: 16px;
}

.ecw-chat__chat-title span {
  color: #64748b;
  font-size: 12px;
}

.ecw-chat__chat-actions {
  display: inline-flex;
  gap: 6px;
}

.ecw-chat__messages {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.ecw-chat__date-separator {
  width: fit-content;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: #dde3eb;
  padding: 4px 10px;
  color: #64748b;
  font-size: 12px;
}

.ecw-chat__message {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.ecw-chat__message--mine {
  grid-template-columns: minmax(0, 1fr) 34px;
}

.ecw-chat__message--mine .ecw-chat__message-avatar {
  grid-column: 2;
}

.ecw-chat__message--mine .ecw-chat__bubble {
  grid-column: 1;
  grid-row: 1;
  justify-self: end;
  background: #95ec69;
  border-color: #8ade61;
}

.ecw-chat__message-avatar {
  width: 34px;
  height: 34px;
  align-self: start;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
}

.ecw-chat__bubble {
  max-width: min(68%, 520px);
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  padding: 9px 11px 7px;
  box-shadow: 0 1px 1px rgba(15, 23, 42, 0.04);
}

.ecw-chat__bubble p {
  margin: 0;
  color: #111827;
  font-size: 14px;
  line-height: 1.6;
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

.ecw-chat__composer {
  display: grid;
  grid-template-rows: 34px minmax(0, 1fr) 34px;
  border-top: 1px solid #d8dee8;
  background: #ffffff;
}

.ecw-chat__composer-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 14px;
}

.ecw-chat__composer textarea {
  width: 100%;
  height: 100%;
  resize: none;
  padding: 4px 18px;
  font-size: 14px;
  line-height: 1.6;
}

.ecw-chat__composer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 14px;
}

.ecw-chat__composer-footer span {
  color: #94a3b8;
  font-size: 11px;
}

.ecw-chat__composer-footer button {
  min-width: 72px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: #16a34a;
  color: #ffffff;
  cursor: pointer;
  font-size: 13px;
}

.ecw-chat__composer-footer button:disabled {
  background: #d1d5db;
  color: #6b7280;
  cursor: not-allowed;
}

.ecw-chat__state,
.ecw-chat__empty-dialog,
.ecw-chat__empty-workspace {
  margin: 0;
  padding: 28px 14px;
  color: #64748b;
  text-align: center;
}

.ecw-chat__empty-dialog,
.ecw-chat__empty-workspace {
  display: grid;
  min-height: 100%;
  place-items: center;
  align-content: center;
  gap: 8px;
}

.ecw-chat__empty-dialog i,
.ecw-chat__empty-workspace i {
  color: #16a34a;
  font-size: 38px;
}

.ecw-chat__empty-dialog strong,
.ecw-chat__empty-workspace strong {
  color: #111827;
}

.ecw-chat__empty-dialog span,
.ecw-chat__empty-workspace span {
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 860px) {
  .ecw-chat__panel,
  .ecw-chat__panel--wide {
    position: fixed;
    inset: 56px 10px 10px;
    grid-template-columns: 52px 190px minmax(0, 1fr);
    width: auto;
    height: auto;
  }

  .ecw-chat__item-side,
  .ecw-chat__item-preview {
    display: none;
  }

  .ecw-chat__list-item {
    grid-template-columns: 38px minmax(0, 1fr);
  }
}
</style>

