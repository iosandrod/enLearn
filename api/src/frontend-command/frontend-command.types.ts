export const FRONTEND_COMMAND_EVENT = 'frontend:command';
export const FRONTEND_COMMAND_ACK_EVENT = 'frontend:command:ack';
export const FRONTEND_COMMAND_REDIS_CHANNEL = 'enlearn:frontend-command:v1';
export const FRONTEND_COMMAND_RUNTIME_VERSION = 1 as const;

export type FrontendCommandTarget =
  | { accountId: string; userId: string; socketId?: never }
  | { accountId: string; socketId: string; userId?: never };

export type FrontendMessageCommand = {
  id: string;
  runtimeVersion: typeof FRONTEND_COMMAND_RUNTIME_VERSION;
  code: 'message.show';
  params: {
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
    duration?: number;
  };
  target: FrontendCommandTarget;
  issuedAt: string;
  expiresAt?: string;
  source?: {
    taskId?: string;
    runId?: string;
  };
};

export type FrontendCommand = FrontendMessageCommand;

export type FrontendCommandDelivery = {
  commandId: string;
  target: FrontendCommandTarget;
  matchedSockets: number;
  deliveredAt: string;
};

export type FrontendCommandAck = {
  commandId: string;
  status: 'executed' | 'ignored' | 'failed';
  message?: string;
  executedAt: string;
};

export function isFrontendCommandAck(value: unknown): value is FrontendCommandAck {
  if (!isRecord(value)) return false;
  return (
    Boolean(readString(value.commandId)) &&
    ['executed', 'ignored', 'failed'].includes(readString(value.status)) &&
    Boolean(readString(value.executedAt))
  );
}

export function isFrontendCommand(value: unknown): value is FrontendCommand {
  if (!isRecord(value) || value.runtimeVersion !== FRONTEND_COMMAND_RUNTIME_VERSION) return false;
  if (!readString(value.id) || value.code !== 'message.show') return false;
  if (!isRecord(value.target) || !hasSingleTarget(value.target)) return false;
  if (!isRecord(value.params)) return false;
  if (!['success', 'info', 'warning', 'error'].includes(readString(value.params.type))) return false;
  return Boolean(readString(value.params.message) && readString(value.issuedAt));
}

function hasSingleTarget(value: Record<string, unknown>) {
  const accountId = readString(value.accountId);
  const userId = readString(value.userId);
  const socketId = readString(value.socketId);
  return Boolean(accountId) && Boolean(userId) !== Boolean(socketId);
}

export function frontendCommandUserRoom(accountId: string, userId: string) {
  return `account:${accountId}:user:${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
