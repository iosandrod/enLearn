export type PrintFormat = 'pdf' | 'png';
export type PrintMargins = { top: number; right: number; bottom: number; left: number };
export type RenderInput = {
  html: string;
  css: string;
  records: Array<Record<string, unknown>>;
  recordIndex: number;
  pageIndex: number;
  output: {
    format: PrintFormat;
    page: { widthMm: number; heightMm: number; marginMm: PrintMargins };
    printBackground: boolean;
    scale: number;
    dpi: number;
    filename: string;
  };
};
export type RenderRequest = { id: string; input: RenderInput };
export type RenderResult = {
  body: Uint8Array;
  mimeType: string;
  filename: string;
  pageCount: number;
  renderMs: number;
  workerId: number;
};
export type RenderResponse =
  | { type: 'browser'; pid: number }
  | { type: 'ready' }
  | { type: 'fatal'; message: string }
  | { type: 'result'; id: string; result: RenderResult }
  | { type: 'error'; id: string; message: string; statusCode: number };
