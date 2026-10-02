export type PrintFormat = 'pdf' | 'png' | 'jpeg' | 'zip';
export type PrintJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'canceled'
  | 'expired';

export type PrintTemplateSnapshot = {
  html: string;
  css?: string;
};

export type PrintOutputOptions = {
  format: PrintFormat;
  page: {
    widthMm: number;
    heightMm: number;
    orientation?: 'portrait' | 'landscape';
    marginMm?: { top: number; right: number; bottom: number; left: number };
  };
  dpi?: 96 | 144 | 192;
  scale?: number;
  printBackground?: boolean;
  filename?: string;
};

export type CreatePrintInput = {
  template?: { templateId?: string; version?: number };
  templateSnapshot?: PrintTemplateSnapshot;
  records: Array<Record<string, unknown>>;
  primaryKey?: string;
  output: PrintOutputOptions;
  options?: {
    locale?: string;
    timezone?: string;
    priority?: 'preview' | 'normal' | 'retry';
  };
};

export type PrintArtifact = {
  artifactId: string;
  format: PrintFormat;
  mimeType: string;
  sizeBytes: number;
  recordCount: number;
  downloadUrl: string;
  expiresAt: string;
  contentDisposition: string;
};

export type PrintJob = {
  jobId: string;
  status: PrintJobStatus;
  progress: {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  };
  artifacts: PrintArtifact[];
  error: { code: string; message: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
};

export type PrintPreviewResult = {
  mode: 'inline' | 'async';
  previewId: string;
  jobId?: string;
  status: PrintJobStatus;
  artifact?: PrintArtifact | null;
  artifacts?: PrintArtifact[];
  pollAfterMs?: number;
  metrics?: { queueMs: number; renderMs: number };
};

export type PrintExportAccepted = {
  jobId: string;
  status: 'queued';
  acceptedCount: number;
  pollAfterMs: number;
  statusMethod: 'getJob';
};

function servicePayload(input: CreatePrintInput) {
  return {
    template: input.template ?? {},
    ...(input.templateSnapshot ? { templateSnapshot: input.templateSnapshot } : {}),
    data: {
      kind: 'records',
      records: input.records,
      primaryKey: input.primaryKey
    },
    output: input.output,
    options: input.options ?? {}
  };
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Print job polling was aborted.', 'AbortError'));
      return;
    }
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException('Print job polling was aborted.', 'AbortError'));
    }, { once: true });
  });
}

export function usePrintApi() {
  const serviceApi = useServiceApi();

  function createPreview(input: CreatePrintInput) {
    return serviceApi.invoke<PrintPreviewResult>(
      'print',
      'createPreview',
      servicePayload(input)
    );
  }

  function createExportJob(input: CreatePrintInput) {
    return serviceApi.invoke<PrintExportAccepted>(
      'print',
      'createExportJob',
      servicePayload(input)
    );
  }

  function getJob(jobId: string) {
    return serviceApi.invoke<PrintJob>('print', 'getJob', { jobId });
  }

  function cancelJob(jobId: string) {
    return serviceApi.invoke<PrintJob>('print', 'cancelJob', { jobId });
  }

  function getArtifactDownload(jobId: string, artifactId: string) {
    return serviceApi.invoke<{
      artifactId: string;
      downloadUrl: string;
      expiresAt: string;
      contentDisposition: string;
      mimeType: string;
    }>('print', 'getArtifactDownload', { jobId, artifactId });
  }

  async function waitForJob(
    jobId: string,
    options: {
      signal?: AbortSignal;
      initialDelayMs?: number;
      maxDelayMs?: number;
      timeoutMs?: number;
      onProgress?: (job: PrintJob) => void;
    } = {}
  ) {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 10 * 60_000;
    const maxDelayMs = options.maxDelayMs ?? 3000;
    let delayMs = options.initialDelayMs ?? 800;

    while (true) {
      const job = await getJob(jobId);
      options.onProgress?.(job);
      if (job.status === 'succeeded' || job.status === 'partial') return job;
      if (job.status === 'failed') {
        throw new Error(job.error?.message || 'Print job failed.');
      }
      if (job.status === 'canceled' || job.status === 'expired') return job;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error('Timed out while waiting for the print job.');
      }
      await wait(delayMs, options.signal);
      delayMs = Math.min(maxDelayMs, Math.round(delayMs * 1.35));
    }
  }

  return {
    createPreview,
    createExportJob,
    getJob,
    cancelJob,
    getArtifactDownload,
    waitForJob
  };
}
