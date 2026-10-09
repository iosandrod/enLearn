import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import { getEnv } from '../common/utils/env';
import { createSupabaseClient } from '../common/utils/supabase';
import { PrintArtifactStorage } from './print-artifact.storage';
import { PrintDataSourceRuntime } from './print-data-source.runtime';
import { printBadRequest, printNotFound } from './print-errors';
import { PrintJobRepository } from './print-job.repository';
import { PrintRenderPool } from './print-render.pool';
import { compilePrintTemplate } from './print-template.compiler';
import type {
  PrintArtifact,
  PrintContext,
  PrintDataInput,
  PrintJobInput,
  PrintJobRecord,
  PrintOutput,
  PrintTemplate,
  PrintTemplateSnapshot,
  RenderedFile
} from './print.types';
import { createZip } from './print-zip';

const MAX_RECORDS = 5000;
const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_INLINE_DATA_BYTES = 5 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireContext(context: ServiceContext): PrintContext {
  if (!context.accountId || !context.userId) {
    printBadRequest('PRINT_JOB_FORBIDDEN', 'An authenticated account context is required.');
  }
  return context as PrintContext;
}

function readNumber(value: unknown, field: string, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    printBadRequest(
      'PRINT_INPUT_INVALID',
      field + ' must be between ' + minimum + ' and ' + maximum + '.'
    );
  }
  return value;
}

function readOutput(value: unknown): PrintOutput {
  if (!isRecord(value) || !isRecord(value.page)) {
    printBadRequest('PRINT_INPUT_INVALID', 'output.page is required.');
  }
  const format = value.format;
  if (format !== 'pdf' && format !== 'png' && format !== 'jpeg' && format !== 'zip') {
    printBadRequest('PRINT_INPUT_INVALID', 'output.format must be pdf, png, jpeg, or zip.');
  }
  const page = value.page;
  const orientation = page.orientation;
  if (orientation !== undefined && orientation !== 'portrait' && orientation !== 'landscape') {
    printBadRequest('PRINT_INPUT_INVALID', 'output.page.orientation is invalid.');
  }
  const widthMm = readNumber(page.widthMm, 'output.page.widthMm', 10, 2000);
  const heightMm = readNumber(page.heightMm, 'output.page.heightMm', 10, 2000);
  const resolvedWidth = orientation === 'landscape' && widthMm < heightMm ? heightMm : widthMm;
  const resolvedHeight = orientation === 'landscape' && widthMm < heightMm ? widthMm : heightMm;
  const margin = isRecord(page.marginMm)
    ? {
        top: readNumber(page.marginMm.top, 'marginMm.top', 0, 200),
        right: readNumber(page.marginMm.right, 'marginMm.right', 0, 200),
        bottom: readNumber(page.marginMm.bottom, 'marginMm.bottom', 0, 200),
        left: readNumber(page.marginMm.left, 'marginMm.left', 0, 200)
      }
    : undefined;
  const dpi = value.dpi === undefined ? 96 : value.dpi;
  if (dpi !== 96 && dpi !== 144 && dpi !== 192) {
    printBadRequest('PRINT_INPUT_INVALID', 'output.dpi must be 96, 144, or 192.');
  }
  return {
    format,
    page: { widthMm: resolvedWidth, heightMm: resolvedHeight, orientation, marginMm: margin },
    dpi,
    scale: value.scale === undefined ? 1 : readNumber(value.scale, 'output.scale', 0.5, 2),
    printBackground: value.printBackground !== false,
    filename: typeof value.filename === 'string' ? value.filename.slice(0, 120) : undefined
  };
}

function readInlineRecords(value: unknown): PrintDataInput {
  if (!isRecord(value) || !Array.isArray(value.records)) {
    printBadRequest(
      'PRINT_INPUT_INVALID',
      'data.kind="records" with a records array is required after data source resolution.'
    );
  }
  if (!value.records.length) printBadRequest('PRINT_INPUT_INVALID', 'At least one record is required.');
  if (value.records.length > MAX_RECORDS) {
    printBadRequest(
      'PRINT_RECORD_LIMIT_EXCEEDED',
      'A print job supports at most ' + MAX_RECORDS + ' records.'
    );
  }
  const records = value.records.map((item, index) => {
    if (!isRecord(item)) {
      printBadRequest('PRINT_INPUT_INVALID', 'data.records[' + index + '] must be an object.');
    }
    if (Buffer.byteLength(JSON.stringify(item), 'utf8') > MAX_RECORD_BYTES) {
      printBadRequest('PRINT_INPUT_TOO_LARGE', 'data.records[' + index + '] exceeds 1 MB.');
    }
    return item;
  });
  if (Buffer.byteLength(JSON.stringify(records), 'utf8') > MAX_INLINE_DATA_BYTES) {
    printBadRequest(
      'PRINT_INPUT_TOO_LARGE',
      'Inline records exceed 5 MB. Upload a dataRef when that input mode is enabled.'
    );
  }
  return {
    kind: 'records',
    records,
    primaryKey: typeof value.primaryKey === 'string' ? value.primaryKey : undefined
  };
}

async function readData(
  value: unknown,
  context: PrintContext,
  dataSources: PrintDataSourceRuntime
): Promise<PrintDataInput> {
  if (!isRecord(value)) {
    printBadRequest('PRINT_INPUT_INVALID', 'data is required.');
  }
  if (value.kind === 'registeredQuery') {
    if (typeof value.sourceCode !== 'string' || !value.sourceCode.trim()) {
      printBadRequest('PRINT_INPUT_INVALID', 'data.sourceCode is required for registeredQuery.');
    }
    const resolved = await dataSources.resolve(value.sourceCode, value.params, context);
    return readInlineRecords({
      kind: 'records',
      records: resolved.records,
      primaryKey: typeof value.primaryKey === 'string' ? value.primaryKey : undefined
    });
  }
  if (value.kind !== 'records') {
    printBadRequest(
      'PRINT_INPUT_INVALID',
      'data.kind must be records or registeredQuery.'
    );
  }
  return readInlineRecords(value);
}

async function readInput(
  postData: Record<string, unknown>,
  context: PrintContext,
  dataSources: PrintDataSourceRuntime
): Promise<PrintJobInput> {
  const template = isRecord(postData.template)
    ? {
        templateId: typeof postData.template.templateId === 'string'
          ? postData.template.templateId
          : undefined,
        version: typeof postData.template.version === 'number'
          ? postData.template.version
          : undefined
      }
    : {};
  const options = isRecord(postData.options) ? postData.options : {};
  const templateSnapshot = postData.templateSnapshot ?? await loadStoredTemplateSnapshot(template, context);
  return {
    template: template as PrintTemplate,
    templateSnapshot: templateSnapshot as PrintTemplateSnapshot,
    data: await readData(postData.data, context, dataSources),
    output: readOutput(postData.output),
    options: {
      locale: typeof options.locale === 'string' ? options.locale : 'zh-CN',
      timezone: typeof options.timezone === 'string' ? options.timezone : 'Asia/Shanghai',
      priority: options.priority === 'preview' || options.priority === 'retry'
        ? options.priority
        : 'normal'
    }
  };
}

async function loadStoredTemplateSnapshot(template: PrintTemplate, context: PrintContext) {
  if (!template.templateId) {
    printBadRequest('PRINT_TEMPLATE_NOT_PUBLISHED', 'templateSnapshot or template.templateId is required.');
  }
  const client = createSupabaseClient('user', context);
  const { data, error } = await client
    .from('print_templates')
    .select('id, version, status, metadata')
    .eq('id', template.templateId)
    .maybeSingle();
  if (error) printBadRequest('PRINT_TEMPLATE_LOAD_FAILED', error.message);
  if (!data) printNotFound('Print template was not found.');
  if (template.version !== undefined && data.version !== template.version) {
    printBadRequest(
      'PRINT_TEMPLATE_VERSION_MISMATCH',
      `Requested template version ${template.version}, current version is ${data.version}.`
    );
  }
  if (data.status !== 'active') {
    printBadRequest('PRINT_TEMPLATE_NOT_PUBLISHED', 'Only active print templates can be exported.');
  }
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const snapshot = metadata.renderSnapshot;
  if (!isRecord(snapshot) || typeof snapshot.html !== 'string' || !snapshot.html.trim()) {
    printBadRequest(
      'PRINT_TEMPLATE_NOT_COMPILED',
      'This template has no server render snapshot. Open it in the designer and save it once.'
    );
  }
  return snapshot;
}

function publicArtifact(artifact: PrintArtifact) {
  const { storageKey: _storageKey, sha256: _sha256, ...result } = artifact;
  return result;
}

function publicJob(job: PrintJobRecord) {
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    artifacts: job.artifacts.map(publicArtifact),
    error: job.error ?? null,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    expiresAt: job.expiresAt
  };
}

@Injectable()
export class PrintService implements ServiceExecutor {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    @Inject(PrintJobRepository)
    private readonly jobs: PrintJobRepository,
    @Inject(PrintRenderPool)
    private readonly renderPool: PrintRenderPool,
    @Inject(PrintArtifactStorage)
    private readonly artifactStorage: PrintArtifactStorage,
    @Inject(PrintDataSourceRuntime)
    private readonly dataSources: PrintDataSourceRuntime
  ) {}

  async execute(method: string, postData: Record<string, unknown>, serviceContext: ServiceContext) {
    const context = requireContext(serviceContext);
    switch (method) {
      case 'createPreview':
        return this.createPreview(postData, context);
      case 'createExportJob':
        return this.createExportJob(postData, context);
      case 'getJob':
        return this.getJob(postData, context);
      case 'cancelJob':
        return this.cancelJob(postData, context);
      case 'getArtifactDownload':
        return this.getArtifactDownload(postData, context);
      case 'listDataSources':
        return this.dataSources.list(context);
      case 'listManagedDataSources':
        return this.dataSources.listManaged(context);
      case 'saveDataSource':
        return this.dataSources.saveManaged(postData, context);
      case 'deleteDataSource':
        return this.dataSources.deleteManaged(postData, context);
      case 'testDataSourceConnection':
        return this.dataSources.testConnection(postData, context);
      case 'resolveDataSource':
      case 'testDataSource':
      case 'executeDataSource':
        return this.resolveDataSource(postData, context);
      default:
        printBadRequest('PRINT_METHOD_NOT_SUPPORTED', 'Unsupported print method: ' + method);
    }
  }

  private async createPreview(postData: Record<string, unknown>, context: PrintContext) {
    const input = await readInput(postData, context, this.dataSources);
    if (input.output.format === 'zip') {
      printBadRequest('PRINT_INPUT_INVALID', 'Preview output cannot use zip format.');
    }
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const job = await this.jobs.create('preview', input, context, expiresAt);
    if (input.data.records.length > 3) {
      this.enqueue(job, context);
      return {
        mode: 'async',
        previewId: job.id,
        jobId: job.id,
        status: 'queued',
        pollAfterMs: 500
      };
    }
    const processing = this.processJob(job, context);
    const previewTimeout = Number(getEnv().PRINT_PREVIEW_TIMEOUT_MS ?? 15_000);
    const outcome = await new Promise<
      { completed: true; renderMs: number } | { completed: false; renderMs: 0 }
    >((resolve, reject) => {
      const timer = setTimeout(
        () => resolve({ completed: false, renderMs: 0 }),
        Number.isFinite(previewTimeout) && previewTimeout > 0 ? previewTimeout : 15_000
      );
      void processing.then(
        (renderMs) => {
          clearTimeout(timer);
          resolve({ completed: true, renderMs });
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
    if (!outcome.completed) {
      return {
        mode: 'async',
        previewId: job.id,
        jobId: job.id,
        status: 'running',
        pollAfterMs: 500
      };
    }
    const completed = await this.requireJob(job.id, context);
    if (completed.status === 'failed') {
      printBadRequest(
        completed.error?.code ?? 'PRINT_RENDER_FAILED',
        completed.error?.message ?? 'Rendering failed.'
      );
    }
    return {
      mode: 'inline',
      previewId: job.id,
      status: completed.status,
      artifact: completed.artifacts[0] ? publicArtifact(completed.artifacts[0]) : null,
      artifacts: completed.artifacts.map(publicArtifact),
      metrics: { queueMs: 0, renderMs: outcome.renderMs }
    };
  }

  private async createExportJob(postData: Record<string, unknown>, context: PrintContext) {
    const input = await readInput(postData, context, this.dataSources);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const job = await this.jobs.create('export', input, context, expiresAt);
    this.enqueue(job, context);
    return {
      jobId: job.id,
      status: 'queued',
      acceptedCount: input.data.records.length,
      pollAfterMs: 1000,
      statusMethod: 'getJob'
    };
  }

  private async resolveDataSource(postData: Record<string, unknown>, context: PrintContext) {
    const sourceCode = typeof postData.sourceCode === 'string'
      ? postData.sourceCode
      : postData.code;
    if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
      printBadRequest('PRINT_INPUT_INVALID', 'sourceCode is required.');
    }
    return this.dataSources.resolve(sourceCode, postData.params, context);
  }

  private async getJob(postData: Record<string, unknown>, context: PrintContext) {
    const job = await this.requireJobId(postData, context);
    await this.refreshDownloadUrls(job, context);
    return publicJob(job);
  }

  private async cancelJob(postData: Record<string, unknown>, context: PrintContext) {
    const job = await this.requireJobId(postData, context);
    if (job.status === 'queued') {
      await this.jobs.update(job.id, context, {
        status: 'canceled',
        cancelRequested: true,
        finishedAt: new Date().toISOString()
      });
    } else if (job.status === 'running') {
      await this.jobs.requestCancel(job.id, context);
    }
    return publicJob(await this.requireJob(job.id, context));
  }

  private async getArtifactDownload(postData: Record<string, unknown>, context: PrintContext) {
    const job = await this.requireJobId(postData, context);
    const artifactId = typeof postData.artifactId === 'string' ? postData.artifactId : '';
    const artifact = job.artifacts.find((item) => item.artifactId === artifactId);
    if (!artifact?.storageKey) printNotFound('Print artifact was not found.');
    const extension = artifact.format === 'jpeg' ? 'jpg' : artifact.format;
    const fresh = await this.artifactStorage.refresh(
      context,
      artifact.storageKey,
      artifact.mimeType,
      (job.input.output.filename || 'print-output') + '.' + extension
    );
    return { artifactId, ...fresh };
  }

  private enqueue(job: PrintJobRecord, context: PrintContext) {
    setImmediate(() => {
      void this.processJob(job, context).catch((error: unknown) => {
        this.logger.error(
          'Print job ' + job.id + ' failed: ' +
          (error instanceof Error ? error.message : String(error))
        );
      });
    });
  }

  private async processJob(job: PrintJobRecord, context: PrintContext) {
    const latest = await this.requireJob(job.id, context);
    if (latest.status === 'canceled' || latest.cancelRequested) return 0;
    await this.jobs.update(job.id, context, {
      status: 'running',
      startedAt: new Date().toISOString()
    });
    try {
      const compiler = compilePrintTemplate(job.input.templateSnapshot, job.input.output);
      const documents = job.input.data.records.map(compiler.renderRecord);
      const renderOutput: PrintOutput = job.input.output.format === 'zip'
        ? { ...job.input.output, format: 'png' }
        : job.input.output;
      const rendered = await this.renderPool.render(documents, renderOutput);
      const afterRender = await this.requireJob(job.id, context);
      if (afterRender.cancelRequested) {
        await this.jobs.update(job.id, context, {
          status: 'canceled',
          finishedAt: new Date().toISOString()
        });
        return rendered.renderMs;
      }

      let files: RenderedFile[] = rendered.files;
      const needsZip = job.input.output.format === 'zip' ||
        ((job.input.output.format === 'png' || job.input.output.format === 'jpeg') && files.length > 1);
      if (needsZip) {
        files = [{
          name: 'output.zip',
          mimeType: 'application/zip',
          body: createZip(rendered.files)
        }];
      }
      for (const file of files) {
        const stored = await this.artifactStorage.upload(
          job.id,
          context.accountId,
          file,
          job.input.output.filename
        );
        const artifact: PrintArtifact = {
          ...stored,
          format: needsZip ? 'zip' : stored.format,
          recordCount: job.input.data.records.length
        };
        await this.jobs.addArtifact(job.id, context, artifact);
      }
      const total = job.input.data.records.length;
      await this.jobs.update(job.id, context, {
        status: 'succeeded',
        progress: { total, completed: total, failed: 0, percent: 100 },
        finishedAt: new Date().toISOString()
      });
      return rendered.renderMs;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobs.update(job.id, context, {
        status: 'failed',
        error: {
          code: message.includes('timed out') ? 'PRINT_RENDER_TIMEOUT' : 'PRINT_RENDER_FAILED',
          message
        },
        finishedAt: new Date().toISOString()
      });
      return 0;
    }
  }

  private async requireJobId(postData: Record<string, unknown>, context: PrintContext) {
    const id = typeof postData.jobId === 'string' ? postData.jobId : '';
    if (!id) printBadRequest('PRINT_INPUT_INVALID', 'jobId is required.');
    return this.requireJob(id, context);
  }

  private async requireJob(id: string, context: PrintContext): Promise<PrintJobRecord> {
    const job = await this.jobs.get(id, context);
    if (!job) printNotFound();
    return job;
  }

  private async refreshDownloadUrls(job: PrintJobRecord, context: PrintContext) {
    for (const artifact of job.artifacts) {
      if (artifact.downloadUrl && Date.parse(artifact.expiresAt) > Date.now() + 30_000) continue;
      if (!artifact.storageKey) continue;
      const extension = artifact.format === 'jpeg' ? 'jpg' : artifact.format;
      const fresh = await this.artifactStorage.refresh(
        context,
        artifact.storageKey,
        artifact.mimeType,
        (job.input.output.filename || 'print-output') + '.' + extension
      );
      artifact.downloadUrl = fresh.downloadUrl;
      artifact.expiresAt = fresh.expiresAt;
      artifact.contentDisposition = fresh.contentDisposition;
    }
  }
}
