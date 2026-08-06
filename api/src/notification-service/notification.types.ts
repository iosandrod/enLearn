export type NotificationCategory = 'system' | 'approval' | 'mention' | 'security' | 'business';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationDeliveryChannel = 'email' | 'sms';

export type NotificationMessageRow = {
  id: string;
  account_id: string;
  event_id: string | null;
  recipient_id: string;
  category: NotificationCategory;
  channel: 'inbox';
  title: string;
  content: string;
  link_url: string | null;
  priority: NotificationPriority;
  source_type: string | null;
  source_id: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationEventRow = {
  id: string;
  account_id: string;
  event_type: string;
  source_type: string | null;
  source_id: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type NotificationDeliveryRow = {
  id: string;
  account_id: string;
  event_id: string | null;
  message_id: string | null;
  recipient_id: string;
  channel: NotificationDeliveryChannel;
  target: string | null;
  template_code: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';
  attempt_count: number;
  provider_message_id: string | null;
  error_message: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferenceRow = {
  id: string;
  account_id: string;
  user_id: string;
  category: NotificationCategory;
  inbox_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  quiet_hours: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
