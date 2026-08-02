import { UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createSupabaseClient } from '../common/utils/supabase';
import { ChatService } from './chat.service';
import type { ChatSocketUser } from './chat.types';

type ChatSocket = Socket & {
  data: {
    user?: ChatSocketUser;
    authorization?: string;
  };
};

function readTenantId(payload: Record<string, unknown>) {
  return typeof payload.tenantId === 'string' && payload.tenantId.trim()
    ? payload.tenantId.trim()
    : typeof payload.tenant_id === 'string' && payload.tenant_id.trim()
      ? payload.tenant_id.trim()
      : 'default';
}

function readConversationId(payload: Record<string, unknown>) {
  return typeof payload.conversationId === 'string' && payload.conversationId.trim()
    ? payload.conversationId.trim()
    : typeof payload.conversation_id === 'string' && payload.conversation_id.trim()
      ? payload.conversation_id.trim()
      : '';
}

@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: true,
    credentials: true
  }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(client: ChatSocket) {
    try {
      const token = this.resolveToken(client);
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
      await client.join(`user:${user.id}`);
      client.emit('chat:connected', { userId: user.id });
    } catch (error) {
      client.emit('chat:error', this.toClientError(error));
      client.disconnect(true);
    }
  }

  handleDisconnect(client: ChatSocket) {
    const userId = client.data.user?.id;
    if (userId) {
      this.server.emit('chat:userPresenceUpdated', {
        userId,
        online: false,
        updatedAt: new Date().toISOString()
      });
    }
  }

  @SubscribeMessage('chat:joinConversation')
  async joinConversation(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: Record<string, unknown>
  ) {
    try {
      const context = this.requireContext(client);
      const tenantId = readTenantId(payload);
      const conversationId = readConversationId(payload);

      await this.chatService.requireActiveMember(
        tenantId,
        conversationId,
        context.userId,
        { authorization: context.authorization }
      );
      await client.join(`conversation:${conversationId}`);

      return { success: true, conversationId };
    } catch (error) {
      client.emit('chat:error', this.toClientError(error));
      return { success: false, error: this.toClientError(error) };
    }
  }

  @SubscribeMessage('chat:leaveConversation')
  async leaveConversation(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: Record<string, unknown>
  ) {
    const conversationId = readConversationId(payload);
    if (conversationId) await client.leave(`conversation:${conversationId}`);
    return { success: true, conversationId };
  }

  @SubscribeMessage('chat:sendMessage')
  async sendMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: Record<string, unknown>
  ) {
    try {
      const context = this.requireContext(client);
      const message = await this.chatService.sendMessage(payload, {
        authorization: context.authorization
      });
      const conversationId = String(message.conversationId);
      const tenantId = readTenantId(payload);
      const memberIds = await this.chatService.listActiveMemberIds(
        tenantId,
        conversationId,
        { authorization: context.authorization }
      );

      this.server.to(`conversation:${conversationId}`).emit('chat:messageCreated', message);
      for (const memberId of memberIds) {
        this.server.to(`user:${memberId}`).emit('chat:conversationUpdated', {
          conversationId,
          lastMessageId: message.id,
          lastMessageAt: message.createdAt
        });
      }

      return { success: true, message };
    } catch (error) {
      client.emit('chat:error', this.toClientError(error));
      return { success: false, error: this.toClientError(error) };
    }
  }

  @SubscribeMessage('chat:typing')
  async typing(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: Record<string, unknown>
  ) {
    try {
      const context = this.requireContext(client);
      const conversationId = readConversationId(payload);
      const isTyping = payload.isTyping === true;
      client.to(`conversation:${conversationId}`).emit('chat:typingUpdated', {
        conversationId,
        userId: context.userId,
        isTyping,
        updatedAt: new Date().toISOString()
      });
      return { success: true };
    } catch (error) {
      client.emit('chat:error', this.toClientError(error));
      return { success: false, error: this.toClientError(error) };
    }
  }

  @SubscribeMessage('chat:markRead')
  async markRead(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: Record<string, unknown>
  ) {
    try {
      const context = this.requireContext(client);
      const result = await this.chatService.markRead(payload, {
        authorization: context.authorization
      });
      this.server
        .to(`conversation:${result.conversationId}`)
        .emit('chat:readUpdated', result);
      return { success: true, result };
    } catch (error) {
      client.emit('chat:error', this.toClientError(error));
      return { success: false, error: this.toClientError(error) };
    }
  }

  private resolveToken(client: ChatSocket) {
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

  private requireContext(client: ChatSocket) {
    const userId = client.data.user?.id;
    const authorization = client.data.authorization;
    if (!userId || !authorization) {
      throw new UnauthorizedException('Authentication required.');
    }
    return { userId, authorization };
  }

  private toClientError(error: unknown) {
    const candidate = error as { message?: string; status?: number; statusCode?: number };
    return {
      message: candidate.message ?? 'Chat socket error.',
      statusCode: candidate.statusCode ?? candidate.status ?? 500
    };
  }
}

