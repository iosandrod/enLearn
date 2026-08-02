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
    tenantId: row.tenant_id,
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
        tenantId: member.tenant_id,
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
    tenantId: row.tenant_id,
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
      conversations: {
        tableName: 'chat_conversations',
        defaults: { tenant_id: 'default', type: 'direct', metadata: {} },
        list: { defaultSorts: [{ field: 'last_message_at', direction: 'desc' }], defaultPageSize: 20, maxPageSize: 100 },
        create: {
          allowedFields: ['tenant_id', 'type', 'title', 'created_by', 'last_message_id', 'last_message_at', 'metadata'],
          requiredFields: ['type'],
          userFields: { createdBy: 'created_by' }
        },
        update: {
          allowedFields: ['title', 'last_message_id', 'last_message_at', 'metadata']
        }
      },
      members: {
        tableName: 'chat_conversation_members',
        ownerField: 'user_id',
        defaults: { tenant_id: 'default', role: 'member', status: 'active' },
        list: { defaultSorts: [{ field: 'updated_at', direction: 'desc' }], defaultPageSize: 100, maxPageSize: 500 },
        create: {
          allowedFields: ['tenant_id', 'conversation_id', 'user_id', 'role', 'status', 'muted_at', 'pinned_at', 'last_read_message_id', 'last_read_at'],
          requiredFields: ['conversation_id'],
          userFields: { owner: 'user_id' }
        },
        update: {
          allowedFields: ['role', 'status', 'muted_at', 'pinned_at', 'last_read_message_id', 'last_read_at']
        }
      },
      allMembers: {
        tableName: 'chat_conversation_members',
        clientMode: 'admin',
        defaults: { tenant_id: 'default', role: 'member', status: 'active' },
        list: { defaultSorts: [{ field: 'updated_at', direction: 'desc' }], defaultPageSize: 100, maxPageSize: 500 },
        create: {
          allowedFields: ['tenant_id', 'conversation_id', 'user_id', 'role', 'status', 'muted_at', 'pinned_at', 'last_read_message_id', 'last_read_at'],
          requiredFields: ['conversation_id', 'user_id']
        },
        update: {
          allowedFields: ['role', 'status', 'muted_at', 'pinned_at', 'last_read_message_id', 'last_read_at']
        }
      },
      messages: {
        tableName: 'chat_messages',
        defaults: { tenant_id: 'default', message_type: 'text', attachment_ids: [], status: 'sent', metadata: {} },
        list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }], defaultPageSize: 30, maxPageSize: 100 },
        create: {
          allowedFields: ['tenant_id', 'conversation_id', 'sender_id', 'content', 'message_type', 'attachment_ids', 'reply_to_id', 'status', 'metadata'],
          requiredFields: ['conversation_id'],
          userFields: { owner: 'sender_id' }
        },
        update: {
          allowedFields: ['content', 'status', 'edited_at', 'deleted_at', 'metadata']
        }
      },
      reads: {
        tableName: 'chat_message_reads',
        ownerField: 'user_id',
        defaults: { tenant_id: 'default' },
        create: {
          allowedFields: ['tenant_id', 'message_id', 'conversation_id', 'user_id', 'read_at'],
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
      conversations: {
        beforeCreate: [this.normalizeConversationPayload],
        afterCreate: [this.normalizeConversationResult],
        afterUpdate: [this.normalizeConversationResult]
      },
      messages: {
        beforeCreate: [this.normalizeMessagePayload],
        beforeUpdate: [this.normalizeMessageUpdatePayload],
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

  private normalizeConversationPayload = (ctx: HookContext) => {
    ctx.data.tenant_id = readOptionalString(ctx.data.tenant_id ?? ctx.input.tenantId ?? ctx.input.tenant_id) || 'default';
    ctx.data.type = readConversationType(ctx.data.type, 'group');
    ctx.data.metadata = readJsonObject(ctx.data.metadata);
  };

  private normalizeMessagePayload = (ctx: HookContext) => {
    ctx.data.tenant_id = readOptionalString(ctx.data.tenant_id ?? ctx.input.tenantId ?? ctx.input.tenant_id) || 'default';
    ctx.data.message_type = readMessageType(ctx.data.message_type ?? ctx.input.messageType ?? ctx.input.message_type);
    ctx.data.attachment_ids = readStringArray(ctx.data.attachment_ids ?? ctx.input.attachmentIds ?? ctx.input.attachment_ids);
    ctx.data.reply_to_id = readOptionalString(ctx.data.reply_to_id ?? ctx.input.replyToId ?? ctx.input.reply_to_id) || null;
    ctx.data.metadata = readJsonObject(ctx.data.metadata);
  };

  private normalizeMessageUpdatePayload = (ctx: HookContext) => {
    if (ctx.input.edit === true || ctx.input.edited === true) {
      ctx.data.status = 'edited';
      ctx.data.edited_at = ctx.data.edited_at || new Date().toISOString();
    }

    if (ctx.input.delete === true || ctx.input.deleted === true) {
      ctx.data.content = '';
      ctx.data.status = 'deleted';
      ctx.data.deleted_at = ctx.data.deleted_at || new Date().toISOString();
    }
  };

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
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const targetUserId = readString(postData.targetUserId ?? postData.target_user_id, 'targetUserId');

    if (targetUserId === user.id) {
      throw new BadRequestException('Cannot create a direct conversation with yourself.');
    }

    const existing = await this.findDirectConversation(tenantId, user.id, targetUserId, context);
    if (existing) return normalizeConversation(existing);

    const directMemberIds = [user.id, targetUserId].sort();
    const conversation = await this.runCrud('create', {
      resource: 'conversations',
      data: {
        tenant_id: tenantId,
        type: 'direct',
        created_by: user.id,
        metadata: {
          directMemberIds,
          directKey: directMemberIds.join(':')
        }
      }
    }, context) as ReturnType<typeof normalizeConversation>;

    await this.insertMembers(tenantId, String(conversation.id), [
      { userId: user.id, role: 'owner' },
      { userId: targetUserId, role: 'member' }
    ], context);

    return conversation;
  }

  async createGroupConversation(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const title = readString(postData.title, 'title');
    const memberIds = [...new Set([user.id, ...readStringArray(postData.memberIds ?? postData.member_ids)])];

    if (memberIds.length < 2) {
      throw new BadRequestException('Group conversation requires at least two members.');
    }

    const conversation = await this.runCrud('create', {
      resource: 'conversations',
      data: {
        tenant_id: tenantId,
        type: readConversationType(postData.type, 'group'),
        title,
        created_by: user.id,
        metadata: readJsonObject(postData.metadata)
      }
    }, context) as ReturnType<typeof normalizeConversation>;

    await this.insertMembers(
      tenantId,
      String(conversation.id),
      memberIds.map((memberId) => ({
        userId: memberId,
        role: memberId === user.id ? 'owner' : 'member'
      })),
      context
    );

    return conversation;
  }

  async sendMessage(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
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
      resource: 'messages',
      data: {
        tenant_id: tenantId,
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
      resource: 'conversations',
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
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const conversationId = readString(postData.conversationId ?? postData.conversation_id, 'conversationId');
    const messageId = readOptionalString(postData.messageId ?? postData.message_id);
    const now = new Date().toISOString();

    await this.requireActiveMember(tenantId, conversationId, user.id, context);

    await this.runCrud('update', {
      resource: 'members',
      filters: {
        tenant_id: tenantId,
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
        filters: { tenant_id: tenantId, message_id: messageId, user_id: user.id },
        pageSize: 1
      }, context);

      await this.runCrud(existing ? 'update' : 'create', {
        resource: 'reads',
        ...(existing?.id ? { id: existing.id } : {}),
        data: {
          tenant_id: tenantId,
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
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const id = readString(postData.id ?? postData.messageId ?? postData.message_id, 'messageId');
    const content = readString(postData.content, 'content');
    const message = await this.requireMessageOwner(tenantId, id, user.id, context);

    return this.runCrud('update', {
      resource: 'messages',
      id: message.id,
      data: { content, edit: true }
    }, context);
  }

  async deleteMessage(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const id = readString(postData.id ?? postData.messageId ?? postData.message_id, 'messageId');
    const message = await this.requireMessageOwner(tenantId, id, user.id, context);

    return this.runCrud('update', {
      resource: 'messages',
      id: message.id,
      data: { delete: true }
    }, context);
  }

  async listActiveMemberIds(tenantId: string, conversationId: string, context?: ServiceContext) {
    const rows = await this.listRows<Record<string, unknown>>({
      tableName: 'chat_conversation_members',
      clientMode: 'admin',
      select: 'user_id',
      filters: { tenant_id: tenantId, conversation_id: conversationId, status: 'active' },
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
      filters: { tenant_id: tenantId, conversation_id: conversationId, user_id: userId, status: 'active' },
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
      filters: { tenant_id: tenantId, id: messageId },
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
          tenant_id: tenantId,
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
        tenant_id: tenantId,
        type: 'direct',
        metadata: { op: 'contains', value: { directKey } }
      },
      pageSize: 1
    }, context);
  }

  private async insertMembers(
    tenantId: string,
    conversationId: string,
    members: Array<{ userId: string; role: string }>,
    context: ServiceContext
  ) {
    const rows = members.map((member) => ({
      tenant_id: tenantId,
      conversation_id: conversationId,
      user_id: member.userId,
      role: member.role,
      status: 'active'
    }));

    await this.runCrud('create', { resource: 'allMembers', items: rows }, context);
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
