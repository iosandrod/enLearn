import type { LowCodeFormSchema, LowCodeGridColumn } from '../types/lowcode';
import type { LowCodeHostServiceApi } from '../core/host';
import { openGlobalDialog } from '../runtime/global-dialog';

export const GRID_EXPORT_FORM_CODE = 'grid-export';

type GridExportModel = {
  fields: string[];
  dataType: 'all' | 'selected' | 'current';
  fileFormat: 'csv' | 'json';
  fileName: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function createGridExportFormSchema(columns: LowCodeGridColumn[]): LowCodeFormSchema {
  const options = columns
    .filter((column) => typeof column.field === 'string' && column.field.trim())
    .map((column) => ({
      label: readString(column.title, readString(column.field)),
      value: readString(column.field),
    }));
  return {
    columns: 1,
    fields: [
      {
        field: 'fields',
        label: '导出字段',
        component: 'vxe-select',
        options,
        props: { multiple: true, filterable: true, clearable: true, placeholder: '请选择导出字段' },
        rules: [{ required: true, message: '请至少选择一个导出字段' }],
      },
      {
        field: 'dataType',
        label: '数据类型',
        component: 'vxe-select',
        options: [
          { label: '当前表格数据', value: 'all' },
          { label: '选中行', value: 'selected' },
          { label: '当前行', value: 'current' },
        ],
        props: { clearable: false },
      },
      {
        field: 'fileFormat',
        label: '文件格式',
        component: 'vxe-select',
        options: [
          { label: 'CSV（Excel）', value: 'csv' },
          { label: 'JSON', value: 'json' },
        ],
        props: { clearable: false },
      },
      {
        field: 'fileName',
        label: '文件名',
        component: 'vxe-input',
        props: { clearable: true, placeholder: '导出文件名（不含扩展名）' },
      },
    ],
    actions: [],
  };
}

async function loadConfiguredSchema(serviceApi: LowCodeHostServiceApi) {
  try {
    const rows = await serviceApi.invoke<Array<{ code?: string; schema?: unknown }>>(
      'lowcode',
      'listItems',
      { resource: 'lowcode_form_definitions', filters: { code: [GRID_EXPORT_FORM_CODE], enabled: true }, limit: 1 },
    );
    const schema = Array.isArray(rows) ? rows[0]?.schema : undefined;
    if (isRecord(schema) && Array.isArray(schema.fields) && Array.isArray(schema.actions)) {
      return schema as LowCodeFormSchema;
    }
  } catch {
    // The local schema keeps export usable while the catalog is unavailable.
  }
  return undefined;
}

function csvCell(value: unknown) {
  const text = value === null || typeof value === 'undefined' ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportRows(rows: Record<string, unknown>[], columns: LowCodeGridColumn[], model: GridExportModel) {
  const fields = model.fields.length ? model.fields : columns.map((column) => readString(column.field)).filter(Boolean);
  const selectedColumns = columns.filter((column) => fields.includes(readString(column.field)));
  const output = rows.map((row) => Object.fromEntries(
    selectedColumns.map((column) => {
      const field = readString(column.field);
      return [field, row[field]];
    }),
  ));
  const baseName = readString(model.fileName, '表格数据').replace(/[\\/:*?"<>|]/g, '_');
  if (model.fileFormat === 'json') {
    downloadFile(JSON.stringify(output, null, 2), `${baseName}.json`, 'application/json');
    return;
  }
  const header = selectedColumns.map((column) => csvCell(readString(column.title, readString(column.field))));
  const body = output.map((row) => selectedColumns.map((column) => csvCell(row[readString(column.field)])).join(','));
  downloadFile(`\uFEFF${[header.join(','), ...body].join('\r\n')}`, `${baseName}.csv`, 'text/csv');
}

export async function openGridExportDialog(options: {
  rows: Record<string, unknown>[];
  columns: LowCodeGridColumn[];
  selectedRows?: Record<string, unknown>[];
  currentRow?: Record<string, unknown> | null;
  serviceApi: LowCodeHostServiceApi;
  title?: string;
}) {
  const columns = options.columns.filter((column) => readString(column.field));
  if (!columns.length) return;
  const configured = await loadConfiguredSchema(options.serviceApi);
  const schema = configured ? structuredClone(configured) : createGridExportFormSchema(columns);
  const fields = schema.fields.find((field) => field.field === 'fields');
  if (fields) {
    fields.options = columns.map((column) => ({
      label: readString(column.title, readString(column.field)),
      value: readString(column.field),
    }));
    fields.props = { ...(fields.props ?? {}), multiple: true };
  }
  const model: GridExportModel = {
    fields: columns.map((column) => readString(column.field)),
    dataType: 'all',
    fileFormat: 'csv',
    fileName: options.title ?? '表格数据',
  };
  await openGlobalDialog<GridExportModel>({
    title: '导出数据',
    width: 520,
    model,
    form: { schema, model },
    actions: [
      { code: 'cancel', label: '取消', role: 'cancel' },
      {
        code: 'confirm',
        label: '导出',
        role: 'confirm',
        status: 'primary',
        onClick: ({ model: values }) => {
          const source = values.dataType === 'selected'
            ? options.selectedRows ?? []
            : values.dataType === 'current'
              ? (options.currentRow ? [options.currentRow] : [])
              : options.rows;
          if (!source.length) {
            throw new Error(values.dataType === 'selected' ? '请先选择要导出的行。' : '当前没有可导出的数据。');
          }
          exportRows(source, columns, values as GridExportModel);
          return undefined;
        },
      },
    ],
  });
}
