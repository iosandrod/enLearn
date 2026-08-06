import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  BaseService,
  type HookContext,
  type ResourceConfigMap,
  type ServiceHooks,
  type ServicePostData
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { getCurrentUser } from '../common/utils/supabase';
import { getActiveAccountId, assertAccountUsers } from '../common/utils/account-context';
import type {
  ChatConversationMemberRow,
  ChatConversationRow,
  ChatConversationType,
  ChatMessageRow,
  ChatMessageType
} from './chat.types';

type PostData = Record<string, unknown>;

const conversationTypes: ChatConversationType[] = ['direct', 'group', 'system'];
const messageTypes: ChatMessageType[] = ['text', 'image', 'file', 'system'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readString(value: unknown, name: string) {
  const optional = readOptionalString(value);
  if (optional) return optional;
  throw new BadRequestException(`Missing required field: ${name}`);
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
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

function readConversationType(value: unknown, fallback: ChatConversationType) {
  const type = readOptionalString(value);
  return conversationTypes.includes(type as ChatConversationType)
    ? (type as ChatConversationType)
    : fallback;
}

function readMessageType(value: unknown, fallback: ChatMessageType = 'text') {
  const type = readOptionalString(value);
  return messageTypes.includes(type as ChatMessageType)
    ? (type as ChatMessageType)
    : fallback;
}

function normalizeConversation(
  row: ChatConversationRow,
  member?: ChatConversationMemberRow,
  unreadCount = 0
) {
  return {
    ...row,
    tenantId: row.account_id,
    createdBy: row.created_by,
    lastMessageId: row.last_message_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unread_count: unreadCount,
    unreadCount,
    member: member
      ? {
        ...member,
        tenantId: member.account_id,
        conversationId: member.conversation_id,
        userId: member.user_id,
        mutedAt: member.muted_at,
        pinnedAt: member.pinned_at,
        lastReadMessageId: member.last_read_message_id,
        lastReadAt: member.last_read_at,
        joinedAt: member.joined_at,
        createdAt: member.created_at,
        updatedAt: member.updated_at
      }
      : null
  };
}

function normalizeMessage(row: ChatMessageRow) {
  return {
    ...row,
    tenantId: row.account_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    messageType: row.message_type,
    attachmentIds: row.attachment_ids,
    replyToId: row.reply_to_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at
  };
}

@Injectable()
export class ChatService extends BaseService {
  protected override resources(): ResourceConfigMap {
    return {
      chat_conversations: {
        tableName: 'chat_conversations',
        internalActions: ['create', 'update', 'delete', 'action'],
        clientMode: 'admin',
        accountField: 'account_id',
        transactionalHooks: true,
        databaseHooks: { beforeCreate: 'public.dynamic_crud_normalize_chat_conversation' },
        detailRelations: {
          chat_conversation_members: {
            foreignKey: 'conversation_id',
            parentKey: 'id',
            inheritFields: ['account_id']
          }
        },
        defaults: { type: 'direct', metadata: {} },
        list: { defaultSorts: [{ field: 'last_message_at', direction: 'desc' }], defaultPageSize: 20, maxPageSize: 100 },
        create: {
          allowedFields: ['account_id', 'type', 'title', 'created_by', 'last_message_id', 'last_message_at', 'metadata'],
          requiredFields: ['type'],
          userFields: { createdBy: 'created_by' }
        },
        update: {
          allowedFields: ['title', 'last_message_id', 'last_message_at', 'metadata']
        }
      },
      chat_conversation_members: {
        tableName: 'chat_conversation_members',
        internalActions: ['create', 'update', 'delete', 'action'],
        clientMode: 'admin',
        accountField: 'account_id',
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_validate_chat_conversation_member'
        },
        defaults: { role: 'member', status: 'active' },
        list: { defaultSorts: [{ field: 'updated_at', direction: 'desc' }], defaultPageSize: 100, maxPageSize: 500 },
        create: {
          allowedFields: ['account_id', 'conversation_id', 'user_id', 'role', 'status', 'muted_at', 'pinned_at', 'last_read_message_id', 'last_read_at'],
          requiredFields: ['conversation_id'],
          userFields: {}
        },
        update: {
          allowedFields: ['role', 'status', 'muted_at', 'pinned_at', 'last_read_message_id', 'last_read_at']
        }
      },
      chat_messages: {
        tableName: 'chat_messages',
        internalActions: ['create', 'update', 'delete', 'action'],
        accountField: 'account_id',
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_normalize_chat_message',
          beforeUpdate: 'public.dynamic_crud_normalize_chat_message_update'
        },
        databaseHookInputFields: [
          'messageType', 'message_type', 'attachmentIds', 'attachment_ids',
          'replyToId', 'reply_to_id', 'edit', 'edited', 'delete', 'deleted'
        ],
        defaults: { message_type: 'text', attachment_ids: [], status: 'sent', metadata: {} },
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 30, maxPageSize: 100 },
        create: {
          allowedFields: ['account_id', 'conversation_id', 'sender_id', 'content', 'message_type', 'attachment_ids', 'reply_to_id', 'status', 'metadata'],
          requiredFields: ['conversation_id'],
          userFields: { owner: 'sender_id' }
        },
        update: {
          allowedFields: ['content', 'status', 'edited_at', 'deleted_at', 'metadata']
        }
      },
      chat_message_reads: {
        tableName: 'chat_message_reads',
        internalActions: ['create', 'update', 'delete', 'action'],
        accountField: 'account_id',
        ownerField: 'user_id',
        create: {
          allowedFields: ['account_id', 'message_id', 'conversation_id', 'user_id', 'read_at'],
          requiredFields: ['message_id', 'conversation_id'],
          userFields: { owner: 'user_id' }
        },
        update: {
          allowedFields: ['read_at']
        }
      }
    };
  }

  protected override hooks(): ServiceHooks {
    return {
      chat_conversations: {
        afterCreate: [this.normalizeConversationResult],
        afterUpdate: [this.normalizeConversationResult]
      },
      chat_messages: {
        afterCreate: [this.normalizeMessageResult],
        afterUpdate: [this.normalizeMessageResult]
      }
    };
  }

  protected override async executeAction(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'createDirectConversation':
        return this.createDirectConversation(postData, context);
      case 'createGroupConversation':
        return this.createGroupConversation(postData, context);
      case 'sendMessage':
        return this.sendMessage(postData, context);
      case 'markRead':
        return this.markRead(postData, context);
      case 'editMessage':
        return this.editMessage(postData, context);
      case 'deleteMessage':
        return this.deleteMessage(postData, context);
      default:
        throw new BadRequestException(`Unsupported chat method: ${method}`);
    }
  }

  private normalizeConversationResult = (ctx: HookContext) => {
    if (Array.isArray(ctx.result)) ctx.result = (ctx.result as ChatConversationRow[]).map((row) => normalizeConversation(row));
    else if (ctx.result) ctx.result = normalizeConversation(ctx.result as ChatConversationRow);
  };

  private normalizeMessageResult = (ctx: HookContext) => {
    if (Array.isArray(ctx.result)) ctx.result = (ctx.result as ChatMessageRow[]).map(normalizeMessage);
    else if (ctx.result) ctx.result = normalizeMessage(ctx.result as ChatMessageRow);
  };

  async createDirectConversation(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = getActiveAccountId(context);
    const targetUserId = readString(postData.targetUserId ?? postData.target_user_id, 'targetUserId');

    if (targetUserId === user.id) {
      throw new BadRequestException('Cannot create a direct conversation with yourself.');
    }
    await this.assertAccountMembers(tenantId, [targetUserId], context);

    const existing = await this.findDirectConversation(tenantId, user.id, targetUserId, context);
    if (existing) return normalizeConversation(existing);

    const directMemberIds = [user.id, targetUserId].sort();
    return this.runCrud('create', {
      resource: 'chat_conversations',
      data: {
        account_id: tenantId,
        type: 'direct',
        created_by: user.id,
        metadata: {
          directMemberIds,
          directKey: directMemberIds.join(':')
        },
        __details: [{
          resource: 'chat_conversation_members',
          foreignKey: 'conversation_id',
          inheritFields: ['account_id'],
          rows: [
            { user_id: user.id, role: 'owner', status: 'active' },
            { user_id: targetUserId, role: 'member', status: 'active' }
          ]
        }]
      }
    }, context) as Promise<ReturnType<typeof normalizeConversation>>;
  }

  async createGroupConversation(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = getActiveAccountId(context);
    const title = readString(postData.title, 'title');
    const memberIds = [...new Set([user.id, ...readStringArray(postData.memberIds ?? postData.member_ids)])];

    if (memberIds.length < 2) {
      throw new BadRequestException('Group conversation requires at least two members.');
    }
    await this.assertAccountMembers(tenantId, memberIds, context);

    return this.runCrud('create', {
      resource: 'chat_conversations',
      data: {
        account_id: tenantId,
        type: readConversationType(postData.type, 'group'),
        title,
        created_by: user.id,
        metadata: readJsonObject(postData.metadata),
        __details: [{
          resource: 'chat_conversation_members',
          foreignKey: 'conversation_id',
          inheritFields: ['account_id'],
          rows: memberIds.map((memberId) => ({
            user_id: memberId,
            role: memberId === user.id ? 'owner' : 'member',
            status: 'active'
          }))
        }]
      }
    }, context) as Promise<ReturnType<typeof normalizeConversation>>;
  }

  async sendMessage(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = getActiveAccountId(context);
    const conversationId = readString(postData.conversationId ?? postData.conversation_id, 'conversationId');
    const content = readOptionalString(postData.content);
    const messageType = readMessageType(postData.messageType ?? postData.message_type);
    const attachmentIds = readStringArray(postData.attachmentIds ?? postData.attachment_ids);

    if (!content && !attachmentIds.length) {
      throw new BadRequestException('Message content or attachmentIds is required.');
    }

    await this.requireActiveMember(tenantId, conversationId, user.id, context);

    const metadata = {
      ...readJsonObject(postData.metadata),
      requestId: readOptionalString(postData.requestId ?? postData.request_id) || randomUUID()
    };

    const message = await this.runCrud('create', {
      resource: 'chat_messages',
      data: {
        account_id: tenantId,
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: messageType,
        attachment_ids: attachmentIds,
        reply_to_id: readOptionalString(postData.replyToId ?? postData.reply_to_id) || null,
        metadata
      }
    }, context) as ReturnType<typeof normalizeMessage>;

    await this.runCrud('update', {
      resource: 'chat_conversations',
      id: conversationId,
      data: {
        last_message_id: message.id,
        last_message_at: message.createdAt
      }
    }, context);

    await this.markRead({ tenantId, conversationId, messageId: message.id }, context);
    return message;
  }

  async markRead(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = getActiveAccountId(context);
    const conversationId = readString(postData.conversationId ?? postData.conversation_id, 'conversationId');
    const messageId = readOptionalString(postData.messageId ?? postData.message_id);
    const now = new Date().toISOString();

    await this.requireActiveMember(tenantId, conversationId, user.id, context);

    await this.runCrud('update', {
      resource: 'chat_conversation_members',
      filters: {
        account_id: tenantId,
        conversation_id: conversationId,
        user_id: user.id
      },
      data: {
        last_read_at: now,
        ...(messageId ? { last_read_message_id: messageId } : {})
      }
    }, context);

    if (messageId) {
      const existing = await this.firstListItem<Record<string, unknown>>({
        tableName: 'chat_message_reads',
        filters: { account_id: tenantId, message_id: messageId, user_id: user.id },
        pageSize: 1
      }, context);

      await this.runCrud(existing ? 'update' : 'create', {
        resource: 'chat_message_reads',
        ...(existing?.id ? { id: existing.id } : {}),
        data: {
          account_id: tenantId,
          conversation_id: conversationId,
          message_id: messageId,
          user_id: user.id,
          read_at: now
        }
      }, context);
    }

    return {
      success: true,
      tenantId,
      conversationId,
      userId: user.id,
      messageId: messageId || null,
      readAt: now
    };
  }

  async editMessage(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = getActiveAccountId(context);
    const id = readString(postData.id ?? postData.messageId ?? postData.message_id, 'messageId');
    const content = readString(postData.content, 'content');
    const message = await this.requireMessageOwner(tenantId, id, user.id, context);

    return this.runCrud('update', {
      resource: 'chat_messages',
      id: message.id,
      data: { content, edit: true }
    }, context);
  }

  async deleteMessage(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = getActiveAccountId(context);
    const id = readString(postData.id ?? postData.messageId ?? postData.message_id, 'messageId');
    const message = await this.requireMessageOwner(tenantId, id, user.id, context);

    return this.runCrud('update', {
      resource: 'chat_messages',
      id: message.id,
      data: { delete: true }
    }, context);
  }

  async listActiveMemberIds(tenantId: string, conversationId: string, context?: ServiceContext) {
    const rows = await this.listRows<Record<string, unknown>>({
      tableName: 'chat_conversation_members',
      clientMode: 'admin',
      select: 'user_id',
      filters: { account_id: tenantId, conversation_id: conversationId, status: 'active' },
      pageSize: 500
    }, context ?? {});

    return rows.map((row) => String(row.user_id ?? '')).filter(Boolean);
  }

  async requireActiveMember(
    tenantId: string,
    conversationId: string,
    userId: string,
    context?: ServiceContext
  ) {
    const member = await this.firstListItem<ChatConversationMemberRow>({
      tableName: 'chat_conversation_members',
      clientMode: 'admin',
      filters: { account_id: tenantId, conversation_id: conversationId, user_id: userId, status: 'active' },
      pageSize: 1
    }, context ?? {});

    if (!member) throw new ForbiddenException('You are not a member of this conversation.');
    return member;
  }

  private async requireMessageOwner(
    tenantId: string,
    messageId: string,
    userId: string,
    context: ServiceContext
  ) {
    const message = await this.firstListItem<ChatMessageRow>({
      tableName: 'chat_messages',
      clientMode: 'admin',
      filters: { account_id: tenantId, id: messageId },
      pageSize: 1
    }, context);

    if (!message) throw new BadRequestException('Message not found.');
    await this.requireActiveMember(tenantId, message.conversation_id, userId, context);
    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only modify your own messages.');
    }

    return message;
  }

  private async loadUnreadCounts(
    tenantId: string,
    members: ChatConversationMemberRow[],
    context: ServiceContext
  ) {
    const counts = new Map<string, number>();

    await Promise.all(
      members.map(async (member) => {
        const filters: Record<string, unknown> = {
          account_id: tenantId,
          conversation_id: member.conversation_id,
          sender_id: { op: 'ne', value: member.user_id },
          deleted_at: { op: 'isNull' }
        };
        if (member.last_read_at) filters.created_at = { op: 'gt', value: member.last_read_at };

        const page = await this.listPage<{ id: string }>({
          tableName: 'chat_messages',
          clientMode: 'admin',
          select: 'id',
          filters,
          responseMode: 'page',
          pageSize: 1
        }, context);
        counts.set(member.conversation_id, page.total);
      })
    );

    return counts;
  }

  private async findDirectConversation(
    tenantId: string,
    userId: string,
    targetUserId: string,
    context: ServiceContext
  ) {
    const directKey = [userId, targetUserId].sort().join(':');
    return this.firstListItem<ChatConversationRow>({
      tableName: 'chat_conversations',
      clientMode: 'admin',
      filters: {
        account_id: tenantId,
        type: 'direct',
        metadata: { op: 'contains', value: { directKey } }
      },
      pageSize: 1
    }, context);
  }

  private async assertAccountMembers(
    _tenantId: string,
    userIds: string[],
    context: ServiceContext
  ) {
    await assertAccountUsers(
      context,
      userIds,
      'Every chat participant must belong to the active account set.'
    );
  }

  private async listRows<T extends Record<string, unknown>>(postData: ServicePostData, context: ServiceContext) {
    const result = await this.listItems(postData, context);
    return Array.isArray(result) ? result as unknown as T[] : [];
  }

  private async firstListItem<T extends Record<string, unknown>>(postData: ServicePostData, context: ServiceContext) {
    return (await this.listRows<T>({ ...postData, pageSize: 1 }, context))[0];
  }

  private async listPage<T extends Record<string, unknown>>(postData: ServicePostData, context: ServiceContext) {
    const result = await this.listItems(postData, context);
    if (isRecord(result) && Array.isArray(result.rows)) {
      return result as unknown as { rows: T[]; total: number; page: number; pageSize: number };
    }
    return { rows: [], total: 0, page: 1, pageSize: 1 };
  }
}
