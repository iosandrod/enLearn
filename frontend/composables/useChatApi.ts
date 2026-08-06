export type ChatConversation = {
  id: string;
  tenantId: string;
  account_id: string;
  type: 'direct' | 'group' | 'system';
  title: string | null;
  unreadCount: number;
  unread_count: number;
  lastMessageId: string | null;
  last_message_id?: string | null;
  lastMessageAt: string | null;
  last_message_at?: string | null;
  metadata: Record<string, unknown>;
  member?: Record<string, unknown> | null;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
};

export type ChatMessage = {
  id: string;
  tenantId: string;
  account_id: string;
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
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
  editedAt: string | null;
  edited_at?: string | null;
  deletedAt: string | null;
  deleted_at?: string | null;
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
  const auth = useAuth();

  function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  function tenantId(params: Record<string, unknown>) {
    return auth.activeAccount.value?.account_id ?? '';
  }

  function currentUserId() {
    return auth.user.value?.id ?? '';
  }

  async function listRows<T>(postData: Record<string, unknown>) {
    const rows = await invoke<T[]>('chat', 'listItems', postData);
    return Array.isArray(rows) ? rows : [];
  }

  async function countRows(postData: Record<string, unknown>) {
    const page = await invoke<{ total?: number }>('chat', 'listItems', {
      ...postData,
      responseMode: 'page',
      pageSize: 1
    });
    return typeof page?.total === 'number' ? page.total : 0;
  }

  function normalizeConversation(row: ChatConversation, member?: Record<string, unknown> | null, unreadCount = 0) {
    return {
      ...row,
      tenantId: row.tenantId ?? row.account_id,
      lastMessageId: row.lastMessageId ?? row.last_message_id,
      lastMessageAt: row.lastMessageAt ?? row.last_message_at,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
      unread_count: unreadCount,
      unreadCount,
      member: member ?? null
    } as ChatConversation;
  }

  function normalizeMessage(row: ChatMessage) {
    return {
      ...row,
      tenantId: row.tenantId ?? row.account_id,
      conversationId: row.conversationId ?? row.conversation_id,
      senderId: row.senderId ?? row.sender_id,
      messageType: row.messageType ?? row.message_type,
      attachmentIds: row.attachmentIds ?? row.attachment_ids,
      replyToId: row.replyToId ?? row.reply_to_id,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
      editedAt: row.editedAt ?? row.edited_at,
      deletedAt: row.deletedAt ?? row.deleted_at
    } as ChatMessage;
  }

  async function listConversations(params: Record<string, unknown> = {}) {
    const userId = currentUserId();
    if (!userId) return [] as ChatConversation[];

    const members = await listRows<Record<string, unknown>>({
      tableName: 'chat_conversation_members',
      filters: {
        account_id: tenantId(params),
        user_id: userId,
        status: 'active'
      },
      sorts: [{ field: 'updated_at', direction: 'desc' }],
      pageSize: params.pageSize ?? params.page_size ?? 20,
      page: params.page
    });

    const conversationIds = members.map((member) => readString(member.conversation_id)).filter(Boolean);
    if (!conversationIds.length) return [];

    const rows = await listRows<ChatConversation>({
      tableName: 'chat_conversations',
      filters: {
        account_id: tenantId(params),
        id: { op: 'in', value: conversationIds }
      },
      sorts: [{ field: 'last_message_at', direction: 'desc' }],
      pageSize: conversationIds.length
    });

    const membersByConversation = new Map(members.map((member) => [readString(member.conversation_id), member]));
    const unreadCounts = new Map<string, number>();
    await Promise.all(members.map(async (member) => {
      const conversationId = readString(member.conversation_id);
      if (!conversationId) return;
      const filters: Record<string, unknown> = {
        account_id: tenantId(params),
        conversation_id: conversationId,
        sender_id: { op: 'ne', value: userId },
        deleted_at: { op: 'isNull' }
      };
      if (readString(member.last_read_at)) filters.created_at = { op: 'gt', value: readString(member.last_read_at) };
      unreadCounts.set(conversationId, await countRows({
        tableName: 'chat_messages',
        select: 'id',
        filters
      }));
    }));

    return rows.map((row) => normalizeConversation(
      row,
      membersByConversation.get(row.id),
      unreadCounts.get(row.id) ?? 0
    ));
  }

  async function listMessages(params: {
    tenantId?: string;
    conversationId: string;
    page?: number;
    pageSize?: number;
  }) {
    const rows = await listRows<ChatMessage>({
      ...params,
      tableName: 'chat_messages',
      filters: {
        account_id: tenantId(params),
        conversation_id: params.conversationId
      },
      sorts: [{ field: 'created_at', direction: 'desc' }],
      pageSize: params.pageSize ?? 30,
      page: params.page
    });

    return rows.map(normalizeMessage).reverse();
  }

  function createDirectConversation(params: {
    tenantId?: string;
    targetUserId: string;
  }) {
    return invoke<ChatConversation>('chat', 'createDirectConversation', {
      ...params,
      tenantId: tenantId(params)
    });
  }

  function createGroupConversation(params: {
    tenantId?: string;
    title: string;
    memberIds: string[];
    metadata?: Record<string, unknown>;
  }) {
    return invoke<ChatConversation>('chat', 'createGroupConversation', {
      ...params,
      tenantId: tenantId(params)
    });
  }

  function sendMessage(params: SendChatMessageInput) {
    return invoke<ChatMessage>('chat', 'sendMessage', {
      ...params,
      tenantId: tenantId(params)
    });
  }

  function markRead(params: {
    tenantId?: string;
    conversationId: string;
    messageId?: string;
  }) {
    return invoke('chat', 'markRead', {
      ...params,
      tenantId: tenantId(params)
    });
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

