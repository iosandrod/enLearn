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
import {
  getActiveAccountId,
  assertAccountUsers,
  listActiveAccountUserIds
} from '../common/utils/account-context';
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
    tenantId: row.account_id,
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
        accountField: 'account_id',
        ownerField: 'recipient_id',
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_normalize_notification_message',
          beforeUpdate: 'public.dynamic_crud_normalize_notification_message_update'
        },
        databaseHookInputFields: [
          'linkUrl', 'sourceType', 'sourceId', 'recipientId',
          'markRead', 'mark_read', 'archive', 'archived', 'readAt', 'archivedAt'
        ],
        defaults: { category: 'system', channel: 'inbox', priority: 'normal', metadata: {} },
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 20, maxPageSize: 100 },
        create: {
          allowedFields: ['account_id', 'event_id', 'recipient_id', 'category', 'channel', 'title', 'content', 'link_url', 'priority', 'source_type', 'source_id', 'metadata'],
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
        accountField: 'account_id',
        ownerField: 'user_id',
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_normalize_notification_preference',
          beforeUpdate: 'public.dynamic_crud_normalize_notification_preference'
        },
        databaseHookInputFields: [
          'userId', 'user_id', 'category', 'inboxEnabled', 'emailEnabled',
          'smsEnabled', 'quietHours', 'quiet_hours'
        ],
        defaults: { inbox_enabled: true, email_enabled: false, sms_enabled: false, quiet_hours: {} },
        list: { defaultSorts: [{ field: 'category', direction: 'asc' }], defaultPageSize: 100, maxPageSize: 100 },
        create: {
          allowedFields: ['account_id', 'user_id', 'category', 'inbox_enabled', 'email_enabled', 'sms_enabled', 'quiet_hours'],
          requiredFields: ['user_id', 'category'],
          userFields: { owner: 'user_id' }
        },
        update: {
          allowedFields: ['inbox_enabled', 'email_enabled', 'sms_enabled', 'quiet_hours']
        }
      },
      notification_deliveries: {
        tableName: 'notification_deliveries',
        accountField: 'account_id',
        clientMode: 'admin',
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_validate_account_recipient',
          beforeUpdate: 'public.dynamic_crud_normalize_notification_delivery'
        },
        databaseHookInputFields: ['recipientId', 'retry'],
        permissions: this.adminCrudPermissions('notification.deliveries.manage'),
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 20, maxPageSize: 100 },
        create: {
          allowedFields: ['account_id', 'event_id', 'message_id', 'recipient_id', 'channel', 'target', 'template_code', 'status', 'attempt_count', 'provider_message_id', 'error_message', 'next_retry_at', 'sent_at'],
          requiredFields: ['recipient_id', 'channel']
        },
        update: {
          allowedFields: ['status', 'error_message', 'next_retry_at', 'attempt_count', 'provider_message_id', 'sent_at']
        }
      },
      notification_events: {
        tableName: 'notification_events',
        accountField: 'account_id',
        clientMode: 'admin',
        transactionalHooks: true,
        databaseHooks: { beforeCreate: 'public.dynamic_crud_validate_notification_event' },
        permissions: this.adminCrudPermissions('notification.messages.manage'),
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 100, maxPageSize: 1000 },
        create: {
          allowedFields: ['account_id', 'event_type', 'source_type', 'source_id', 'actor_id', 'payload', 'idempotency_key', 'status', 'error_message', 'processed_at'],
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
        afterCreate: [this.normalizeMessageResult],
        afterUpdate: [this.normalizeMessageResult]
      },
      notification_preferences: {
        afterCreate: [this.normalizePreferenceResult],
        afterUpdate: [this.normalizePreferenceResult]
      },
      notification_deliveries: {
        // Create/update validation and normalization execute inside the CRUD RPC.
      },
      notification_events: {}
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

  protected getNotificationCurrentUser(context: ServiceContext) {
    return getCurrentUser(context);
  }

  protected requireNotificationAdmin(context: ServiceContext) {
    return requireAdmin(context, ['notification.messages.manage', 'admin.users.manage']);
  }

  protected assertNotificationAccountUsers(context: ServiceContext, userIds: string[]) {
    return assertAccountUsers(
      context,
      userIds,
      'The notification recipient must belong to the active account set.'
    );
  }

  protected createNotificationCommandClient(context: ServiceContext) {
    return createSupabaseClient('admin', context);
  }

  private normalizeMessageResult = (ctx: HookContext) => {
    if (Array.isArray(ctx.result)) ctx.result = (ctx.result as NotificationMessageRow[]).map(normalizeMessage);
    else if (ctx.result) ctx.result = normalizeMessage(ctx.result as NotificationMessageRow);
  };

  private normalizePreferenceResult = (ctx: HookContext) => {
    if (Array.isArray(ctx.result)) ctx.result = (ctx.result as NotificationPreferenceRow[]).map(normalizePreference);
    else if (ctx.result) ctx.result = normalizePreference(ctx.result as NotificationPreferenceRow);
  };

  private async getUnreadCount(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const targetUserId = readOptionalString(postData.userId ?? postData.user_id) || user.id;
    if (targetUserId !== user.id) await requireAdmin(context, ['notification.messages.manage', 'admin.users.manage']);
    await assertAccountUsers(
      context,
      [targetUserId],
      'The notification recipient must belong to the active account set.'
    );
    const tenantId = getActiveAccountId(context);
    const readClient = targetUserId === user.id ? client : resolveAdminClient(client);
    const { data, error, count } = await readClient
      .from('notification_messages')
      .select('category', { count: 'exact' })
      .eq('account_id', tenantId)
      .eq('recipient_id', targetUserId)
      .is('read_at', null)
      .is('archived_at', null)
      .limit(1000);

    if (error) {
      if (isMissingNotificationTable(error)) return { total: 0, byCategory: {} };
      throw new BadRequestException(error.message);
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    const byCategory = rows.reduce<Record<string, number>>((counts, row) => {
      const category = String((row as Record<string, unknown>).category ?? '');
      counts[category] = (counts[category] ?? 0) + 1;
      return counts;
    }, {});

    return { total: count ?? rows.length, byCategory };
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
    const { user } = await this.getNotificationCurrentUser(context);
    const targetUserId = readOptionalString(postData.userId ?? postData.user_id) || user.id;

    if (targetUserId !== user.id) {
      await this.requireNotificationAdmin(context);
    }
    await this.assertNotificationAccountUsers(context, [targetUserId]);

    const category = readCategory(postData.category);
    const writeClient = this.createNotificationCommandClient(context);
    const { data, error } = await writeClient.rpc('notification_api_command', {
      p_action: 'mark_read',
      p_payload: {
        account_id: getActiveAccountId(context),
        recipient_id: targetUserId,
        ids,
        category: category ?? null
      }
    });
    if (error) throw new BadRequestException(error.message);
    const messages = (Array.isArray(data) ? data : [] as NotificationMessageRow[]).map((row) =>
      normalizeMessage(row as NotificationMessageRow)
    );
    return { success: true, count: messages.length, messages };
  }

  private async createSystemNotice(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'notification.notices.manage');
    const writeClient = resolveAdminClient(client);
    const tenantId = getActiveAccountId(context);
    const title = readString(postData.title, 'title');
    const content = readString(postData.content, 'content');
    const linkUrl = readOptionalString(postData.linkUrl ?? postData.link_url) || null;
    const priority = readPriority(postData.priority);
    const metadata = readJsonObject(postData.metadata);
    const noticeId = readOptionalString(postData.noticeId ?? postData.notice_id ?? postData.sourceId ?? postData.source_id) || randomUUID();
    const recipientIds = await this.resolveRecipients(postData, context);
    const eventPayload = { title, content, linkUrl, priority, recipientIds, metadata };

    const { data, error } = await writeClient.rpc('notification_api_command', {
      p_action: 'create_system_notice',
      p_payload: {
        account_id: tenantId,
        actor_id: user.id,
        notice_id: noticeId,
        title,
        content,
        link_url: linkUrl,
        priority,
        metadata,
        recipient_ids: recipientIds,
        event_payload: eventPayload
      }
    });

    if (error) throw new BadRequestException(error.message);
    if (!isRecord(data) || !isRecord(data.event) || !Array.isArray(data.messages)) {
      throw new BadRequestException('Notification API RPC returned an invalid result.');
    }
    const messages = (data.messages as NotificationMessageRow[]).map(normalizeMessage);

    return {
      success: true,
      event: data.event as NotificationEventRow,
      messages,
      count: messages.length
    };
  }

  private async resolveRecipients(postData: PostData, context: ServiceContext) {
    const explicitIds = [
      ...readStringArray(postData.recipientIds ?? postData.recipient_ids),
      ...readStringArray(postData.userIds ?? postData.user_ids)
    ];

    if (explicitIds.length) {
      const recipientIds = [...new Set(explicitIds)];
      await assertAccountUsers(
        context,
        recipientIds,
        'Every notification recipient must belong to the active account set.'
      );
      return recipientIds;
    }

    return listActiveAccountUserIds(context);
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
