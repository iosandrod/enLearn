import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/runtime';
import type { LowCodePageRecord } from '@enlearn/lowcode-framework/types/lowcode';

export const PRINT_DESIGNER_PAGE_CODE = 'print-designer';
export const PRINT_TEMPLATE_LIST_PAGE_CODE = 'print-templates';
export const PRINT_TEMPLATE_EDIT_PAGE_CODE = 'print-templates-edit';

export const PRINT_DESIGNER_FORM_CODES = [
  'print-designer.style',
  'print-designer.property.workspace',
  'print-designer.property.vue-box',
  'print-designer.property.vue-text',
  'print-designer.property.vue-rich-text',
  'print-designer.property.vue-image',
  'print-designer.property.vue-line',
  'print-designer.property.vue-arrow',
  'print-designer.property.vue-draw',
  'print-designer.property.vue-qr',
  'print-designer.property.vue-barcode',
  'print-designer.property.vue-frame',
  'print-designer.property.vue-table',
  'print-designer.property.bi-chart',
  'print-designer.property.vue-material',
  'print-designer.property.vue-material-column',
  'print-designer.property.vue-material-section',
  'print-designer.property.vue-resume',
  'print-designer.property.vue-resume-section',
  'print-designer.property.group',
  'print-designer.property.generic',
  'print-designer.datasource-selector',
  'print-designer.datasource-definition',
  'print-designer.datasource-detail-import',
  'print-designer.datasource-typeorm',
  'print-designer.datasource-script-meta',
  'print-designer.detail-table-columns',
  'print-designer.background',
  'print-designer.preview-settings',
  'presentation-animation',
] as const;

export type PrintDesignerLowCodePrefetch = {
  designerPage: LowCodePageRecord | null;
  templateListPage: LowCodePageRecord | null;
  templateEditPage: LowCodePageRecord | null;
};

function asPage(value: unknown) {
  return value && typeof value === 'object' ? value as LowCodePageRecord : null;
}

/**
 * Warms the low-code resources used by the print designer. The service API
 * owns the session cache and request coalescing; this helper only defines the
 * related page graph and keeps the prefetch best-effort.
 */
export async function prefetchPrintDesignerLowCodeResources(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
): Promise<PrintDesignerLowCodePrefetch> {
 return
}//
