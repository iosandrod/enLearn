import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BaseService,
  type HookContext,
  type ResourceConfigMap,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { createSupabaseClient, getCurrentUser, requireAdmin } from '../common/utils/supabase';
import type {
  NotificationCategory,
  NotificationEventRow,
  NotificationMessageRow,
  NotificationPreferenceRow,
  NotificationPriority
} from './notification.types';

type PostData = Record<string, unknown>;

const categories: NotificationCategory[] = ['system', 'approval', 'mention', 'security', 'business'];
const priorities: NotificationPriority[] = ['low', 'normal', 'high', 'urgent'];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (isRecord(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new BadRequestException('Invalid JSON payload.');
    }
  }
  return fallback;
}

function isMissingNotificationTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error?.code === 'PGRST205' ||
      error?.message?.includes('notification_') ||
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

function resolveAdminClient(fallback: SupabaseClient) {
  try {
    return createSupabaseClient('admin');
  } catch {
    return fallback;
  }
}

@Injectable()
export class NotificationService extends BaseService {
  protected override resources(): ResourceConfigMap {
    return {
      notification_messages: {
        tableName: 'notification_messages',
        ownerField: 'recipient_id',
        defaults: { tenant_id: 'default', category: 'system', channel: 'inbox', priority: 'normal', metadata: {} },
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 20, maxPageSize: 100 },
        create: {
          allowedFields: ['tenant_id', 'event_id', 'recipient_id', 'category', 'channel', 'title', 'content', 'link_url', 'priority', 'source_type', 'source_id', 'metadata'],
          requiredFields: ['recipient_id', 'title'],
          userFields: { owner: 'recipient_id' }
        },
        update: {
          allowedFields: ['read_at', 'archived_at'],
          timestamp: false
        }
      },
      notification_preferences: {
        tableName: 'notification_preferences',
        ownerField: 'user_id',
        defaults: { tenant_id: 'default', inbox_enabled: true, email_enabled: false, sms_enabled: false, quiet_hours: {} },
        list: { defaultSorts: [{ field: 'category', direction: 'asc' }], defaultPageSize: 100, maxPageSize: 100 },
        create: {
          allowedFields: ['tenant_id', 'user_id', 'category', 'inbox_enabled', 'email_enabled', 'sms_enabled', 'quiet_hours'],
          requiredFields: ['user_id', 'category'],
          userFields: { owner: 'user_id' }
        },
        update: {
          allowedFields: ['inbox_enabled', 'email_enabled', 'sms_enabled', 'quiet_hours']
        }
      },
      notification_deliveries: {
        tableName: 'notification_deliveries',
        clientMode: 'admin',
        permissions: this.adminCrudPermissions('notification.deliveries.manage'),
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 20, maxPageSize: 100 },
        create: {
          allowedFields: ['tenant_id', 'event_id', 'message_id', 'recipient_id', 'channel', 'target', 'template_code', 'status', 'attempt_count', 'provider_message_id', 'error_message', 'next_retry_at', 'sent_at'],
          requiredFields: ['recipient_id', 'channel']
        },
        update: {
          allowedFields: ['status', 'error_message', 'next_retry_at', 'attempt_count', 'provider_message_id', 'sent_at']
        }
      },
      notification_events: {
        tableName: 'notification_events',
        clientMode: 'admin',
        permissions: this.adminCrudPermissions('notification.messages.manage'),
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 100, maxPageSize: 1000 },
        create: {
          allowedFields: ['tenant_id', 'event_type', 'source_type', 'source_id', 'actor_id', 'payload', 'idempotency_key', 'status', 'error_message', 'processed_at'],
          requiredFields: ['event_type', 'idempotency_key']
        },
        update: {
          allowedFields: ['status', 'error_message', 'processed_at']
        }
      },
      notification_templates: {
        tableName: 'notification_templates',
        clientMode: 'admin',
        permissions: this.adminCrudPermissions('notification.templates.manage'),
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 100, maxPageSize: 1000 },
        create: {
          allowedFields: ['code', 'name', 'event_type', 'channel', 'title_template', 'content_template', 'status', 'metadata'],
          requiredFields: ['code', 'name', 'event_type', 'channel', 'title_template']
        },
        update: {
          allowedFields: ['code', 'name', 'event_type', 'channel', 'title_template', 'content_template', 'status', 'metadata'],
          requiredFields: ['code', 'name', 'event_type', 'channel', 'title_template']
        }
      }
    };
  }

  protected override hooks(): ServiceHooks {
    return {
      notification_messages: {
        beforeCreate: [this.normalizeMessagePayload],
        beforeUpdate: [this.normalizeMessageUpdatePayload],
        afterCreate: [this.normalizeMessageResult],
        afterUpdate: [this.normalizeMessageResult]
      },
      notification_preferences: {
        beforeCreate: [this.normalizePreferencePayload],
        beforeUpdate: [this.normalizePreferencePayload],
        afterCreate: [this.normalizePreferenceResult],
        afterUpdate: [this.normalizePreferenceResult]
      },
      notification_deliveries: {
        beforeUpdate: [this.normalizeDeliveryPayload]
      }
    };
  }

  protected override async executeAction(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'getUnreadCount':
        return this.getUnreadCount(postData, context);
      case 'markRead':
        return this.markRead(postData, context);
      case 'markAllRead':
        return this.markAllRead(postData, context);
      case 'createSystemNotice':
        return this.createSystemNotice(postData, context);
      default:
        throw new BadRequestException(`Unsupported notification method: ${method}`);
    }
  }

  private adminCrudPermissions(permission: string) {
    return { list: permission, create: permission, update: permission, delete: permission };
  }

  private normalizeMessagePayload = (ctx: HookContext) => {
    ctx.data.tenant_id = readOptionalString(ctx.data.tenant_id ?? ctx.input.tenantId ?? ctx.input.tenant_id) || 'default';
    ctx.data.category = readCategory(ctx.data.category) ?? 'system';
    ctx.data.channel = 'inbox';
    ctx.data.priority = readPriority(ctx.data.priority);
    ctx.data.metadata = readJsonObject(ctx.data.metadata);
    if ('linkUrl' in ctx.input) ctx.data.link_url = readOptionalString(ctx.input.linkUrl) || null;
    if ('sourceType' in ctx.input) ctx.data.source_type = readOptionalString(ctx.input.sourceType) || null;
    if ('sourceId' in ctx.input) ctx.data.source_id = readOptionalString(ctx.input.sourceId) || null;
  };

  private normalizeMessageUpdatePayload = (ctx: HookContext) => {
    const now = new Date().toISOString();
    if (readBoolean(ctx.input.markRead ?? ctx.input.mark_read, false)) {
      ctx.data.read_at = ctx.data.read_at || now;
    }

    if (readBoolean(ctx.input.archive ?? ctx.input.archived, false)) {
      ctx.data.read_at = ctx.data.read_at || now;
      ctx.data.archived_at = ctx.data.archived_at || now;
    }

    if ('readAt' in ctx.input) ctx.data.read_at = readOptionalString(ctx.input.readAt) || null;
    if ('archivedAt' in ctx.input) ctx.data.archived_at = readOptionalString(ctx.input.archivedAt) || null;
  };

  private normalizePreferencePayload = async (ctx: HookContext) => {
    const { user } = await getCurrentUser(ctx.context);
    const targetUserId = readOptionalString(ctx.input.userId ?? ctx.input.user_id ?? ctx.data.user_id) || user.id;
    if (targetUserId !== user.id) await requireAdmin(ctx.context, 'notification.messages.manage');

    ctx.data.tenant_id = readOptionalString(ctx.input.tenantId ?? ctx.input.tenant_id ?? ctx.data.tenant_id) || 'default';
    ctx.data.user_id = targetUserId;
    const category = readCategory(ctx.data.category ?? ctx.input.category);
    if (category) ctx.data.category = category;
    if (ctx.action === 'create' && !ctx.data.category) throw new BadRequestException('category is required.');
    if ('inboxEnabled' in ctx.input) ctx.data.inbox_enabled = readBoolean(ctx.input.inboxEnabled, true);
    if ('emailEnabled' in ctx.input) ctx.data.email_enabled = readBoolean(ctx.input.emailEnabled, false);
    if ('smsEnabled' in ctx.input) ctx.data.sms_enabled = readBoolean(ctx.input.smsEnabled, false);
    if ('quietHours' in ctx.input || 'quiet_hours' in ctx.input) {
      ctx.data.quiet_hours = readJsonObject(ctx.input.quietHours ?? ctx.input.quiet_hours);
    }
  };

  private normalizeDeliveryPayload = (ctx: HookContext) => {
    if (ctx.input.retry === true) {
      ctx.data.status = 'pending';
      ctx.data.error_message = null;
      ctx.data.next_retry_at = null;
    }
  };

  private normalizeMessageResult = (ctx: HookContext) => {
    if (Array.isArray(ctx.result)) ctx.result = (ctx.result as NotificationMessageRow[]).map(normalizeMessage);
    else if (ctx.result) ctx.result = normalizeMessage(ctx.result as NotificationMessageRow);
  };

  private normalizePreferenceResult = (ctx: HookContext) => {
    if (Array.isArray(ctx.result)) ctx.result = (ctx.result as NotificationPreferenceRow[]).map(normalizePreference);
    else if (ctx.result) ctx.result = normalizePreference(ctx.result as NotificationPreferenceRow);
  };

  private async getUnreadCount(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const targetUserId = readOptionalString(postData.userId ?? postData.user_id) || user.id;
    if (targetUserId !== user.id) await requireAdmin(context, ['notification.messages.manage', 'admin.users.manage']);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const unreadFilters = {
      tenant_id: tenantId,
      recipient_id: targetUserId,
      read_at: { op: 'isNull' },
      archived_at: { op: 'isNull' }
    };

    const page = await this.safeListItemsPage<{ id: string }>(
      {
        tableName: 'notification_messages',
        select: 'id',
        filters: unreadFilters,
        responseMode: 'page',
        pageSize: 1
      },
      context,
      { rows: [], total: 0, page: 1, pageSize: 1 }
    );

    const rows = await this.safeListItems<Record<string, unknown>>(
      {
        tableName: 'notification_messages',
        select: 'category',
        filters: unreadFilters,
        pageSize: 1000
      },
      context
    );

    const byCategory = rows.reduce<Record<string, number>>((counts, row) => {
      const category = String((row as Record<string, unknown>).category ?? '');
      counts[category] = (counts[category] ?? 0) + 1;
      return counts;
    }, {});

    return { total: page.total, byCategory };
  }

  private async markRead(postData: PostData, context: ServiceContext) {
    const ids = readStringArray(postData.ids);
    if (!ids.length) return { success: true, count: 0 };
    return this.markMessagesRead(postData, context, ids);
  }

  private async markAllRead(postData: PostData, context: ServiceContext) {
    return this.markMessagesRead(postData, context);
  }

  private async markMessagesRead(
    postData: PostData,
    context: ServiceContext,
    ids: string[] = []
  ) {
    const { client, user } = await getCurrentUser(context);
    const targetUserId = readOptionalString(postData.userId ?? postData.user_id) || user.id;
    let writeClient = client;

    if (targetUserId !== user.id) {
      await requireAdmin(context, ['notification.messages.manage', 'admin.users.manage']);
      writeClient = resolveAdminClient(client);
    }

    let query = writeClient
      .from('notification_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('tenant_id', readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default')
      .eq('recipient_id', targetUserId)
      .is('read_at', null)
      .is('archived_at', null);

    if (ids.length) query = query.in('id', ids);
    const category = readCategory(postData.category);
    if (category) query = query.eq('category', category);

    const { data, error } = await query.select('*');
    if (error) throw new BadRequestException(error.message);
    const messages = ((data ?? []) as NotificationMessageRow[]).map(normalizeMessage);
    return { success: true, count: messages.length, messages };
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
    const recipientIds = await this.resolveRecipients(postData, context);
    const eventPayload = { title, content, linkUrl, priority, recipientIds, metadata };

    const { data: event, error: eventError } = await writeClient
      .from('notification_events')
      .upsert({
        tenant_id: tenantId,
        event_type: 'system.notice.created',
        source_type: 'system_notice',
        source_id: noticeId,
        actor_id: user.id,
        payload: eventPayload,
        idempotency_key: `system-notice:${noticeId}`,
        status: 'processed',
        processed_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,idempotency_key' })
      .select('*')
      .single();

    if (eventError) throw new BadRequestException(eventError.message);

    if (!recipientIds.length) return { success: true, event, messages: [], count: 0 };

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
      .upsert(messages, { onConflict: 'tenant_id,recipient_id,source_type,source_id,category' })
      .select('*');

    if (error) throw new BadRequestException(error.message);

    return {
      success: true,
      event,
      messages: ((data ?? []) as NotificationMessageRow[]).map(normalizeMessage),
      count: data?.length ?? 0
    };
  }

  private async resolveRecipients(postData: PostData, context: ServiceContext) {
    const explicitIds = [
      ...readStringArray(postData.recipientIds ?? postData.recipient_ids),
      ...readStringArray(postData.userIds ?? postData.user_ids)
    ];

    if (explicitIds.length) return [...new Set(explicitIds)];

    const rows = await this.safeListItems<Record<string, unknown>>(
      {
        tableName: 'users',
        select: 'id',
        clientMode: 'admin',
        sorts: [{ field: 'created_at', direction: 'asc' }],
        pageSize: 1000
      },
      context
    );

    return [...new Set(rows.map((row) => String(row.id ?? '')).filter(Boolean))];
  }

  private async safeListItems<T extends Record<string, unknown>>(
    postData: PostData,
    context: ServiceContext,
    fallback: T[] = []
  ) {
    try {
      const result = await this.listItems(postData, context);
      return Array.isArray(result) ? (result as unknown as T[]) : fallback;
    } catch (error) {
      if (this.isMissingNotificationListError(error)) return fallback;
      throw error;
    }
  }

  private async safeListItemsPage<T extends Record<string, unknown>>(
    postData: PostData,
    context: ServiceContext,
    fallback: { rows: T[]; total: number; page: number; pageSize: number }
  ) {
    try {
      const result = await this.listItems(postData, context);
      return isRecord(result) && Array.isArray(result.rows)
        ? result as unknown as { rows: T[]; total: number; page: number; pageSize: number }
        : fallback;
    } catch (error) {
      if (this.isMissingNotificationListError(error)) return fallback;
      throw error;
    }
  }

  private isMissingNotificationListError(error: unknown) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      return isMissingNotificationTable({ message: typeof response === 'string' ? response : error.message });
    }

    return isMissingNotificationTable(error instanceof Error ? { message: error.message } : null);
  }
}
