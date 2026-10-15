export type MillimeterBox = { top: number; right: number; bottom: number; left: number };
export type PaperSettings = { widthMm: number; heightMm: number; marginMm: MillimeterBox };
export type OffsetSettings = { xMm: number; yMm: number };

export type PrinterProfile = {
  paper: PaperSettings;
  offset: OffsetSettings;
  landscape: boolean;
  printBackground: boolean;
};

export type DesktopConfig = {
  host: string;
  port: number;
  defaultPrinter: string;
  autoStart: boolean;
  maxHistory: number;
  updateFeedUrl: string;
  defaultProfile: PrinterProfile;
  printerProfiles: Record<string, PrinterProfile>;
};

export type PrintRequest = {
  html: string;
  css: string;
  records: Array<Record<string, unknown>>;
  printerName: string;
  templateName: string;
  jobName: string;
  copies: number;
  collate: boolean;
  landscape: boolean;
  printBackground: boolean;
  page: PaperSettings;
  offset: OffsetSettings;
  wait: boolean;
};

export type PreviewRequest = Omit<PrintRequest, 'printerName' | 'copies' | 'collate' | 'wait'> & {
  format: 'pdf' | 'png';
  recordIndex: number;
  pageIndex: number;
  dpi: number;
  scale: number;
  filename: string;
};

export type JobStatus = 'queued' | 'printing' | 'submitted' | 'failed';
export type PrintJob = {
  id: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  status: JobStatus;
  printerName: string;
  templateName: string;
  jobName: string;
  copies: number;
  page: PaperSettings;
  error?: string;
  attempt: number;
  request: PrintRequest;
};

export type PrintResult = { success: boolean; failureReason?: string };
