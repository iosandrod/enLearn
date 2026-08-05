import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { type Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getWorkflowEnv } from './env';
import { retryTransientPostgresOperation } from './postgres-resilience';
import {
  createWorkflowPostgresPool,
  resolveWorkflowDatabaseUrl,
  withHealthyPostgresClient
} from './postgres-pool';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool?: Pool;

  constructor() {
    const env = getWorkflowEnv();
    const connectionString = resolveWorkflowDatabaseUrl(env);
    if (!connectionString) return;

    this.pool = createWorkflowPostgresPool(connectionString, {
      max: 5,
      name: 'workflow-domain',
      onIdleClientError: (message) => this.logger.warn(message)
    });
  }

  get isConfigured() {
    return Boolean(this.pool);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('DATABASE_URL is required for workflow database operations.');
    }

    return retryTransientPostgresOperation(() => this.pool!.query<T>(text, values));
  }

  async withClient<T>(callback: (client: PoolClient) => Promise<T>) {
    if (!this.pool) {
      throw new Error('DATABASE_URL is required for workflow database operations.');
    }

    return withHealthyPostgresClient(this.pool, callback);
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
