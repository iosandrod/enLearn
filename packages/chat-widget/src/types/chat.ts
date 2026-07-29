import type { Ref } from 'vue';

export type ChatWidgetStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type ChatWidgetError = {
  message: string;
  statusCode?: number;
};

export type ChatWidgetConversation = {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  type: 'direct' | 'group' | 'system';
  title: string | null;
  unreadCount?: number;
  unread_count?: number;
  lastMessageId?: string | null;
  lastMessageAt?: string | null;
  metadata?: Record<string, unknown>;
  member?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ChatWidgetMessage = {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  conversationId: string;
  conversation_id?: string;
  senderId: string | null;
  sender_id?: string | null;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  message_type?: 'text' | 'image' | 'file' | 'system';
  attachmentIds?: string[];
  attachment_ids?: string[];
  replyToId?: string | null;
  reply_to_id?: string | null;
  status: 'sending' | 'sent' | 'failed' | 'edited' | 'deleted';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
};

export type SendChatWidgetMessageInput = {
  tenantId?: string;
  conversationId: string;
  content?: string;
  messageType?: ChatWidgetMessage['messageType'];
  attachmentIds?: string[];
  replyToId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

export type ChatWidgetApi = {
  listConversations(params?: Record<string, unknown>): Promise<ChatWidgetConversation[]>;
  listMessages(params: {
    tenantId?: string;
    conversationId: string;
    page?: number;
    pageSize?: number;
  }): Promise<ChatWidgetMessage[]>;
  createDirectConversation(params: {
    tenantId?: string;
    targetUserId: string;
  }): Promise<ChatWidgetConversation>;
};

export type ChatWidgetSocket = {
  status: Ref<ChatWidgetStatus>;
  lastError: Ref<ChatWidgetError | null>;
  messages: Ref<ChatWidgetMessage[]>;
  connect(): Promise<unknown>;
  disconnect?(): void;
  joinConversation(conversationId: string, tenantId?: string): Promise<void>;
  leaveConversation(conversationId: string): Promise<void>;
  sendMessage(input: SendChatWidgetMessageInput): Promise<void>;
  markRead(conversationId: string, messageId?: string, tenantId?: string): Promise<void>;
  setTyping(conversationId: string, isTyping: boolean, tenantId?: string): Promise<void>;
};

