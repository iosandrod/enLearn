import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  requireAdmin
} from '../common/utils/supabase';
import type {
  NotificationCategory,
  NotificationDeliveryChannel,
  NotificationDeliveryRow,
  NotificationEventRow,
  NotificationMessageRow,
  NotificationPreferenceRow,
  NotificationPriority
} from './notification.types';

type PostData = Record<string, unknown>;

const categories: NotificationCategory[] = ['system', 'approval', 'mention', 'security', 'business'];
const priorities: NotificationPriority[] = ['low', 'normal', 'high', 'urgent'];
const deliveryChannels: NotificationDeliveryChannel[] = ['email', 'sms'];
const deliveryStatuses = ['pending', 'sending', 'sent', 'failed', 'canceled'] as const;
const deliveryChannelLabels: Record<NotificationDeliveryChannel, string> = {
  email: '邮件',
  sms: '短信'
};
const deliveryStatusLabels: Record<(typeof deliveryStatuses)[number], string> = {
  pending: '待投递',
  sending: '投递中',
  sent: '已发送',
  failed: '失败',
  canceled: '已取消'
};

const categoryLabels: Record<NotificationCategory, string> = {
  system: '系统提醒',
  approval: '审批通知',
  mention: '@提醒',
  security: '安全提醒',
  business: '业务通知'
};

const priorityLabels: Record<NotificationPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急'
};

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readString(value: unknown, name: string, fallback = '') {
  const optional = readOptionalString(value);
  if (optional) return optional;
  if (fallback) return fallback;
  throw new BadRequestException(`Missing required field: ${name}`);
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function readCategory(value: unknown) {
  const category = readOptionalString(value);
  return categories.includes(category as NotificationCategory)
    ? (category as NotificationCategory)
    : undefined;
}

function readPriority(value: unknown, fallback: NotificationPriority = 'normal') {
  const priority = readOptionalString(value);
  return priorities.includes(priority as NotificationPriority)
    ? (priority as NotificationPriority)
    : fallback;
}

function readDeliveryChannel(value: unknown) {
  const channel = readOptionalString(value);
  return deliveryChannels.includes(channel as NotificationDeliveryChannel)
    ? (channel as NotificationDeliveryChannel)
    : undefined;
}

function readDeliveryStatus(value: unknown) {
  const status = readOptionalString(value);
  return deliveryStatuses.includes(status as typeof deliveryStatuses[number])
    ? status
    : undefined;
}

function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      throw new BadRequestException('Invalid JSON payload.');
    }
  }

  return fallback;
}

function isMissingNotificationTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error?.code === 'PGRST205' ||
      error?.message?.includes('notification_messages') ||
      error?.message?.includes('notification_events') ||
      error?.message?.includes('Could not find the table')
  );
}

function normalizeMessage(row: NotificationMessageRow) {
  return {
    ...row,
    unread_only: !row.read_at,
    unread: !row.read_at,
    read_status: row.read_at ? '已读' : '未读',
    category_label: categoryLabels[row.category] ?? row.category,
    priority_label: priorityLabels[row.priority] ?? row.priority,
    createdAt: row.created_at,
    readAt: row.read_at,
    linkUrl: row.link_url,
    sourceType: row.source_type,
    sourceId: row.source_id
  };
}

function normalizePreference(row: NotificationPreferenceRow) {
  return {
    ...row,
    category_label: categoryLabels[row.category] ?? row.category,
    userId: row.user_id,
    tenantId: row.tenant_id,
    inboxEnabled: row.inbox_enabled,
    emailEnabled: row.email_enabled,
    smsEnabled: row.sms_enabled,
    quietHours: row.quiet_hours
  };
}

function normalizeDelivery(row: NotificationDeliveryRow) {
  return {
    ...row,
    channel_label: deliveryChannelLabels[row.channel] ?? row.channel,
    status_label: deliveryStatusLabels[row.status] ?? row.status,
    tenantId: row.tenant_id,
    eventId: row.event_id,
    messageId: row.message_id,
    recipientId: row.recipient_id,
    templateCode: row.template_code,
    attemptCount: row.attempt_count,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    nextRetryAt: row.next_retry_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function resolveAdminClient(fallback: SupabaseClient) {
  try {
    return createSupabaseClient('admin');
  } catch {
    return fallback;
  }
}

@Injectable()
export class NotificationService implements ServiceExecutor {
  async execute(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'listItems':
        return this.listItems(postData, context);
      case 'getUnreadCount':
        return this.getUnreadCount(postData, context);
      case 'markRead':
        return this.markRead(postData, context);
      case 'markAllRead':
        return this.markAllRead(postData, context);
      case 'archiveMessage':
        return this.archiveMessage(postData, context);
      case 'getPreferences':
        return this.getPreferences(postData, context);
      case 'updatePreference':
        return this.updatePreference(postData, context);
      case 'retryDelivery':
        return this.retryDelivery(postData, context);
      case 'createSystemNotice':
        return this.createSystemNotice(postData, context);
      default:
        throw new BadRequestException(`Unsupported notification method: ${method}`);
    }
  }

  private async listItems(postData: PostData, context: ServiceContext) {
    switch (readOptionalString(postData.itemType ?? postData.item_type ?? postData.type) || 'messages') {
      case 'messages':
        return this.listMessages(postData, context);
      case 'deliveries':
        return this.listDeliveries(postData, context);
      default:
        throw new BadRequestException('Unsupported notification listItems itemType.');
    }
  }

  private async listMessages(postData: PostData, context: ServiceContext) {
    const { client, targetUserId } = await this.resolveMessageTarget(postData, context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const page = Math.max(1, Math.floor(readNumber(postData.page, 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(readNumber(postData.pageSize ?? postData.page_size, 20))));
    const category = readCategory(postData.category);
    const priority = readOptionalString(postData.priority);
    const unreadOnly = readBoolean(postData.unreadOnly ?? postData.unread_only, false);
    const includeArchived = readBoolean(postData.includeArchived ?? postData.include_archived, false);

    let query = client
      .from('notification_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('recipient_id', targetUserId);

    if (category) {
      query = query.eq('category', category);
    }

    if (priorities.includes(priority as NotificationPriority)) {
      query = query.eq('priority', priority);
    }

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) {
      if (isMissingNotificationTable(error)) return [];
      throw new BadRequestException(error.message);
    }

    return ((data ?? []) as NotificationMessageRow[]).map(normalizeMessage);
  }

  private async getUnreadCount(postData: PostData, context: ServiceContext) {
    const { client, targetUserId } = await this.resolveMessageTarget(postData, context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';

    const totalResult = await client
      .from('notification_messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('recipient_id', targetUserId)
      .is('read_at', null)
      .is('archived_at', null);

    if (totalResult.error) {
      if (isMissingNotificationTable(totalResult.error)) return { total: 0, byCategory: {} };
      throw new BadRequestException(totalResult.error.message);
    }

    const categoryResult = await client
      .from('notification_messages')
      .select('category')
      .eq('tenant_id', tenantId)
      .eq('recipient_id', targetUserId)
      .is('read_at', null)
      .is('archived_at', null);

    if (categoryResult.error) {
      if (isMissingNotificationTable(categoryResult.error)) return { total: 0, byCategory: {} };
      throw new BadRequestException(categoryResult.error.message);
    }

    const byCategory = (categoryResult.data ?? []).reduce<Record<string, number>>((counts, row) => {
      const category = String((row as Record<string, unknown>).category ?? '');
      counts[category] = (counts[category] ?? 0) + 1;
      return counts;
    }, {});

    return {
      total: totalResult.count ?? 0,
      byCategory
    };
  }

  private async markRead(postData: PostData, context: ServiceContext) {
    const { client, targetUserId } = await this.resolveMessageTarget(postData, context);
    const ids = [
      ...readStringArray(postData.ids),
      ...readStringArray(postData.messageIds ?? postData.message_ids),
      readOptionalString(postData.id)
    ].filter(Boolean);

    if (!ids.length) {
      throw new BadRequestException('ids is required.');
    }

    const { data, error } = await client
      .from('notification_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', [...new Set(ids)])
      .eq('recipient_id', targetUserId)
      .select('id');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      count: data?.length ?? 0
    };
  }

  private async markAllRead(postData: PostData, context: ServiceContext) {
    const { client, targetUserId } = await this.resolveMessageTarget(postData, context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const category = readCategory(postData.category);

    let query = client
      .from('notification_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('recipient_id', targetUserId)
      .is('read_at', null)
      .is('archived_at', null);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query.select('id');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      count: data?.length ?? 0
    };
  }

  private async archiveMessage(postData: PostData, context: ServiceContext) {
    const { client, targetUserId } = await this.resolveMessageTarget(postData, context);
    const now = new Date().toISOString();
    const ids = [
      ...readStringArray(postData.ids),
      ...readStringArray(postData.messageIds ?? postData.message_ids),
      readOptionalString(postData.id)
    ].filter(Boolean);

    if (!ids.length) {
      throw new BadRequestException('ids is required.');
    }

    const { data, error } = await client
      .from('notification_messages')
      .update({
        read_at: now,
        archived_at: now
      })
      .in('id', [...new Set(ids)])
      .eq('recipient_id', targetUserId)
      .select('id');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      count: data?.length ?? 0
    };
  }

  private async resolveMessageTarget(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const targetUserId = readOptionalString(postData.userId ?? postData.user_id) || user.id;
    if (targetUserId === user.id) {
      return { client, user, targetUserId };
    }

    const admin = await requireAdmin(context, ['notification.messages.manage', 'admin.users.manage']);
    return {
      client: resolveAdminClient(admin.client),
      user: admin.user,
      targetUserId
    };
  }

  private async getPreferences(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const targetUserId = readOptionalString(postData.userId ?? postData.user_id) || user.id;
    const readClient = targetUserId === user.id
      ? client
      : resolveAdminClient((await requireAdmin(context, 'notification.messages.manage')).client);

    const { data, error } = await readClient
      .from('notification_preferences')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', targetUserId);

    if (error) {
      if (isMissingNotificationTable(error)) return this.defaultPreferences(tenantId, targetUserId);
      throw new BadRequestException(error.message);
    }

    const byCategory = new Map(
      ((data ?? []) as NotificationPreferenceRow[]).map((row) => [row.category, row])
    );
    return categories.map((category) => {
      const row = byCategory.get(category);
      if (row) return normalizePreference(row);
      return {
        id: '',
        tenant_id: tenantId,
        tenantId,
        user_id: targetUserId,
        userId: targetUserId,
        category,
        category_label: categoryLabels[category],
        inbox_enabled: true,
        inboxEnabled: true,
        email_enabled: false,
        emailEnabled: false,
        sms_enabled: false,
        smsEnabled: false,
        quiet_hours: {},
        quietHours: {}
      };
    });
  }

  private async updatePreference(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const targetUserId = readOptionalString(postData.userId ?? postData.user_id) || user.id;
    const category = readCategory(postData.category);
    if (!category) {
      throw new BadRequestException('category is required.');
    }

    const writeClient = targetUserId === user.id
      ? client
      : resolveAdminClient((await requireAdmin(context, 'notification.messages.manage')).client);
    const existingResult = await writeClient
      .from('notification_preferences')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', targetUserId)
      .eq('category', category)
      .maybeSingle();

    if (existingResult.error && !isMissingNotificationTable(existingResult.error)) {
      throw new BadRequestException(existingResult.error.message);
    }

    const existing = existingResult.data as NotificationPreferenceRow | null;
    const quietHoursInput = postData.quietHours ?? postData.quiet_hours;
    const payload = {
      tenant_id: tenantId,
      user_id: targetUserId,
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
      quiet_hours: quietHoursInput === undefined
        ? existing?.quiet_hours ?? {}
        : readJsonObject(quietHoursInput)
    };

    const { data, error } = await writeClient
      .from('notification_preferences')
      .upsert(payload, {
        onConflict: 'tenant_id,user_id,category'
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return normalizePreference(data as NotificationPreferenceRow);
  }

  private async listDeliveries(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'notification.deliveries.manage');
    const readClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const page = Math.max(1, Math.floor(readNumber(postData.page, 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(readNumber(postData.pageSize ?? postData.page_size, 20))));
    const status = readDeliveryStatus(postData.status);
    const channel = readDeliveryChannel(postData.channel);
    const recipientId = readOptionalString(postData.recipientId ?? postData.recipient_id);

    let query = readClient
      .from('notification_deliveries')
      .select('*')
      .eq('tenant_id', tenantId);

    if (status) query = query.eq('status', status);
    if (channel) query = query.eq('channel', channel);
    if (recipientId) query = query.eq('recipient_id', recipientId);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) {
      if (isMissingNotificationTable(error)) return [];
      throw new BadRequestException(error.message);
    }

    return ((data ?? []) as NotificationDeliveryRow[]).map(normalizeDelivery);
  }

  private async retryDelivery(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'notification.deliveries.manage');
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const id = readString(postData.id ?? postData.deliveryId ?? postData.delivery_id, 'id');

    const { data, error } = await writeClient
      .from('notification_deliveries')
      .update({
        status: 'pending',
        error_message: null,
        next_retry_at: null
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      delivery: normalizeDelivery(data as NotificationDeliveryRow)
    };
  }

  private async createSystemNotice(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'notification.notices.manage');
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const title = readString(postData.title, 'title');
    const content = readString(postData.content, 'content');
    const linkUrl = readOptionalString(postData.linkUrl ?? postData.link_url) || null;
    const priority = readPriority(postData.priority);
    const metadata = readJsonObject(postData.metadata);
    const noticeId = readOptionalString(postData.noticeId ?? postData.notice_id ?? postData.sourceId ?? postData.source_id) || randomUUID();
    const recipientIds = await this.resolveRecipients(writeClient, postData);

    const eventPayload = {
      title,
      content,
      linkUrl,
      priority,
      recipientIds,
      metadata
    };

    const { data: event, error: eventError } = await writeClient
      .from('notification_events')
      .upsert(
        {
          tenant_id: tenantId,
          event_type: 'system.notice.created',
          source_type: 'system_notice',
          source_id: noticeId,
          actor_id: user.id,
          payload: eventPayload,
          idempotency_key: `system-notice:${noticeId}`,
          status: 'processed',
          processed_at: new Date().toISOString()
        },
        { onConflict: 'tenant_id,idempotency_key' }
      )
      .select('*')
      .single();

    if (eventError) {
      throw new BadRequestException(eventError.message);
    }

    if (!recipientIds.length) {
      return {
        success: true,
        event,
        messages: [],
        count: 0
      };
    }

    const messages = recipientIds.map((recipientId) => ({
      tenant_id: tenantId,
      event_id: (event as NotificationEventRow).id,
      recipient_id: recipientId,
      category: 'system',
      channel: 'inbox',
      title,
      content,
      link_url: linkUrl,
      priority,
      source_type: 'system_notice',
      source_id: noticeId,
      metadata
    }));

    const { data, error } = await writeClient
      .from('notification_messages')
      .upsert(messages, {
        onConflict: 'tenant_id,recipient_id,source_type,source_id,category'
      })
      .select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      event,
      messages: ((data ?? []) as NotificationMessageRow[]).map(normalizeMessage),
      count: data?.length ?? 0
    };
  }

  private defaultPreferences(tenantId: string, userId: string) {
    return categories.map((category) => ({
      id: '',
      tenant_id: tenantId,
      tenantId,
      user_id: userId,
      userId,
      category,
      category_label: categoryLabels[category],
      inbox_enabled: true,
      inboxEnabled: true,
      email_enabled: false,
      emailEnabled: false,
      sms_enabled: false,
      smsEnabled: false,
      quiet_hours: {},
      quietHours: {}
    }));
  }

  private async resolveRecipients(client: SupabaseClient, postData: PostData) {
    const explicitIds = [
      ...readStringArray(postData.recipientIds ?? postData.recipient_ids),
      ...readStringArray(postData.userIds ?? postData.user_ids)
    ];

    if (explicitIds.length) {
      return [...new Set(explicitIds)];
    }

    const { data, error } = await client
      .from('users')
      .select('id')
      .order('created_at', { ascending: true });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return [
      ...new Set(
        (data ?? [])
          .map((row) => String((row as Record<string, unknown>).id ?? ''))
          .filter(Boolean)
      )
    ];
  }
}
