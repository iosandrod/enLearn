import { io, type Socket } from 'socket.io-client';
import type { ChatMessage, SendChatMessageInput } from './useChatApi';

type SocketTokenResponse = {
  token: string;
  socketBaseUrl: string;
};

type ChatSocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

type ChatSocketError = {
  message: string;
  statusCode?: number;
};

let chatSocket: Socket | null = null;

export function useChatSocket() {
  const auth = useAuth();
  const status = useState<ChatSocketStatus>('chat-socket-status', () => 'idle');
  const lastError = useState<ChatSocketError | null>('chat-socket-error', () => null);
  const messages = useState<ChatMessage[]>('chat-socket-messages', () => []);
  const typingUsers = useState<Record<string, Record<string, boolean>>>(
    'chat-socket-typing-users',
    () => ({})
  );

  async function connect() {
    if (import.meta.server) return null;
    const accountId = auth.activeAccount.value?.account_id ?? '';
    if (!accountId) {
      throw createError({ statusCode: 400, statusMessage: '请先选择账套。' });
    }
    if (chatSocket?.connected && chatSocket.auth &&
      (chatSocket.auth as Record<string, unknown>).accountId === accountId) return chatSocket;
    if (chatSocket) disconnect();

    status.value = 'connecting';
    const { token, socketBaseUrl } = await $fetch<SocketTokenResponse>('/api/auth/socket-token');

    chatSocket = io(`${socketBaseUrl}/chat`, {
      auth: { token, accountId },
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    chatSocket.on('connect', () => {
      status.value = 'connected';
      lastError.value = null;
    });

    chatSocket.on('disconnect', () => {
      status.value = 'disconnected';
    });

    chatSocket.on('connect_error', (error) => {
      status.value = 'error';
      lastError.value = { message: error.message };
    });

    chatSocket.on('chat:error', (error: ChatSocketError) => {
      status.value = 'error';
      lastError.value = error;
    });

    chatSocket.on('chat:messageCreated', (message: ChatMessage) => {
      const requestId = typeof message.metadata?.requestId === 'string'
        ? message.metadata.requestId
        : '';
      const index = requestId
        ? messages.value.findIndex((item) => item.metadata?.requestId === requestId)
        : -1;

      if (index >= 0) {
        messages.value[index] = message;
      } else if (!messages.value.some((item) => item.id === message.id)) {
        messages.value.push(message);
      }
    });

    chatSocket.on('chat:typingUpdated', (event: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      typingUsers.value = {
        ...typingUsers.value,
        [event.conversationId]: {
          ...(typingUsers.value[event.conversationId] ?? {}),
          [event.userId]: event.isTyping
        }
      };
    });

    return chatSocket;
  }

  function disconnect() {
    chatSocket?.disconnect();
    chatSocket = null;
    status.value = 'idle';
  }

  function reset() {
    disconnect();
    messages.value = [];
    typingUsers.value = {};
    lastError.value = null;
  }

  function currentAccountId() {
    return auth.activeAccount.value?.account_id ?? '';
  }

  async function joinConversation(conversationId: string, tenantId = currentAccountId()) {
    const socket = await connect();
    socket?.emit('chat:joinConversation', { conversationId, tenantId });
  }

  async function leaveConversation(conversationId: string) {
    const socket = await connect();
    socket?.emit('chat:leaveConversation', { conversationId });
  }

  async function sendMessage(input: SendChatMessageInput) {
    const socket = await connect();
    const requestId =
      input.requestId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: ChatMessage = {
      id: requestId,
      tenantId: currentAccountId(),
      tenant_id: currentAccountId(),
      conversationId: input.conversationId,
      conversation_id: input.conversationId,
      senderId: null,
      sender_id: null,
      content: input.content ?? '',
      messageType: input.messageType ?? 'text',
      message_type: input.messageType ?? 'text',
      attachmentIds: input.attachmentIds ?? [],
      attachment_ids: input.attachmentIds ?? [],
      replyToId: input.replyToId ?? null,
      reply_to_id: input.replyToId ?? null,
      status: 'sending',
      metadata: {
        ...(input.metadata ?? {}),
        requestId
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null
    };

    messages.value.push(optimisticMessage);
    socket?.emit('chat:sendMessage', {
      ...input,
      tenantId: currentAccountId(),
      requestId
    });
  }

  async function markRead(conversationId: string, messageId?: string, tenantId = currentAccountId()) {
    const socket = await connect();
    socket?.emit('chat:markRead', { conversationId, messageId, tenantId });
  }

  async function setTyping(conversationId: string, isTyping: boolean, tenantId = currentAccountId()) {
    const socket = await connect();
    socket?.emit('chat:typing', { conversationId, isTyping, tenantId });
  }

  return {
    status,
    lastError,
    messages,
    typingUsers,
    connect,
    disconnect,
    reset,
    joinConversation,
    leaveConversation,
    sendMessage,
    markRead,
    setTyping
  };
}

