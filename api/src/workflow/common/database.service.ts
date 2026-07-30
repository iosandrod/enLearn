import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getWorkflowEnv } from './env';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool?: Pool;

  constructor() {
    const env = getWorkflowEnv();
    const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
    if (!connectionString) return;

    this.pool = new Pool({
      connectionString,
      max: 10,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 30_000
    });

    this.pool.on('error', (error) => {
      this.logger.warn(`Postgres idle client error: ${error.message}`);
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

    return this.pool.query<T>(text, values);
  }

  async withClient<T>(callback: (client: PoolClient) => Promise<T>) {
    if (!this.pool) {
      throw new Error('DATABASE_URL is required for workflow database operations.');
    }

    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
