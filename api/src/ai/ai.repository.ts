import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getEnv } from '../common/utils/env';
import { createSupabaseClient } from '../common/utils/supabase';
import type {
  AiConversation,
  AiMessage,
  AiMessageRole,
  AiPrincipal,
  AiProposal,
  AiRunMode
} from './ai.types';
import { proposalContentHash } from './proposals/proposal-content-hash';

function isMissingAiSchema(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205' ||
    Boolean(error?.message?.includes('ai_') && error.message.includes('does not exist'));
}

function resolveAiPersistenceMode(value: unknown): 'database' | 'memory' {
  const mode = String(value ?? '').trim().toLowerCase();
  if (!mode || mode === 'database') return 'database';
  if (mode === 'memory') return 'memory';
  throw new Error(`Unsupported AI_PERSISTENCE_MODE: ${mode}`);
}

function assertAiSchemaAvailable(error: { code?: string; message?: string } | null | undefined) {
  if (!isMissingAiSchema(error)) return false;
  throw new ServiceUnavailableException(
    'AI persistence schema is not installed. Apply the AI assistant migration or explicitly use AI_PERSISTENCE_MODE=memory for a local demo.'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class AiRepository {
  private readonly persistenceMode = resolveAiPersistenceMode(getEnv().AI_PERSISTENCE_MODE);
  private readonly databaseAvailable = this.persistenceMode === 'database';
  private readonly conversations = new Map<string, AiConversation>();
  private readonly messages = new Map<string, AiMessage[]>();
  private readonly proposals = new Map<string, AiProposal>();

  private fallback(error: { code?: string; message?: string } | null | undefined) {
    return assertAiSchemaAvailable(error);
  }

  async ensureConversation(options: {
    principal: AiPrincipal;
    sessionId?: string;
    conversationId?: string;
    mode: AiRunMode;
    title: string;
    pageRef?: Record<string, unknown>;
  }): Promise<AiConversation> {
    if (options.sessionId) {
      const existing = await this.getConversation(options.principal, options.sessionId);
      if (existing) return existing;
      throw new NotFoundException('AI conversation was not found.');
    }
    const now = new Date().toISOString();
    const conversation: AiConversation = {
      id: options.conversationId ?? randomUUID(),
      accountId: options.principal.context.accountId,
      createdBy: options.principal.context.userId,
      title: options.title.slice(0, 120),
      mode: options.mode,
      pageRef: options.pageRef,
      createdAt: now,
      updatedAt: now
    };
    if (this.databaseAvailable) {
      const client = createSupabaseClient('admin', options.principal.context);
      const { error } = await client.from('ai_conversations').insert({
        id: conversation.id,
        account_id: conversation.accountId,
        created_by: conversation.createdBy,
        title: conversation.title,
        mode: conversation.mode,
        page_ref: conversation.pageRef ?? {},
        status: 'active'
      });
      if (error && !this.fallback(error)) throw new BadRequestException(error.message);
    }
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return conversation;
  }

  async getConversation(principal: AiPrincipal, id: string) {
    const memory = this.conversations.get(id);
    if (memory && memory.accountId === principal.context.accountId && memory.createdBy === principal.context.userId) {
      return memory;
    }
    if (!this.databaseAvailable) return undefined;
    const client = createSupabaseClient('admin', principal.context);
    const { data, error } = await client
      .from('ai_conversations')
      .select('*')
      .eq('id', id)
      .eq('account_id', principal.context.accountId)
      .eq('created_by', principal.context.userId)
      .maybeSingle();
    if (error) {
      if (this.fallback(error)) return undefined;
      throw new BadRequestException(error.message);
    }
    if (!data) return undefined;
    return this.mapConversation(data as Record<string, unknown>);
  }

  async listConversations(principal: AiPrincipal) {
    if (this.databaseAvailable) {
      const client = createSupabaseClient('admin', principal.context);
      const { data, error } = await client
        .from('ai_conversations')
        .select('*')
        .eq('account_id', principal.context.accountId)
        .eq('created_by', principal.context.userId)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (!error) return (data ?? []).map((row) => this.mapConversation(row as Record<string, unknown>));
      if (!this.fallback(error)) throw new BadRequestException(error.message);
    }
    return [...this.conversations.values()]
      .filter((item) => item.accountId === principal.context.accountId && item.createdBy === principal.context.userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async appendMessage(options: {
    principal: AiPrincipal;
    conversationId: string;
    role: AiMessageRole;
    content: string;
    toolCallId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const message: AiMessage = {
      id: randomUUID(),
      conversationId: options.conversationId,
      accountId: options.principal.context.accountId,
      role: options.role,
      content: options.content,
      toolCallId: options.toolCallId,
      metadata: options.metadata,
      createdAt: new Date().toISOString()
    };
    const rows = this.messages.get(options.conversationId) ?? [];
    rows.push(message);
    this.messages.set(options.conversationId, rows.slice(-100));

    if (this.databaseAvailable) {
      const client = createSupabaseClient('admin', options.principal.context);
      const { error } = await client.from('ai_messages').insert({
        id: message.id,
        account_id: message.accountId,
        conversation_id: message.conversationId,
        role: message.role,
        content: message.content,
        tool_call_id: message.toolCallId ?? null,
        metadata: message.metadata ?? {}
      });
      if (error && !this.fallback(error)) throw new BadRequestException(error.message);
      await client.from('ai_conversations').update({ updated_at: message.createdAt })
        .eq('id', options.conversationId).eq('account_id', message.accountId);
    }
    return message;
  }

  async createRun(options: {
    principal: AiPrincipal;
    runId: string;
    conversationId: string;
    requestId: string;
    mode: AiRunMode;
    provider: string;
  }) {
    if (!this.databaseAvailable) return;
    const client = createSupabaseClient('admin', options.principal.context);
    const { error } = await client.from('ai_runs').insert({
      id: options.runId,
      account_id: options.principal.context.accountId,
      conversation_id: options.conversationId,
      created_by: options.principal.context.userId,
      request_id: options.requestId,
      mode: options.mode,
      provider: options.provider,
      status: 'running'
    });
    if (error && !this.fallback(error)) throw new BadRequestException(error.message);
  }

  async finishRun(options: {
    principal: AiPrincipal;
    runId: string;
    status: 'completed' | 'failed' | 'cancelled';
    errorCode?: string;
    errorMessage?: string;
  }) {
    if (!this.databaseAvailable) return;
    const client = createSupabaseClient('admin', options.principal.context);
    const { error } = await client.from('ai_runs').update({
      status: options.status,
      error_code: options.errorCode ?? null,
      error_message: options.errorMessage?.slice(0, 1000) ?? null,
      completed_at: new Date().toISOString()
    }).eq('id', options.runId).eq('account_id', options.principal.context.accountId);
    if (error && !this.fallback(error)) throw new BadRequestException(error.message);
  }

  async recordToolCall(options: {
    principal: AiPrincipal;
    runId: string;
    toolCallId: string;
    toolName: string;
    arguments?: Record<string, unknown>;
    resultSummary?: unknown;
    status: 'started' | 'completed' | 'failed';
  }) {
    if (!this.databaseAvailable) return;
    const client = createSupabaseClient('admin', options.principal.context);
    const row = {
      account_id: options.principal.context.accountId,
      run_id: options.runId,
      tool_call_id: options.toolCallId,
      tool_name: options.toolName,
      arguments: options.arguments ?? {},
      result_summary: options.resultSummary ?? null,
      status: options.status,
      completed_at: options.status === 'started' ? null : new Date().toISOString()
    };
    const { error } = await client.from('ai_tool_calls').upsert(row, {
      onConflict: 'run_id,tool_call_id'
    });
    if (error && !this.fallback(error)) throw new BadRequestException(error.message);
  }

  async listMessages(principal: AiPrincipal, conversationId: string) {
    const conversation = await this.getConversation(principal, conversationId);
    if (!conversation) throw new NotFoundException('AI conversation was not found.');
    if (this.databaseAvailable) {
      const client = createSupabaseClient('admin', principal.context);
      const { data, error } = await client
        .from('ai_messages')
        .select('*')
        .eq('account_id', principal.context.accountId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (!error) return (data ?? []).map((row) => this.mapMessage(row as Record<string, unknown>));
      if (!this.fallback(error)) throw new BadRequestException(error.message);
    }
    return this.messages.get(conversationId) ?? [];
  }

  async saveProposal(principal: AiPrincipal, proposal: AiProposal) {
    this.proposals.set(proposal.id, proposal);
    if (this.databaseAvailable) {
      const client = createSupabaseClient('admin', principal.context);
      const { error } = await client.from('ai_proposals').insert({
        id: proposal.id,
        account_id: proposal.accountId,
        created_by: proposal.createdBy,
        conversation_id: proposal.conversationId,
        run_id: proposal.runId,
        kind: proposal.kind,
        target_page_id: proposal.targetPageId ?? null,
        base_version: proposal.baseVersion ?? null,
        base_schema_hash: proposal.baseSchemaHash ?? null,
        base_schema: proposal.baseSchema ?? null,
        summary: proposal.summary,
        operations: proposal.operations,
        candidate_schema: proposal.candidateSchema,
        validation_issues: proposal.validationIssues,
        content_hash: proposalContentHash(proposal),
        diff: proposal.diff,
        status: proposal.status,
        expires_at: proposal.expiresAt
      });
      if (error && !this.fallback(error)) throw new BadRequestException(error.message);
    }
    return proposal;
  }

  async getProposal(principal: AiPrincipal, id: string) {
    const memory = this.proposals.get(id);
    if (
      memory &&
      memory.accountId === principal.context.accountId &&
      memory.createdBy === principal.context.userId
    ) return memory;
    if (this.databaseAvailable) {
      const client = createSupabaseClient('admin', principal.context);
      const { data, error } = await client.from('ai_proposals').select('*')
        .eq('id', id)
        .eq('account_id', principal.context.accountId)
        .eq('created_by', principal.context.userId)
        .maybeSingle();
      if (!error && data) return this.mapProposal(data as Record<string, unknown>);
      if (error && !this.fallback(error)) throw new BadRequestException(error.message);
    }
    throw new NotFoundException('AI proposal was not found.');
  }

  async updateProposalStatus(principal: AiPrincipal, proposal: AiProposal, status: AiProposal['status']) {
    const updated = this.rememberProposalStatus(proposal, status);
    if (this.databaseAvailable) {
      const client = createSupabaseClient('admin', principal.context);
      const { error } = await client.from('ai_proposals').update({
        status,
        applied_at: updated.appliedAt ?? null
      }).eq('id', updated.id).eq('account_id', updated.accountId);
      if (error && !this.fallback(error)) throw new BadRequestException(error.message);
      if (status === 'rejected') {
        const { error: auditError } = await client.from('ai_audit_events').insert({
          account_id: proposal.accountId,
          user_id: principal.context.userId,
          proposal_id: proposal.id,
          event_type: 'proposal.rejected',
          payload: { kind: proposal.kind, targetPageId: proposal.targetPageId ?? null }
        });
        if (auditError && !this.fallback(auditError)) {
          throw new BadRequestException(auditError.message);
        }
      }
    }
    return updated;
  }

  hasDatabasePersistence() {
    return this.databaseAvailable;
  }

  databasePersistenceRequired() {
    return this.persistenceMode === 'database';
  }

  rememberProposalStatus(proposal: AiProposal, status: AiProposal['status']) {
    const updated = {
      ...proposal,
      status,
      ...(status === 'applied' ? { appliedAt: new Date().toISOString() } : {})
    };
    this.proposals.set(updated.id, updated);
    return updated;
  }

  private mapConversation(row: Record<string, unknown>): AiConversation {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      createdBy: String(row.created_by),
      title: String(row.title ?? '新对话'),
      mode: String(row.mode ?? 'ask') as AiRunMode,
      pageRef: isRecord(row.page_ref) ? row.page_ref : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapMessage(row: Record<string, unknown>): AiMessage {
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      accountId: String(row.account_id),
      role: String(row.role) as AiMessageRole,
      content: String(row.content ?? ''),
      toolCallId: typeof row.tool_call_id === 'string' ? row.tool_call_id : undefined,
      metadata: isRecord(row.metadata) ? row.metadata : undefined,
      createdAt: String(row.created_at)
    };
  }

  private mapProposal(row: Record<string, unknown>): AiProposal {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      createdBy: String(row.created_by),
      conversationId: String(row.conversation_id),
      runId: String(row.run_id),
      kind: String(row.kind) as AiProposal['kind'],
      targetPageId: typeof row.target_page_id === 'string' ? row.target_page_id : undefined,
      baseVersion: typeof row.base_version === 'number' ? row.base_version : undefined,
      baseSchemaHash: typeof row.base_schema_hash === 'string' ? row.base_schema_hash : undefined,
      baseSchema: isRecord(row.base_schema) ? row.base_schema : undefined,
      summary: String(row.summary ?? ''),
      operations: Array.isArray(row.operations) ? row.operations as AiProposal['operations'] : [],
      candidateSchema: isRecord(row.candidate_schema) ? row.candidate_schema : {},
      validationIssues: Array.isArray(row.validation_issues) ? row.validation_issues as AiProposal['validationIssues'] : [],
      diff: Array.isArray(row.diff) ? row.diff as AiProposal['diff'] : [],
      status: String(row.status) as AiProposal['status'],
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      appliedAt: typeof row.applied_at === 'string' ? row.applied_at : undefined
    };
  }

}

export const aiRepositoryInternals = {
  isMissingAiSchema,
  resolveAiPersistenceMode,
  assertAiSchemaAvailable
};
