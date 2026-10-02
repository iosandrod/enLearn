import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createSupabaseClient } from '../common/utils/supabase';
import { getEnv } from '../common/utils/env';
import type { PrintContext, PrintArtifact, PrintJobInput, PrintJobRecord, PrintJobStatus } from './print.types';

type JobPatch = Partial<Pick<PrintJobRecord, 'status' | 'progress' | 'artifacts' | 'error' | 'cancelRequested' | 'startedAt' | 'finishedAt'>>;

function hasDatabaseConfig() {
  const env = getEnv();
  return Boolean(
    env.PRINT_JOB_PERSISTENCE === 'database' ||
    (env.PRINT_JOB_PERSISTENCE !== 'memory' && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

function nowIso() {
  return new Date().toISOString();
}

function artifactRowToRecord(row: Record<string, unknown>): PrintArtifact {
  return {
    artifactId: String(row.id),
    format: String(row.format) as PrintArtifact['format'],
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    recordCount: Number(row.record_count ?? 0),
    downloadUrl: '',
    expiresAt: String(row.expires_at),
    contentDisposition: 'attachment',
    storageKey: String(row.object_key),
    sha256: String(row.sha256 ?? '')
  };
}

function rowToRecord(
  row: Record<string, unknown>,
  artifactRows: Array<Record<string, unknown>> = []
): PrintJobRecord {
  const input = row.input_json as PrintJobInput;
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    ownerId: String(row.owner_id),
    kind: row.kind === 'preview' ? 'preview' : 'export',
    status: String(row.status) as PrintJobStatus,
    input,
    progress: {
      total: Number(row.total_count ?? input.data.records.length),
      completed: Number(row.completed_count ?? 0),
      failed: Number(row.failed_count ?? 0),
      percent: Number(row.total_count)
        ? Math.round((Number(row.completed_count ?? 0) / Number(row.total_count)) * 100)
        : 0
    },
    artifacts: artifactRows.map(artifactRowToRecord),
    error: row.error_code
      ? { code: String(row.error_code), message: String(row.error_message ?? '') }
      : null,
    cancelRequested: row.cancel_requested === true,
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    expiresAt: String(row.expires_at)
  };
}

@Injectable()
export class PrintJobRepository {
  private readonly memory = new Map<string, PrintJobRecord>();

  async create(
    kind: 'preview' | 'export',
    input: PrintJobInput,
    context: PrintContext,
    expiresAt: string
  ) {
    const id = randomUUID();
    const createdAt = nowIso();
    const record: PrintJobRecord = {
      id,
      accountId: context.accountId,
      ownerId: context.userId,
      kind,
      status: 'queued',
      input,
      progress: {
        total: input.data.records.length,
        completed: 0,
        failed: 0,
        percent: 0
      },
      artifacts: [],
      error: null,
      cancelRequested: false,
      createdAt,
      startedAt: null,
      finishedAt: null,
      expiresAt
    };
    this.memory.set(id, record);
    if (hasDatabaseConfig()) {
      const { error } = await createSupabaseClient('admin').from('print_jobs').insert({
        id,
        account_id: context.accountId,
        owner_id: context.userId,
        kind,
        status: 'queued',
        template_id: input.template.templateId ?? 'snapshot',
        template_version: input.template.version ?? 1,
        input_json: input,
        input_sha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        total_count: input.data.records.length,
        expires_at: expiresAt
      });
      if (error) throw new Error('Could not persist print job: ' + error.message);
    }
    return record;
  }

  async get(id: string, context: PrintContext) {
    const cached = this.memory.get(id);
    if (cached) {
      if (cached.accountId !== context.accountId || cached.ownerId !== context.userId) return undefined;
      return cached;
    }
    if (!hasDatabaseConfig()) return undefined;
    const client = createSupabaseClient('admin');
    const { data, error } = await client
      .from('print_jobs')
      .select('*')
      .eq('id', id)
      .eq('account_id', context.accountId)
      .eq('owner_id', context.userId)
      .maybeSingle();
    if (error || !data) return undefined;
    const { data: artifacts, error: artifactsError } = await client
      .from('print_artifacts')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true });
    if (artifactsError) throw new Error('Could not load print artifacts: ' + artifactsError.message);
    const record = rowToRecord(
      data as Record<string, unknown>,
      (artifacts ?? []) as Array<Record<string, unknown>>
    );
    this.memory.set(record.id, record);
    return record;
  }

  async update(id: string, context: PrintContext, patch: JobPatch) {
    const record = await this.get(id, context);
    if (!record) return undefined;
    Object.assign(record, patch);
    this.memory.set(id, record);
    if (hasDatabaseConfig()) {
      const dbPatch: Record<string, unknown> = {};
      if (patch.status) dbPatch.status = patch.status;
      if (patch.progress) {
        dbPatch.total_count = patch.progress.total;
        dbPatch.completed_count = patch.progress.completed;
        dbPatch.failed_count = patch.progress.failed;
      }
      if (patch.error !== undefined) {
        dbPatch.error_code = patch.error?.code ?? null;
        dbPatch.error_message = patch.error?.message ?? null;
      }
      if (patch.cancelRequested !== undefined) dbPatch.cancel_requested = patch.cancelRequested;
      if (patch.startedAt !== undefined) dbPatch.started_at = patch.startedAt;
      if (patch.finishedAt !== undefined) dbPatch.finished_at = patch.finishedAt;
      if (Object.keys(dbPatch).length) {
        const { error } = await createSupabaseClient('admin')
          .from('print_jobs')
          .update(dbPatch)
          .eq('id', id)
          .eq('account_id', context.accountId);
        if (error) throw new Error('Could not update print job: ' + error.message);
      }
    }
    return record;
  }

  async addArtifact(id: string, context: PrintContext, artifact: PrintArtifact) {
    const record = await this.get(id, context);
    if (!record) return undefined;
    record.artifacts.push(artifact);
    this.memory.set(id, record);
    if (hasDatabaseConfig()) {
      const { error } = await createSupabaseClient('admin').from('print_artifacts').insert({
        id: artifact.artifactId,
        job_id: id,
        account_id: context.accountId,
        object_key: artifact.storageKey ?? artifact.artifactId,
        format: artifact.format,
        mime_type: artifact.mimeType,
        size_bytes: artifact.sizeBytes,
        sha256: artifact.sha256 ?? '',
        record_count: artifact.recordCount,
        expires_at: artifact.expiresAt
      });
      if (error) throw new Error('Could not persist print artifact: ' + error.message);
    }
    return record;
  }

  async requestCancel(id: string, context: PrintContext) {
    return this.update(id, context, { cancelRequested: true });
  }
}
