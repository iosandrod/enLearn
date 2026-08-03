export type NotificationMessage = {
  id: string;
  title: string;
  content: string;
  category: string;
  category_label?: string;
  priority: string;
  priority_label?: string;
  read_at?: string | null;
  read_status?: string;
  archived_at?: string | null;
  link_url?: string | null;
  linkUrl?: string | null;
  created_at: string;
  unread?: boolean;
  unread_only?: boolean;
};

export type NotificationUnreadCount = {
  total: number;
  byCategory: Record<string, number>;
};

export type NotificationPreference = {
  id?: string;
  tenant_id?: string;
  tenantId?: string;
  user_id?: string;
  userId?: string;
  category: string;
  category_label?: string;
  inbox_enabled: boolean;
  inboxEnabled?: boolean;
  email_enabled: boolean;
  emailEnabled?: boolean;
  sms_enabled: boolean;
  smsEnabled?: boolean;
  quiet_hours: Record<string, unknown>;
  quietHours?: Record<string, unknown>;
};

export type NotificationDelivery = {
  id: string;
  channel: 'email' | 'sms';
  channel_label?: string;
  target?: string | null;
  status: string;
  status_label?: string;
  attempt_count: number;
  error_message?: string | null;
  next_retry_at?: string | null;
  sent_at?: string | null;
  created_at: string;
};

const notificationCategories = ['system', 'approval', 'mention', 'security', 'business'] as const;

const categoryLabels: Record<string, string> = {
  system: '系统提醒',
  approval: '审批通知',
  mention: '@提醒',
  security: '安全提醒',
  business: '业务通知'
};

const priorityLabels: Record<string, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急'
};

const deliveryChannelLabels: Record<string, string> = {
  email: '邮件',
  sms: '短信'
};

const deliveryStatusLabels: Record<string, string> = {
  pending: '待投递',
  sending: '投递中',
  sent: '已发送',
  failed: '失败',
  canceled: '已取消'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function readPageSize(postData: Record<string, unknown>, fallback: number) {
  const value = postData.pageSize ?? postData.page_size ?? postData.limit;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFilters(value: unknown) {
  return isRecord(value) ? value : {};
}

function normalizeMessage(row: NotificationMessage): NotificationMessage {
  return {
    ...row,
    unread_only: !row.read_at,
    unread: !row.read_at,
    read_status: row.read_at ? '已读' : '未读',
    category_label: row.category_label ?? categoryLabels[row.category] ?? row.category,
    priority_label: row.priority_label ?? priorityLabels[row.priority] ?? row.priority,
    linkUrl: row.linkUrl ?? row.link_url ?? null
  } as NotificationMessage;
}

function normalizePreference(row: NotificationPreference): NotificationPreference {
  return {
    ...row,
    category_label: row.category_label ?? categoryLabels[row.category] ?? row.category,
    tenantId: row.tenantId ?? row.tenant_id,
    userId: row.userId ?? row.user_id,
    inboxEnabled: row.inboxEnabled ?? row.inbox_enabled,
    emailEnabled: row.emailEnabled ?? row.email_enabled,
    smsEnabled: row.smsEnabled ?? row.sms_enabled,
    quietHours: row.quietHours ?? row.quiet_hours ?? {}
  };
}

function normalizeDelivery(row: NotificationDelivery): NotificationDelivery {
  return {
    ...row,
    channel_label: row.channel_label ?? deliveryChannelLabels[row.channel] ?? row.channel,
    status_label: row.status_label ?? deliveryStatusLabels[row.status] ?? row.status
  };
}

export function useNotificationApi() {
  const serviceApi = useServiceApi();
  const auth = useAuth();

  function currentUserId() {
    return auth.activeDevTestUser.value?.id ?? auth.user.value?.id ?? '';
  }

  function currentUserFilters(postData: Record<string, unknown> = {}) {
    const userId = readString(postData.userId ?? postData.user_id) || currentUserId();
    return {
      tenant_id: readString(postData.tenantId ?? postData.tenant_id) || 'default',
      ...(userId ? { recipient_id: userId } : {})
    };
  }

  async function listMessages(postData: Record<string, unknown> = {}) {
    const filters = {
      ...currentUserFilters(postData),
      ...normalizeFilters(postData.filters),
      ...(readString(postData.category) ? { category: readString(postData.category) } : {}),
      ...(readString(postData.priority) ? { priority: readString(postData.priority) } : {}),
      ...(readBoolean(postData.unreadOnly ?? postData.unread_only) ? { read_at: { op: 'isNull' } } : {}),
      ...(!readBoolean(postData.includeArchived ?? postData.include_archived) ? { archived_at: { op: 'isNull' } } : {})
    };

    const rows = await serviceApi.listItems<NotificationMessage[]>('notification', {
      ...postData,
      tableName: 'notification_messages',
      filters,
      sorts: postData.sorts ?? [{ field: 'created_at', direction: 'desc' }],
      pageSize: readPageSize(postData, 20)
    });

    return Array.isArray(rows) ? rows.map(normalizeMessage) : [];
  }

  function getUnreadCount(postData: Record<string, unknown> = {}) {
    return serviceApi.invoke<NotificationUnreadCount>('notification', 'getUnreadCount', {
      ...postData,
      ...(currentUserId() ? { userId: currentUserId() } : {})
    });
  }

  async function markRead(ids: string[]) {
    const result = await serviceApi.invoke<{ success: boolean; count: number }>('notification', 'markRead', {
      ids,
      userId: currentUserId()
    });

    return result;
  }

  async function markAllRead(postData: Record<string, unknown> = {}) {
    return serviceApi.invoke<{ success: boolean; count: number }>('notification', 'markAllRead', {
      ...postData,
      userId: readString(postData.userId ?? postData.user_id) || currentUserId(),
      tenantId: readString(postData.tenantId ?? postData.tenant_id) || 'default',
      ...(readString(postData.category) ? { category: readString(postData.category) } : {})
    });
  }

  async function archiveMessage(ids: string[]) {
    const rows = await serviceApi.invoke<NotificationMessage[]>('notification', 'updateItem', {
      resource: 'notification_messages',
      ids,
      archive: true
    });

    return { success: true, count: Array.isArray(rows) ? rows.length : 0 };
  }

  async function getPreferences(postData: Record<string, unknown> = {}) {
    const userId = readString(postData.userId ?? postData.user_id) || currentUserId();
    const tenantId = readString(postData.tenantId ?? postData.tenant_id) || 'default';
    const rows = await serviceApi.listItems<NotificationPreference[]>('notification', {
      ...postData,
      tableName: 'notification_preferences',
      filters: {
        tenant_id: tenantId,
        ...(userId ? { user_id: userId } : {}),
        ...normalizeFilters(postData.filters)
      },
      sorts: postData.sorts ?? [{ field: 'category', direction: 'asc' }],
      pageSize: readPageSize(postData, 100)
    });
    const byCategory = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.category, row]));

    return notificationCategories.map((category) => normalizePreference(
      byCategory.get(category) ?? {
        id: '',
        tenant_id: tenantId,
        user_id: userId,
        category,
        inbox_enabled: true,
        email_enabled: false,
        sms_enabled: false,
        quiet_hours: {}
      }
    ));
  }

  async function updatePreference(postData: Record<string, unknown>) {
    const userId = readString(postData.userId ?? postData.user_id) || currentUserId();
    const tenantId = readString(postData.tenantId ?? postData.tenant_id) || 'default';
    const category = readString(postData.category);
    const existing = (await getPreferences({ tenantId, userId })).find((item) => item.category === category);
    const payload = {
      tenant_id: tenantId,
      user_id: userId,
      category,
      inbox_enabled: postData.inboxEnabled === undefined && postData.inbox_enabled === undefined
        ? existing?.inbox_enabled ?? true
        : readBoolean(postData.inboxEnabled ?? postData.inbox_enabled, true),
      email_enabled: postData.emailEnabled === undefined && postData.email_enabled === undefined
        ? existing?.email_enabled ?? false
        : readBoolean(postData.emailEnabled ?? postData.email_enabled, false),
      sms_enabled: postData.smsEnabled === undefined && postData.sms_enabled === undefined
        ? existing?.sms_enabled ?? false
        : readBoolean(postData.smsEnabled ?? postData.sms_enabled, false),
      quiet_hours: postData.quietHours ?? postData.quiet_hours ?? existing?.quiet_hours ?? {}
    };
    const method = existing?.id ? 'updateItem' : 'createItem';
    const result = await serviceApi.invoke<NotificationPreference>('notification', method, {
      resource: 'notification_preferences',
      ...(existing?.id ? { id: existing.id } : {}),
      data: payload
    });

    return normalizePreference(result);
  }

  async function listDeliveries(postData: Record<string, unknown> = {}) {
    const filters = {
      tenant_id: readString(postData.tenantId ?? postData.tenant_id) || 'default',
      ...normalizeFilters(postData.filters),
      ...(readString(postData.status) ? { status: readString(postData.status) } : {}),
      ...(readString(postData.channel) ? { channel: readString(postData.channel) } : {}),
      ...(readString(postData.recipientId ?? postData.recipient_id) ? { recipient_id: readString(postData.recipientId ?? postData.recipient_id) } : {})
    };
    const rows = await serviceApi.listItems<NotificationDelivery[]>('notification', {
      ...postData,
      tableName: 'notification_deliveries',
      filters,
      sorts: postData.sorts ?? [{ field: 'created_at', direction: 'desc' }],
      pageSize: readPageSize(postData, 20)
    });

    return Array.isArray(rows) ? rows.map(normalizeDelivery) : [];
  }

  async function retryDelivery(id: string) {
    const delivery = await serviceApi.invoke<NotificationDelivery>('notification', 'updateItem', {
      resource: 'notification_deliveries',
      id,
      retry: true
    });

    return { success: true, delivery: normalizeDelivery(delivery) };
  }

  return {
    listMessages,
    getUnreadCount,
    markRead,
    markAllRead,
    archiveMessage,
    getPreferences,
    updatePreference,
    listDeliveries,
    retryDelivery
  };
}
