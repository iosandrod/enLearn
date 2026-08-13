export const FRONTEND_COMMAND_EVENT = 'frontend:command';
export const FRONTEND_COMMAND_ACK_EVENT = 'frontend:command:ack';
export const FRONTEND_COMMAND_RUNTIME_VERSION = 1 as const;

export type FrontendCommand = {
  id: string;
  runtimeVersion: typeof FRONTEND_COMMAND_RUNTIME_VERSION;
  code: 'message.show';
  params: {
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
    duration?: number;
  };
  target: {
    accountId: string;
    userId?: string;
    socketId?: string;
  };
  issuedAt: string;
  expiresAt?: string;
};

export type FrontendCommandAck = {
  commandId: string;
  status: 'executed' | 'ignored' | 'failed';
  message?: string;
  executedAt: string;
};

export type FrontendMessagePresenter = (
  options: FrontendCommand['params']
) => void | Promise<unknown>;

const MAX_REMEMBERED_COMMANDS = 500;

export function createFrontendCommandRuntime(options: {
  accountId: () => string;
  showMessage: FrontendMessagePresenter;
  now?: () => Date;
}) {
  const seen = new Set<string>();
  const order: string[] = [];
  const now = options.now ?? (() => new Date());

  async function execute(value: unknown): Promise<FrontendCommandAck> {
    const executedAt = now().toISOString();
    if (!isFrontendCommand(value)) {
      return {
        commandId: readCommandId(value),
        status: 'ignored',
        message: 'Invalid frontend command payload.',
        executedAt
      };
    }
    if (value.target.accountId !== options.accountId()) {
      return {
        commandId: value.id,
        status: 'ignored',
        message: 'Command belongs to another account.',
        executedAt
      };
    }
    if (seen.has(value.id)) {
      return {
        commandId: value.id,
        status: 'ignored',
        message: 'Command was already executed.',
        executedAt
      };
    }
    if (value.expiresAt && Date.parse(value.expiresAt) <= now().getTime()) {
      return {
        commandId: value.id,
        status: 'ignored',
        message: 'Command has expired.',
        executedAt
      };
    }

    remember(value.id);
    try {
      await options.showMessage(value.params);
      return { commandId: value.id, status: 'executed', executedAt };
    } catch (error) {
      return {
        commandId: value.id,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        executedAt
      };
    }
  }

  function clear() {
    seen.clear();
    order.splice(0, order.length);
  }

  function remember(commandId: string) {
    seen.add(commandId);
    order.push(commandId);
    while (order.length > MAX_REMEMBERED_COMMANDS) {
      const oldest = order.shift();
      if (oldest) seen.delete(oldest);
    }
  }

  return { execute, clear };
}

export function isFrontendCommand(value: unknown): value is FrontendCommand {
  if (!isRecord(value) || value.runtimeVersion !== FRONTEND_COMMAND_RUNTIME_VERSION) return false;
  if (!readString(value.id) || value.code !== 'message.show') return false;
  if (!isRecord(value.target) || !readString(value.target.accountId)) return false;
  const userId = readString(value.target.userId);
  const socketId = readString(value.target.socketId);
  if (Boolean(userId) === Boolean(socketId)) return false;
  if (!isRecord(value.params)) return false;
  if (!['success', 'info', 'warning', 'error'].includes(readString(value.params.type))) return false;
  if (!readString(value.params.message) || !readString(value.issuedAt)) return false;
  return value.params.duration === undefined || (
    typeof value.params.duration === 'number' &&
    Number.isFinite(value.params.duration) &&
    value.params.duration >= 0
  );
}

function readCommandId(value: unknown) {
  return isRecord(value) ? readString(value.id) : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
