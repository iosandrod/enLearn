import {
  Box,
  resolvePrintDataSource,
  resolvePrintPreviewRows,
  type Editor,
  type PrintDataRow,
  type PrintDataSourceConfig,
  type VueTemplateWorkspaceConfig
} from 'tldraw-vue-phase-one';
import type {
  CreatePrintInput,
  PrintArtifact,
  PrintFormat,
  PrintJob
} from './usePrintApi';

const DEFAULT_PAGE_SIZE_MM = { w: 210, h: 297 };
const DEFAULT_PX_PER_MM = 96 / 25.4;

type TemplateIdentity = {
  templateId?: string;
  version?: number;
  filename?: string;
};

export function usePrintDesignerExport() {
  const printApi = usePrintApi();

  async function createInput(
    editor: Editor,
    workspace: VueTemplateWorkspaceConfig,
    identity: TemplateIdentity,
    format: PrintFormat
  ): Promise<CreatePrintInput> {
    const page = resolvePageSettings(workspace);
    const [templateSnapshot, records] = await Promise.all([
      createSvgTemplateSnapshot(editor, page.bounds, workspace.background),
      resolveRecords(workspace.printDataSource as PrintDataSourceConfig | undefined)
    ]);

    return {
      template: {
        ...(identity.templateId ? { templateId: identity.templateId } : {}),
        ...(identity.version ? { version: identity.version } : {})
      },
      templateSnapshot,
      records,
      output: {
        format,
        page: {
          widthMm: page.size.w,
          heightMm: page.size.h,
          marginMm: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        dpi: 144,
        printBackground: true,
        filename: sanitizeFilename(identity.filename || 'print-output').replace(/\.(png|pdf)$/i, '')
      },
      options: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        priority: format === 'png' ? 'preview' : 'normal'
      }
    };
  }

  async function createTemplateSnapshot(editor: Editor, workspace: VueTemplateWorkspaceConfig) {
    return createSvgTemplateSnapshot(editor, resolvePageSettings(workspace).bounds, workspace.background);
  }

  async function preview(input: CreatePrintInput) {
    const result = await printApi.createPreview(input);
    if (result.mode === 'inline') return result.artifact ?? result.artifacts?.[0] ?? null;
    if (!result.jobId) throw new Error('预览任务未返回任务编号');
    const job = await printApi.waitForJob(result.jobId, { initialDelayMs: result.pollAfterMs });
    return requireArtifact(job);
  }

  async function exportFile(input: CreatePrintInput, onProgress?: (job: PrintJob) => void) {
    const accepted = await printApi.createExportJob(input);
    const job = await printApi.waitForJob(accepted.jobId, {
      initialDelayMs: accepted.pollAfterMs,
      onProgress
    });
    return requireArtifact(job);
  }

  return { createInput, createTemplateSnapshot, preview, exportFile };
}

export async function createSvgTemplateSnapshot(
  editor: Editor,
  bounds: { x: number; y: number; w: number; h: number },
  background?: VueTemplateWorkspaceConfig['background']
) {
  const originalPageId = editor.getCurrentPageId();
  const pages: string[] = [];
  const pageBackground = await createPageBackground(background);

  try {
    for (const page of editor.getPages()) {
      if (editor.getCurrentPageId() !== page.id) editor.setCurrentPage(page.id);
      const shapeIds = editor.getCurrentPageShapeIdsSorted();
      let svg = '';
      if (shapeIds.length) {
        const result = await (editor as Editor & {
          getSvgString: (ids: unknown[], options: Record<string, unknown>) => Promise<{ svg: string } | undefined>;
        }).getSvgString(shapeIds, {
          bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h),
          // The section owns the workspace background so empty pages and pages
          // containing shapes render the same configured color/image.
          background: false,
          padding: 0,
          darkMode: false,
          preserveAspectRatio: 'xMidYMid meet'
        });
        svg = result?.svg || '';
      }
      pages.push(createPrintPageMarkup(pages.length + 1, pageBackground, svg));
    }
  } finally {
    if (editor.getPage(originalPageId) && editor.getCurrentPageId() !== originalPageId) {
      editor.setCurrentPage(originalPageId);
    }
  }

  if (!pages.length) {
    pages.push(createPrintPageMarkup(1, pageBackground, ''));
  }
  return {
    html: pages.join(''),
    css: [
      'html, body { overflow: visible; background: #fff; }',
      `.print-page { width: ${Math.max(1, bounds.w)}px; height: ${Math.max(1, bounds.h)}px; overflow: hidden; break-after: page; page-break-after: always; }`,
      '.print-page:last-child { break-after: auto; page-break-after: auto; }',
      '.print-page { position: relative; box-sizing: border-box; background-repeat: no-repeat; }',
      '.print-page-background { position: absolute; z-index: 0; inset: 0; display: block; width: 100%; height: 100%; }',
      '.print-page > svg { position: relative; z-index: 1; display: block; width: 100%; height: 100%; }'
    ].join('\n')
  };
}

async function createPageBackground(background: VueTemplateWorkspaceConfig['background']) {
  if (!background) return { style: '', imageUrl: '', imageSize: 'cover', imagePosition: 'center', opacity: 1 };
  const color = sanitizeCssValue(background.color, '#ffffff');
  const imageUrl = await resolveBackgroundImageUrl(background.imageUrl);
  const imageSize = background.imageSize === 'contain' || background.imageSize === 'auto'
    ? background.imageSize
    : 'cover';
  const position = sanitizeCssValue(background.imagePosition, 'center');
  const opacity = normalizeBackgroundOpacity(background.opacity);
  return {
    style: `background-color:${color};background-size:${imageSize};background-position:${position};`,
    imageUrl,
    imageSize,
    imagePosition: position,
    opacity,
  };
}

function createPrintPageMarkup(pageNo: number, background: Awaited<ReturnType<typeof createPageBackground>>, svg: string) {
  const backgroundImage = background.imageUrl
    ? `<img class="print-page-background" src="${escapeHtmlAttribute(background.imageUrl)}" alt="" style="object-fit:${background.imageSize === 'contain' ? 'contain' : background.imageSize === 'auto' ? 'none' : 'cover'};object-position:${escapeCssValue(background.imagePosition)};opacity:${background.opacity};" />`
    : '';
  const style = background.style ? ` style="${escapeHtmlAttribute(background.style)}"` : '';
  return `<section class="print-page" data-print-page="${pageNo}"${style}>${backgroundImage}${svg}</section>`;
}

async function resolveBackgroundImageUrl(value: unknown) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.startsWith('data:')) return url;
  if (typeof fetch !== 'function') return '';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`背景图片加载失败（${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function sanitizeCssValue(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && !/[;{}<>"']/.test(text) ? text : fallback;
}

function normalizeBackgroundOpacity(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(100, Math.max(0, numeric)) / 100;
}

function escapeCssValue(value: string) {
  return value.replace(/[;{}<>"'\r\n]/g, '');
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

async function resolveRecords(dataSource: PrintDataSourceConfig | undefined): Promise<PrintDataRow[]> {
  const rows = await resolvePrintDataSource(dataSource);
  const resolved = resolvePrintPreviewRows(dataSource, rows);
  return resolved?.length ? resolved : [{}];
}

function resolvePageSettings(workspace: VueTemplateWorkspaceConfig) {
  const pxPerMm = finitePositive(workspace.pxPerMm) ? workspace.pxPerMm : DEFAULT_PX_PER_MM;
  const size = isSize(workspace.pageSizeMm)
    ? workspace.pageSizeMm
    : isBounds(workspace.pageBounds)
      ? { w: workspace.pageBounds.w / pxPerMm, h: workspace.pageBounds.h / pxPerMm }
      : DEFAULT_PAGE_SIZE_MM;
  const bounds = isBounds(workspace.pageBounds)
    ? workspace.pageBounds
    : { x: 0, y: 0, w: size.w * pxPerMm, h: size.h * pxPerMm };
  return { size, bounds };
}

function requireArtifact(job: PrintJob): PrintArtifact {
  if (job.status !== 'succeeded' && job.status !== 'partial') {
    throw new Error(job.error?.message || `打印任务状态异常：${job.status}`);
  }
  const artifact = job.artifacts[0];
  if (!artifact) throw new Error('打印任务未生成下载文件');
  return artifact;
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 100) || 'print-output';
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isSize(value: unknown): value is { w: number; h: number } {
  return Boolean(value && typeof value === 'object'
    && finitePositive((value as { w?: unknown }).w)
    && finitePositive((value as { h?: unknown }).h));
}

function isBounds(value: unknown): value is { x: number; y: number; w: number; h: number } {
  return Boolean(value && typeof value === 'object'
    && typeof (value as { x?: unknown }).x === 'number'
    && typeof (value as { y?: unknown }).y === 'number'
    && isSize(value));
}
