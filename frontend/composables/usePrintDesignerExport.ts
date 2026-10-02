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
      createSvgTemplateSnapshot(editor, page.bounds),
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
    return createSvgTemplateSnapshot(editor, resolvePageSettings(workspace).bounds);
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
  bounds: { x: number; y: number; w: number; h: number }
) {
  const originalPageId = editor.getCurrentPageId();
  const pages: string[] = [];

  try {
    for (const page of editor.getPages()) {
      if (editor.getCurrentPageId() !== page.id) editor.setCurrentPage(page.id);
      const shapeIds = editor.getCurrentPageShapeIdsSorted();
      if (!shapeIds.length) continue;
      const result = await (editor as Editor & {
        getSvgString: (ids: unknown[], options: Record<string, unknown>) => Promise<{ svg: string } | undefined>;
      }).getSvgString(shapeIds, {
        bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h),
        background: true,
        padding: 0,
        darkMode: false,
        preserveAspectRatio: 'xMidYMid meet'
      });
      if (result?.svg) {
        pages.push(`<section class="print-page" data-print-page="${pages.length + 1}">${result.svg}</section>`);
      }
    }
  } finally {
    if (editor.getPage(originalPageId) && editor.getCurrentPageId() !== originalPageId) {
      editor.setCurrentPage(originalPageId);
    }
  }

  if (!pages.length) throw new Error('当前模板没有可打印内容');
  return {
    html: pages.join(''),
    css: [
      'html, body { overflow: visible; background: #fff; }',
      '.print-page { width: 100%; height: 100%; overflow: hidden; break-after: page; page-break-after: always; }',
      '.print-page:last-child { break-after: auto; page-break-after: auto; }',
      '.print-page > svg { display: block; width: 100%; height: 100%; }'
    ].join('\n')
  };
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
