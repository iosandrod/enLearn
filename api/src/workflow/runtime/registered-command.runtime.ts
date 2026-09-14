import vm from 'node:vm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

export type RegisteredCommandInput = {
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  service: object;
  command: {
    id: string;
    serviceName: string;
    commandCode: string;
    version: number;
  };
  variables?: Record<string, unknown>;
  previousOutput?: unknown;
};

export type RegisteredCommandHandler = (input: RegisteredCommandInput) => unknown | Promise<unknown>;

export type RegisteredCommandRuntimeOptions = {
  /** Prefix used when forwarding logs from the isolated function sandbox. */
  logPrefix?: string;
};

/** Parse a database-stored function without exposing Node's module globals. */
export function parseRegisteredCommandFunction(
  source: string,
  options: RegisteredCommandRuntimeOptions = {}
): RegisteredCommandHandler {
  validateRegisteredCommandSource(source);
  let value: unknown;
  try {
    const prefix = options.logPrefix?.trim() || 'workflow-registered-command';
    const forward = (level: 'log' | 'info' | 'warn' | 'error') => (...args: unknown[]) => {
      // The VM context has its own console implementation. Forwarding explicitly
      // keeps database-defined command logs visible in the API/worker thread.
      console[level](`[${prefix}]`, ...args);
    };
    const sandbox = {
      console: {
        log: forward('log'),
        info: forward('info'),
        warn: forward('warn'),
        error: forward('error')
      }
    } as Record<string, unknown>;
    value = new vm.Script(`(${source.trim().replace(/;\s*$/, '')})`, {
      filename: 'workflow-registered-command.js'
    }).runInNewContext(sandbox, {
      timeout: 1000,
      displayErrors: true,
      contextCodeGeneration: { strings: false, wasm: false }
    });
  } catch (error) {
    throw new BadRequestException(`Registered workflow command function cannot be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== 'function') {
    throw new BadRequestException('Registered workflow command must evaluate to a function.');
  }
  return value as RegisteredCommandHandler;
}

export function validateRegisteredCommandSource(source: string) {
  const normalized = source.trim();
  if (!normalized) throw new BadRequestException('Registered workflow command function is empty.');
  if (normalized.length > 50_000) throw new BadRequestException('Registered workflow command function is too large.');
  if (/\b(?:import|export|require|process|globalThis|eval|Function|constructor)\b/.test(normalized)) {
    throw new ForbiddenException('Registered workflow command contains a forbidden runtime construct.');
  }
}
