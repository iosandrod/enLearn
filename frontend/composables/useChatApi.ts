export type ChatConversation = {
  id: string;
  tenantId: string;
  tenant_id: string;
  type: 'direct' | 'group' | 'system';
  title: string | null;
  unreadCount: number;
  unread_count: number;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  metadata: Record<string, unknown>;
  member?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  tenantId: string;
  tenant_id: string;
  conversationId: string;
  conversation_id: string;
  senderId: string | null;
  sender_id: string | null;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  message_type: 'text' | 'image' | 'file' | 'system';
  attachmentIds: string[];
  attachment_ids: string[];
  replyToId: string | null;
  reply_to_id: string | null;
  status: 'sending' | 'sent' | 'failed' | 'edited' | 'deleted';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type SendChatMessageInput = {
  tenantId?: string;
  conversationId: string;
  content?: string;
  messageType?: ChatMessage['messageType'];
  attachmentIds?: string[];
  replyToId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

export function useChatApi() {
  const { invoke } = useServiceApi();

  function listConversations(params: Record<string, unknown> = {}) {
    return invoke<ChatConversation[]>('chat', 'listItems', {
      ...params,
      itemType: 'conversations'
    });
  }

  function listMessages(params: {
    tenantId?: string;
    conversationId: string;
    page?: number;
    pageSize?: number;
  }) {
    return invoke<ChatMessage[]>('chat', 'listItems', {
      ...params,
      itemType: 'messages'
    });
  }

  function createDirectConversation(params: {
    tenantId?: string;
    targetUserId: string;
  }) {
    return invoke<ChatConversation>('chat', 'createDirectConversation', params);
  }

  function createGroupConversation(params: {
    tenantId?: string;
    title: string;
    memberIds: string[];
    metadata?: Record<string, unknown>;
  }) {
    return invoke<ChatConversation>('chat', 'createGroupConversation', params);
  }

  function sendMessage(params: SendChatMessageInput) {
    return invoke<ChatMessage>('chat', 'sendMessage', params);
  }

  function markRead(params: {
    tenantId?: string;
    conversationId: string;
    messageId?: string;
  }) {
    return invoke('chat', 'markRead', params);
  }

  return {
    listConversations,
    listMessages,
    createDirectConversation,
    createGroupConversation,
    sendMessage,
    markRead
  };
}

