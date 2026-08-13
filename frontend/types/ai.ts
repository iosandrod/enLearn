export type AiRunMode =
  | 'ask'
  | 'create_page'
  | 'edit_page'
  | 'generate_button'
  | 'generate_function';

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

export type AiRunRequest = {
  sessionId?: string;
  mode: AiRunMode;
  message: string;
  pageRef?: AiPageRef;
  selection?: AiSelection;
  clientContext?: Record<string, unknown>;
  includeSampleData?: boolean;
};

export type AiConversation = {
  id: string;
  title: string;
  mode: AiRunMode;
  pageRef?: AiPageRef;
  createdAt: string;
  updatedAt: string;
};

export type AiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  streaming?: boolean;
  error?: boolean;
};

export type AiToolTrace = {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  arguments?: Record<string, unknown>;
  result?: unknown;
};

export type AiValidationIssue = {
  level: 'error' | 'warning';
  path: string;
  message: string;
};

export type AiProposalDiffItem = {
  id: string;
  category: 'page' | 'block' | 'data_source' | 'button' | 'function' | 'security';
  label: string;
  before?: unknown;
  after?: unknown;
  severity: 'normal' | 'warning';
};

export type AiProposal = {
  id: string;
  kind: 'create_page' | 'edit_page' | 'create_button' | 'create_page_function';
  targetPageId?: string;
  baseVersion?: number;
  summary: string;
  operations: Array<Record<string, unknown>>;
  candidateSchema: Record<string, unknown>;
  validationIssues: AiValidationIssue[];
  diff: AiProposalDiffItem[];
  status: 'draft' | 'validated' | 'awaiting_approval' | 'applied' | 'rejected' | 'expired' | 'conflicted';
  createdAt: string;
  expiresAt: string;
};

export type AiPageContextSnapshot = {
  pageRef?: AiPageRef;
  clientContext: Record<string, unknown>;
  hasSampleData: boolean;
};
