import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import type { WorkflowJobRecord } from './job.types';

export const SUPABASE_USERS_LOG_TASK_ID = 'workflow.supabase.users.log';

@Injectable()
export class JobLocalExecutorService {
  private readonly logger = new Logger(JobLocalExecutorService.name);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  canHandle(taskId: string) {
    return taskId === SUPABASE_USERS_LOG_TASK_ID;
  }

  async execute(input: {
    job: WorkflowJobRecord;
    runId: string;
    payload: Record<string, unknown>;
  }) {
    if (input.job.triggerTaskId !== SUPABASE_USERS_LOG_TASK_ID) {
      throw new Error(`Unsupported local workflow job task: ${input.job.triggerTaskId}`);
    }

    return this.logSupabaseUsers(input);
  }

  private async logSupabaseUsers(input: {
    job: WorkflowJobRecord;
    runId: string;
    payload: Record<string, unknown>;
  }) {
    const limit = readPositiveInteger(input.payload.limit, 20);
    const result = await this.database.query('select * from public.users limit $1', [limit]);
    const users = result.rows.map(sanitizeUserRow);
    const output = {
      handledBy: SUPABASE_USERS_LOG_TASK_ID,
      jobCode: input.job.code,
      runId: input.runId,
      userCount: users.length,
      users,
      loggedAt: new Date().toISOString()
    };

    this.logger.log(
      `Supabase users log job "${input.job.code}" fetched ${users.length} rows. runId=${input.runId}`
    );
    console.log('[workflow-api][supabase-users-log]', JSON.stringify(output, null, 2));

    return output;
  }
}

function readPositiveInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function sanitizeUserRow(row: Record<string, unknown>) {
  const blockedKeys = new Set([
    'billing_address',
    'payment_method',
    'stripe_customer_id',
    'encrypted_password',
    'confirmation_token',
    'recovery_token'
  ]);

  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !blockedKeys.has(key))
      .map(([key, value]) => [key, key === 'phone' ? maskPhone(value) : value])
  );
}

function maskPhone(value: unknown) {
  if (typeof value !== 'string' || value.length < 7) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}
