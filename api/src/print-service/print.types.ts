import type { ServiceContext } from '../common/interfaces/service-executor';

export type PrintFormat = 'pdf' | 'png' | 'jpeg' | 'zip';
export type PrintJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'canceled'
  | 'expired';

export type PrintTemplate = {
  templateId?: string;
  version?: number;
};

export type PrintTemplateSnapshot = {
  html: string;
  css?: string;
};

export type PrintDataInput = {
  kind: 'records';
  records: Array<Record<string, unknown>>;
  primaryKey?: string;
};

export type PrintPage = {
  widthMm: number;
  heightMm: number;
  orientation?: 'portrait' | 'landscape';
  marginMm?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type PrintOutput = {
  format: PrintFormat;
  page: PrintPage;
  dpi?: 96 | 144 | 192;
  scale?: number;
  printBackground?: boolean;
  filename?: string;
};

export type PrintJobInput = {
  template: PrintTemplate;
  templateSnapshot: PrintTemplateSnapshot;
  data: PrintDataInput;
  output: PrintOutput;
  options: {
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
  storageKey?: string;
  sha256?: string;
};

export type PrintJobProgress = {
  total: number;
  completed: number;
  failed: number;
  percent: number;
};

export type PrintJobRecord = {
  id: string;
  accountId: string;
  ownerId: string;
  kind: 'preview' | 'export';
  status: PrintJobStatus;
  input: PrintJobInput;
  progress: PrintJobProgress;
  artifacts: PrintArtifact[];
  error?: { code: string; message: string } | null;
  cancelRequested: boolean;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  expiresAt: string;
};

export type PrintContext = ServiceContext & {
  accountId: string;
  userId: string;
};

export type RenderTask = {
  html: string;
  records: Array<Record<string, unknown>>;
  output: PrintOutput;
};

export type RenderedFile = {
  name: string;
  mimeType: string;
  recordKey?: string;
  body: Buffer;
};

export type RenderResult = {
  files: RenderedFile[];
  renderMs: number;
};
