import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseService } from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { createSupabaseClient, getCurrentUser } from '../common/utils/supabase';
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

function readNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
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

function resolveAdminClient(fallback: SupabaseClient) {
  try {
    return createSupabaseClient('admin');
  } catch {
    return fallback;
  }
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

  protected override async handleListItems(postData: PostData, context: ServiceContext) {
    switch (readOptionalString(postData.itemType ?? postData.item_type ?? postData.type) || 'conversations') {
      case 'conversations':
        return this.listConversations(postData, context);
      case 'messages':
        return this.listMessages(postData, context);
      default:
        throw new BadRequestException('Unsupported chat listItems itemType.');
    }
  }

  async listConversations(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const readClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const page = Math.max(1, Math.floor(readNumber(postData.page, 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(readNumber(postData.pageSize ?? postData.page_size, 20))));

    const { data: memberships, error: membershipError } = await readClient
      .from('chat_conversation_members')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (membershipError) throw new BadRequestException(membershipError.message);

    const memberRows = (memberships ?? []) as ChatConversationMemberRow[];
    const conversationIds = memberRows.map((member) => member.conversation_id);
    if (!conversationIds.length) return [];

    const { data: conversations, error: conversationError } = await readClient
      .from('chat_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', conversationIds)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (conversationError) throw new BadRequestException(conversationError.message);

    const membersByConversation = new Map(memberRows.map((member) => [member.conversation_id, member]));
    const unreadCounts = await this.loadUnreadCounts(readClient, tenantId, memberRows);

    return ((conversations ?? []) as ChatConversationRow[]).map((conversation) =>
      normalizeConversation(
        conversation,
        membersByConversation.get(conversation.id),
        unreadCounts.get(conversation.id) ?? 0
      )
    );
  }

  async listMessages(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const readClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const conversationId = readString(postData.conversationId ?? postData.conversation_id, 'conversationId');
    const page = Math.max(1, Math.floor(readNumber(postData.page, 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(readNumber(postData.pageSize ?? postData.page_size, 30))));

    await this.requireActiveMember(readClient, tenantId, conversationId, user.id);

    const { data, error } = await readClient
      .from('chat_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw new BadRequestException(error.message);

    return ((data ?? []) as ChatMessageRow[]).map(normalizeMessage).reverse();
  }

  async createDirectConversation(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const targetUserId = readString(postData.targetUserId ?? postData.target_user_id, 'targetUserId');

    if (targetUserId === user.id) {
      throw new BadRequestException('Cannot create a direct conversation with yourself.');
    }

    const existing = await this.findDirectConversation(writeClient, tenantId, user.id, targetUserId);
    if (existing) return normalizeConversation(existing);

    const directMemberIds = [user.id, targetUserId].sort();
    const { data: conversation, error: conversationError } = await writeClient
      .from('chat_conversations')
      .insert({
        tenant_id: tenantId,
        type: 'direct',
        created_by: user.id,
        metadata: {
          directMemberIds,
          directKey: directMemberIds.join(':')
        }
      })
      .select('*')
      .single();

    if (conversationError) throw new BadRequestException(conversationError.message);

    await this.insertMembers(writeClient, tenantId, (conversation as ChatConversationRow).id, [
      { userId: user.id, role: 'owner' },
      { userId: targetUserId, role: 'member' }
    ]);

    return normalizeConversation(conversation as ChatConversationRow);
  }

  async createGroupConversation(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const title = readString(postData.title, 'title');
    const memberIds = [...new Set([user.id, ...readStringArray(postData.memberIds ?? postData.member_ids)])];

    if (memberIds.length < 2) {
      throw new BadRequestException('Group conversation requires at least two members.');
    }

    const { data: conversation, error: conversationError } = await writeClient
      .from('chat_conversations')
      .insert({
        tenant_id: tenantId,
        type: readConversationType(postData.type, 'group'),
        title,
        created_by: user.id,
        metadata: readJsonObject(postData.metadata)
      })
      .select('*')
      .single();

    if (conversationError) throw new BadRequestException(conversationError.message);

    await this.insertMembers(
      writeClient,
      tenantId,
      (conversation as ChatConversationRow).id,
      memberIds.map((memberId) => ({
        userId: memberId,
        role: memberId === user.id ? 'owner' : 'member'
      }))
    );

    return normalizeConversation(conversation as ChatConversationRow);
  }

  async sendMessage(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const conversationId = readString(postData.conversationId ?? postData.conversation_id, 'conversationId');
    const content = readOptionalString(postData.content);
    const messageType = readMessageType(postData.messageType ?? postData.message_type);
    const attachmentIds = readStringArray(postData.attachmentIds ?? postData.attachment_ids);

    if (!content && !attachmentIds.length) {
      throw new BadRequestException('Message content or attachmentIds is required.');
    }

    await this.requireActiveMember(writeClient, tenantId, conversationId, user.id);

    const metadata = {
      ...readJsonObject(postData.metadata),
      requestId: readOptionalString(postData.requestId ?? postData.request_id) || randomUUID()
    };

    const { data: message, error } = await writeClient
      .from('chat_messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: messageType,
        attachment_ids: attachmentIds,
        reply_to_id: readOptionalString(postData.replyToId ?? postData.reply_to_id) || null,
        metadata
      })
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);

    const messageRow = message as ChatMessageRow;
    await writeClient
      .from('chat_conversations')
      .update({
        last_message_id: messageRow.id,
        last_message_at: messageRow.created_at
      })
      .eq('tenant_id', tenantId)
      .eq('id', conversationId);

    await this.markRead(
      {
        tenantId,
        conversationId,
        messageId: messageRow.id
      },
      context
    );

    return normalizeMessage(messageRow);
  }

  async markRead(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const conversationId = readString(postData.conversationId ?? postData.conversation_id, 'conversationId');
    const messageId = readOptionalString(postData.messageId ?? postData.message_id);
    const now = new Date().toISOString();

    await this.requireActiveMember(writeClient, tenantId, conversationId, user.id);

    const updatePayload: Record<string, unknown> = {
      last_read_at: now
    };
    if (messageId) updatePayload.last_read_message_id = messageId;

    const { error } = await writeClient
      .from('chat_conversation_members')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    if (error) throw new BadRequestException(error.message);

    if (messageId) {
      await writeClient
        .from('chat_message_reads')
        .upsert(
          {
            tenant_id: tenantId,
            conversation_id: conversationId,
            message_id: messageId,
            user_id: user.id,
            read_at: now
          },
          { onConflict: 'message_id,user_id' }
        );
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
    const { client, user } = await getCurrentUser(context);
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const id = readString(postData.id ?? postData.messageId ?? postData.message_id, 'messageId');
    const content = readString(postData.content, 'content');
    const now = new Date().toISOString();

    const message = await this.requireMessageOwner(writeClient, tenantId, id, user.id);

    const { data, error } = await writeClient
      .from('chat_messages')
      .update({
        content,
        status: 'edited',
        edited_at: now
      })
      .eq('tenant_id', tenantId)
      .eq('id', message.id)
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);
    return normalizeMessage(data as ChatMessageRow);
  }

  async deleteMessage(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const writeClient = resolveAdminClient(client);
    const tenantId = readOptionalString(postData.tenantId ?? postData.tenant_id) || 'default';
    const id = readString(postData.id ?? postData.messageId ?? postData.message_id, 'messageId');
    const now = new Date().toISOString();

    const message = await this.requireMessageOwner(writeClient, tenantId, id, user.id);

    const { data, error } = await writeClient
      .from('chat_messages')
      .update({
        content: '',
        status: 'deleted',
        deleted_at: now
      })
      .eq('tenant_id', tenantId)
      .eq('id', message.id)
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);
    return normalizeMessage(data as ChatMessageRow);
  }

  async listActiveMemberIds(client: SupabaseClient, tenantId: string, conversationId: string) {
    const { data, error } = await client
      .from('chat_conversation_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('status', 'active');

    if (error) throw new BadRequestException(error.message);

    return (data ?? [])
      .map((row) => String((row as Record<string, unknown>).user_id ?? ''))
      .filter(Boolean);
  }

  async requireActiveMember(
    client: SupabaseClient,
    tenantId: string,
    conversationId: string,
    userId: string
  ) {
    const { data, error } = await client
      .from('chat_conversation_members')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new ForbiddenException('You are not a member of this conversation.');

    return data as ChatConversationMemberRow;
  }

  private async requireMessageOwner(
    client: SupabaseClient,
    tenantId: string,
    messageId: string,
    userId: string
  ) {
    const { data, error } = await client
      .from('chat_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', messageId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new BadRequestException('Message not found.');

    const message = data as ChatMessageRow;
    await this.requireActiveMember(client, tenantId, message.conversation_id, userId);
    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only modify your own messages.');
    }

    return message;
  }

  private async loadUnreadCounts(
    client: SupabaseClient,
    tenantId: string,
    members: ChatConversationMemberRow[]
  ) {
    const counts = new Map<string, number>();

    await Promise.all(
      members.map(async (member) => {
        let query = client
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('conversation_id', member.conversation_id)
          .neq('sender_id', member.user_id)
          .is('deleted_at', null);

        if (member.last_read_at) {
          query = query.gt('created_at', member.last_read_at);
        }

        const { count } = await query;
        counts.set(member.conversation_id, count ?? 0);
      })
    );

    return counts;
  }

  private async findDirectConversation(
    client: SupabaseClient,
    tenantId: string,
    userId: string,
    targetUserId: string
  ) {
    const directKey = [userId, targetUserId].sort().join(':');
    const { data, error } = await client
      .from('chat_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', 'direct')
      .contains('metadata', { directKey })
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return (data as ChatConversationRow | null) ?? null;
  }

  private async insertMembers(
    client: SupabaseClient,
    tenantId: string,
    conversationId: string,
    members: Array<{ userId: string; role: string }>
  ) {
    const { error } = await client
      .from('chat_conversation_members')
      .upsert(
        members.map((member) => ({
          tenant_id: tenantId,
          conversation_id: conversationId,
          user_id: member.userId,
          role: member.role,
          status: 'active'
        })),
        { onConflict: 'conversation_id,user_id' }
      );

    if (error) throw new BadRequestException(error.message);
  }
}
