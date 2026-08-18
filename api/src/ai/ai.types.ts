import type { ActiveAccountContext } from '../common/utils/account-context';

export const AI_RUN_MODES = [
  'ask',
  'create_page',
  'edit_page',
  'generate_button',
  'generate_function'
] as const;

export type AiRunMode = (typeof AI_RUN_MODES)[number];

export const AI_PROPOSAL_KINDS = [
  'create_page',
  'edit_page',
  'create_button',
  'create_page_function'
] as const;

export type AiProposalKind = (typeof AI_PROPOSAL_KINDS)[number];
export type AiProposalStatus =
  | 'draft'
  | 'validated'
  | 'awaiting_approval'
  | 'applied'
  | 'rejected'
  | 'expired'
  | 'conflicted';

export type AiPageRef = {
  id?: string;
  code?: string;
  route?: string;
  version?: number;
};

export type AiSelection = {
  blockId?: string;
  actionCode?: string;
  functionName?: string;
};

export type AiClientContext = {
  route?: Record<string, unknown>;
  page?: Record<string, unknown>;
  selection?: AiSelection;
  sampleData?: unknown;
};

export type AiStartRunInput = {
  requestId: string;
  sessionId?: string;
  mode: AiRunMode;
  message: string;
  pageRef?: AiPageRef;
  selection?: AiSelection;
  clientContext?: AiClientContext;
  includeSampleData?: boolean;
};

export type AiPrincipal = {
  context: ActiveAccountContext;
  permissionCodes: string[];
  isLegacyAdmin: boolean;
};

export type AiStreamEventType =
  | 'run.created'
  | 'message.accepted'
  | 'assistant.status'
  | 'assistant.delta'
  | 'tool.call'
  | 'tool.result'
  | 'proposal.created'
  | 'validation.result'
  | 'approval.required'
  | 'usage'
  | 'done'
  | 'error';

export type AiStreamEvent = {
  eventId: string;
  requestId: string;
  sessionId: string;
  runId: string;
  sequence: number;
  timestamp: string;
  type: AiStreamEventType;
  payload: Record<string, unknown>;
};

export type AiConversation = {
  id: string;
  accountId: string;
  createdBy: string;
  title: string;
  mode: AiRunMode;
  pageRef?: AiPageRef;
  createdAt: string;
  updatedAt: string;
};

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type AiMessage = {
  id: string;
  conversationId: string;
  accountId: string;
  role: AiMessageRole;
  content: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AiProviderMessage = {
  role: AiMessageRole;
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: AiProviderToolCall[];
};

export type AiProviderToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AiProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AiProviderRequest = {
  mode: AiRunMode;
  messages: AiProviderMessage[];
  tools: AiToolDefinition[];
  signal: AbortSignal;
  onDelta: (delta: string) => void;
};

export type AiProviderTurn = {
  content: string;
  toolCalls: AiProviderToolCall[];
  usage?: AiProviderUsage;
};

export type AiProposalOperation =
  | {
      type: 'addBlock';
      block: Record<string, unknown>;
      parentBlockId?: string;
      tabKey?: string;
      position?: 'start' | 'end' | 'before' | 'after';
      anchorBlockId?: string;
    }
  | {
      type: 'updateBlock';
      blockId: string;
      changes: Record<string, unknown>;
    }
  | { type: 'removeBlock'; blockId: string }
  | {
      type: 'upsertDataSource';
      key: string;
      dataSource: Record<string, unknown>;
    }
  | {
      type: 'updateGridColumn';
      blockId: string;
      field: string;
      changes: Record<string, unknown>;
    }
  | {
      type: 'upsertGridColumn';
      blockId: string;
      column: Record<string, unknown>;
      afterField?: string;
    }
  | {
      type: 'upsertButtonAction';
      blockId?: string;
      action: Record<string, unknown>;
    }
  | {
      type: 'upsertPageFunction';
      pageFunction: Record<string, unknown>;
      builtinFunction?: string;
    }
  | {
      type: 'bindButtonToPageFunction';
      blockId: string;
      actionCode: string;
      functionName: string;
    }
  | {
      type: 'updateScriptPolicy';
      capabilities?: string[];
      apiNames?: string[];
    }
  | {
      type: 'updatePageInfo';
      title?: string;
      description?: string;
    };

export type AiProposalDiffItem = {
  id: string;
  category: 'page' | 'block' | 'data_source' | 'button' | 'function' | 'security';
  label: string;
  before?: unknown;
  after?: unknown;
  severity: 'normal' | 'warning';
};

export type AiValidationIssue = {
  level: 'error' | 'warning';
  path: string;
  message: string;
};

export type AiProposal = {
  id: string;
  accountId: string;
  createdBy: string;
  conversationId: string;
  runId: string;
  kind: AiProposalKind;
  targetPageId?: string;
  baseVersion?: number;
  baseSchemaHash?: string;
  baseSchema?: Record<string, unknown>;
  summary: string;
  operations: AiProposalOperation[];
  candidateSchema: Record<string, unknown>;
  validationIssues: AiValidationIssue[];
  diff: AiProposalDiffItem[];
  status: AiProposalStatus;
  createdAt: string;
  expiresAt: string;
  appliedAt?: string;
};

export type AiToolContext = {
  principal: AiPrincipal;
  runId: string;
  conversationId: string;
  mode: AiRunMode;
  pageRef?: AiPageRef;
  pageContext: Record<string, unknown>;
  selection?: AiSelection;
};
