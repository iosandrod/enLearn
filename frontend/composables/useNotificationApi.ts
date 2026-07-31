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
  link_url?: string | null;
  linkUrl?: string | null;
  created_at: string;
};

export type NotificationUnreadCount = {
  total: number;
  byCategory: Record<string, number>;
};

export type NotificationPreference = {
  category: string;
  category_label?: string;
  inbox_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  quiet_hours: Record<string, unknown>;
};

export type NotificationDelivery = {
  id: string;
  channel: 'email' | 'sms';
  target?: string | null;
  status: string;
  attempt_count: number;
  error_message?: string | null;
  next_retry_at?: string | null;
  sent_at?: string | null;
  created_at: string;
};

export function useNotificationApi() {
  const serviceApi = useServiceApi();
  const auth = useAuth();

  function withCurrentUser(postData: Record<string, unknown> = {}) {
    return {
      ...postData,
      ...(auth.user.value?.id ? { userId: auth.user.value.id } : {})
    };
  }

  function listMessages(postData: Record<string, unknown> = {}) {
    return serviceApi.invoke<NotificationMessage[]>('notification', 'listMessages', withCurrentUser(postData));
  }

  function getUnreadCount(postData: Record<string, unknown> = {}) {
    return serviceApi.invoke<NotificationUnreadCount>('notification', 'getUnreadCount', withCurrentUser(postData));
  }

  function markRead(ids: string[]) {
    return serviceApi.invoke<{ success: boolean; count: number }>('notification', 'markRead', withCurrentUser({ ids }));
  }

  function markAllRead(postData: Record<string, unknown> = {}) {
    return serviceApi.invoke<{ success: boolean; count: number }>('notification', 'markAllRead', withCurrentUser(postData));
  }

  function archiveMessage(ids: string[]) {
    return serviceApi.invoke<{ success: boolean; count: number }>('notification', 'archiveMessage', withCurrentUser({ ids }));
  }

  function getPreferences(postData: Record<string, unknown> = {}) {
    return serviceApi.invoke<NotificationPreference[]>('notification', 'getPreferences', postData);
  }

  function updatePreference(postData: Record<string, unknown>) {
    return serviceApi.invoke<NotificationPreference>('notification', 'updatePreference', postData);
  }

  function listDeliveries(postData: Record<string, unknown> = {}) {
    return serviceApi.invoke<NotificationDelivery[]>('notification', 'listDeliveries', postData);
  }

  function retryDelivery(id: string) {
    return serviceApi.invoke<{ success: boolean; delivery: NotificationDelivery }>('notification', 'retryDelivery', { id });
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
