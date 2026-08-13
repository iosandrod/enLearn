import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Server, type Socket } from 'socket.io';
import { createSupabaseClient } from '../common/utils/supabase';
import { requireActiveAccount } from '../common/utils/account-context';
import { ChatService } from './chat.service';
import type { ChatSocketUser } from './chat.types';
import { registerFrontendCommandSocket } from '../frontend-command/frontend-command.socket';
import { frontendCommandUserRoom } from '../frontend-command/frontend-command.types';

type ChatSocket = Socket & {
  data: {
    user?: ChatSocketUser;
    authorization?: string;
    accountId?: string;
  };
};

function readConversationId(payload: Record<string, unknown>) {
  return typeof payload.conversationId === 'string' && payload.conversationId.trim()
    ? payload.conversationId.trim()
    : typeof payload.conversation_id === 'string' && payload.conversation_id.trim()
      ? payload.conversation_id.trim()
      : '';
}

function resolveToken(client: ChatSocket) {
  const authToken = client.handshake.auth?.token;
  const header = client.handshake.headers.authorization;
  const token =
    typeof authToken === 'string' && authToken.trim()
      ? authToken.trim()
      : typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : '';

  if (!token) {
    throw new UnauthorizedException('Authentication required.');
  }

  return token;
}

function requireContext(client: ChatSocket) {
  const userId = client.data.user?.id;
  const authorization = client.data.authorization;
  const accountId = client.data.accountId;
  if (!userId || !authorization || !accountId) {
    throw new UnauthorizedException('Authentication required.');
  }
  return { userId, authorization, accountId };
}

function toClientError(error: unknown) {
  const candidate = error as { message?: string; status?: number; statusCode?: number };
  return {
    message: candidate.message ?? 'Chat socket error.',
    statusCode: candidate.statusCode ?? candidate.status ?? 500
  };
}

export function registerChatSocket(app: INestApplication) {
  const chatService = app.get(ChatService);
  const io = new Server(app.getHttpServer(), {
    cors: {
      origin: true,
      credentials: true
    }
  });
  const chatNamespace = io.of('/chat');

  chatNamespace.on('connection', async (client: ChatSocket) => {
    try {
      const token = resolveToken(client);
      const authorization = `Bearer ${token}`;
      const supabase = createSupabaseClient('user', { authorization });
      const {
        data: { user },
        error
      } = await supabase.auth.getUser();

      if (error || !user) {
        throw new UnauthorizedException('Authentication required.');
      }

      client.data.user = {
        id: user.id,
        email: user.email
      };
      client.data.authorization = authorization;
      const accountId = typeof client.handshake.auth?.accountId === 'string'
        ? client.handshake.auth.accountId.trim()
        : '';
      const selectedAccount = await requireActiveAccount({ authorization }, accountId);
      client.data.accountId = selectedAccount.account.account_id;
      await client.join(`user:${user.id}`);
      await client.join(frontendCommandUserRoom(client.data.accountId, user.id));
      client.emit('chat:connected', {
        userId: user.id,
        accountId: client.data.accountId,
        socketId: client.id
      });
    } catch (error) {
      client.emit('chat:error', toClientError(error));
      client.disconnect(true);
    }
  });

  chatNamespace.on('connection', (client: ChatSocket) => {
    client.on('chat:joinConversation', async (payload: Record<string, unknown>, ack?: Function) => {
      try {
        const context = requireContext(client);
        const tenantId = context.accountId;
        const conversationId = readConversationId(payload);

        await chatService.requireActiveMember(
          tenantId,
          conversationId,
          context.userId,
          { authorization: context.authorization, accountId: context.accountId }
        );
        await client.join(`conversation:${conversationId}`);
        ack?.({ success: true, conversationId });
      } catch (error) {
        const clientError = toClientError(error);
        client.emit('chat:error', clientError);
        ack?.({ success: false, error: clientError });
      }
    });

    client.on('chat:leaveConversation', async (payload: Record<string, unknown>, ack?: Function) => {
      const conversationId = readConversationId(payload);
      if (conversationId) await client.leave(`conversation:${conversationId}`);
      ack?.({ success: true, conversationId });
    });

    client.on('chat:sendMessage', async (payload: Record<string, unknown>, ack?: Function) => {
      try {
        const context = requireContext(client);
        const message = await chatService.sendMessage(payload, {
          authorization: context.authorization,
          accountId: context.accountId
        });
        const conversationId = String(message.conversationId);
        const tenantId = context.accountId;
        const memberIds = await chatService.listActiveMemberIds(
          tenantId,
          conversationId,
          { authorization: context.authorization, accountId: context.accountId }
        );

        chatNamespace.to(`conversation:${conversationId}`).emit('chat:messageCreated', message);
        for (const memberId of memberIds) {
          chatNamespace.to(`user:${memberId}`).emit('chat:conversationUpdated', {
            conversationId,
            lastMessageId: message.id,
            lastMessageAt: message.createdAt
          });
        }

        ack?.({ success: true, message });
      } catch (error) {
        const clientError = toClientError(error);
        client.emit('chat:error', clientError);
        ack?.({ success: false, error: clientError });
      }
    });

    client.on('chat:typing', async (payload: Record<string, unknown>, ack?: Function) => {
      try {
        const context = requireContext(client);
        const conversationId = readConversationId(payload);
        await chatService.requireActiveMember(
          context.accountId,
          conversationId,
          context.userId,
          { authorization: context.authorization, accountId: context.accountId }
        );
        client.to(`conversation:${conversationId}`).emit('chat:typingUpdated', {
          conversationId,
          userId: context.userId,
          isTyping: payload.isTyping === true,
          updatedAt: new Date().toISOString()
        });
        ack?.({ success: true });
      } catch (error) {
        const clientError = toClientError(error);
        client.emit('chat:error', clientError);
        ack?.({ success: false, error: clientError });
      }
    });

    client.on('chat:markRead', async (payload: Record<string, unknown>, ack?: Function) => {
      try {
        const context = requireContext(client);
        const result = await chatService.markRead(payload, {
          authorization: context.authorization,
          accountId: context.accountId
        });
        chatNamespace.to(`conversation:${result.conversationId}`).emit('chat:readUpdated', result);
        ack?.({ success: true, result });
      } catch (error) {
        const clientError = toClientError(error);
        client.emit('chat:error', clientError);
        ack?.({ success: false, error: clientError });
      }
    });
  });

  registerFrontendCommandSocket(app, chatNamespace);

  return io;
}

