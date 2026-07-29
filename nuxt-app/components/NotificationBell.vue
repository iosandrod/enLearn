<template>
  <div ref="rootEl" class="notification-bell">
    <button
      class="notification-bell__button"
      type="button"
      title="消息通知"
      aria-label="消息通知"
      @click.stop="togglePanel"
    >
      <i class="ri-notification-3-line" aria-hidden="true" />
      <span v-if="unreadTotal > 0" class="notification-bell__badge">
        {{ unreadLabel }}
      </span>
    </button>

    <section v-if="open" class="notification-bell__panel" @click.stop>
      <header class="notification-bell__header">
        <strong>最近消息</strong>
        <div class="notification-bell__actions">
          <button type="button" title="刷新" aria-label="刷新" @click="loadRecent">
            <i class="ri-refresh-line" aria-hidden="true" />
          </button>
          <button
            type="button"
            title="全部已读"
            aria-label="全部已读"
            :disabled="unreadTotal === 0"
            @click="markAll"
          >
            <i class="ri-check-double-line" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="notification-bell__content">
        <p v-if="loading" class="notification-bell__state">加载中...</p>
        <p v-else-if="errorMessage" class="notification-bell__state notification-bell__state--error">
          {{ errorMessage }}
        </p>
        <p v-else-if="messages.length === 0" class="notification-bell__state">暂无消息</p>

        <button
          v-for="message in messages"
          v-else
          :key="message.id"
          class="notification-bell__item"
          :class="{ 'notification-bell__item--unread': !message.read_at }"
          type="button"
          @click="openMessage(message)"
        >
          <span class="notification-bell__meta">
            <span>{{ message.category_label ?? message.category }}</span>
            <time>{{ formatTime(message.created_at) }}</time>
          </span>
          <span class="notification-bell__title">{{ message.title }}</span>
          <span class="notification-bell__text">{{ message.content }}</span>
        </button>
      </div>

      <RouterLink class="notification-bell__footer" to="/dashboard/messages" @click="open = false">
        进入消息中心
      </RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { NotificationMessage } from '~/composables/useNotificationApi';

const notificationApi = useNotificationApi();
const route = useRoute();

const rootEl = ref<HTMLElement | null>(null);
const open = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const unreadTotal = ref(0);
const messages = ref<NotificationMessage[]>([]);

let refreshTimer: number | null = null;

const unreadLabel = computed(() => (unreadTotal.value > 99 ? '99+' : String(unreadTotal.value)));

async function loadCount() {
  try {
    const count = await notificationApi.getUnreadCount();
    unreadTotal.value = count.total;
  } catch {
    unreadTotal.value = 0;
  }
}

async function loadRecent() {
  loading.value = true;
  errorMessage.value = '';

  try {
    messages.value = await notificationApi.listMessages({ pageSize: 5 });
    await loadCount();
  } catch {
    errorMessage.value = '消息加载失败';
  } finally {
    loading.value = false;
  }
}

async function togglePanel() {
  open.value = !open.value;

  if (open.value) {
    await loadRecent();
  }
}

async function markAll() {
  if (unreadTotal.value === 0) {
    return;
  }

  await notificationApi.markAllRead();
  unreadTotal.value = 0;
  messages.value = messages.value.map((message) => ({
    ...message,
    read_at: message.read_at ?? new Date().toISOString()
  }));
}

async function openMessage(message: NotificationMessage) {
  if (!message.read_at) {
    await notificationApi.markRead([message.id]);
    unreadTotal.value = Math.max(0, unreadTotal.value - 1);
    message.read_at = new Date().toISOString();
  }

  open.value = false;
  await navigateTo(message.linkUrl ?? message.link_url ?? '/dashboard/messages');
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function handleDocumentClick(event: MouseEvent) {
  if (!rootEl.value?.contains(event.target as Node)) {
    open.value = false;
  }
}

onMounted(() => {
  void loadCount();
  refreshTimer = window.setInterval(loadCount, 60_000);
  document.addEventListener('click', handleDocumentClick);
});

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }

  document.removeEventListener('click', handleDocumentClick);
});

watch(
  () => route.fullPath,
  () => {
    open.value = false;
    void loadCount();
  }
);
</script>

<style scoped>
.notification-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 24px;
}

.notification-bell__button {
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

.notification-bell__button:hover {
  background: rgba(255, 255, 255, 0.16);
}

.notification-bell__badge {
  position: absolute;
  top: 1px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.notification-bell__panel {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 60;
  width: min(360px, calc(100vw - 24px));
  border: 1px solid #d7dee8;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  color: #1f2937;
  overflow: hidden;
}

.notification-bell__header,
.notification-bell__footer {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
}

.notification-bell__header {
  justify-content: space-between;
  border-bottom: 1px solid #e5eaf1;
}

.notification-bell__actions {
  display: inline-flex;
  gap: 6px;
}

.notification-bell__actions button {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 15px;
}

.notification-bell__actions button:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}

.notification-bell__actions button:not(:disabled):hover {
  background: #f1f5f9;
  color: #2563eb;
}

.notification-bell__content {
  max-height: 320px;
  overflow-y: auto;
}

.notification-bell__state {
  margin: 0;
  padding: 24px 12px;
  color: #64748b;
  text-align: center;
}

.notification-bell__state--error {
  color: #dc2626;
}

.notification-bell__item {
  display: grid;
  width: 100%;
  gap: 5px;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  background: #ffffff;
  padding: 10px 12px;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.notification-bell__item:hover {
  background: #f8fbff;
}

.notification-bell__item--unread {
  background: #f5f9ff;
}

.notification-bell__item--unread .notification-bell__title::before {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 999px;
  background: #2563eb;
  content: '';
  vertical-align: middle;
}

.notification-bell__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: 11px;
}

.notification-bell__title,
.notification-bell__text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-bell__title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.notification-bell__text {
  color: #475569;
  font-size: 12px;
}

.notification-bell__footer {
  justify-content: center;
  border-top: 1px solid #e5eaf1;
  color: #2563eb;
  font-weight: 700;
  text-decoration: none;
}

.notification-bell__footer:hover {
  background: #f8fbff;
}
</style>
