import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/runtime';
import type { LowCodePageRecord } from '@enlearn/lowcode-framework/types/lowcode';
import { getLowCodePage } from './lowCodePages';
import { loadAvailableLowCodeFormDefinitions } from './lowCodeFormDefinitions';

export const PRINT_DESIGNER_PAGE_CODE = 'print-designer';
export const PRINT_TEMPLATE_LIST_PAGE_CODE = 'print-templates';

export const PRINT_DESIGNER_FORM_CODES = [
  'print-designer.property.workspace',
  'print-designer.property.vue-box',
  'print-designer.property.vue-text',
  'print-designer.property.vue-image',
  'print-designer.property.vue-line',
  'print-designer.property.vue-arrow',
  'print-designer.property.vue-draw',
  'print-designer.property.vue-qr',
  'print-designer.property.vue-barcode',
  'print-designer.property.vue-frame',
  'print-designer.property.vue-table',
  'print-designer.property.vue-material',
  'print-designer.property.vue-material-section',
  'print-designer.property.vue-resume',
  'print-designer.property.vue-resume-section',
  'print-designer.property.group',
  'print-designer.property.generic',
  'print-designer.datasource-selector',
  'print-designer.datasource-definition',
  'print-designer.datasource-detail-import',
  'print-designer.background',
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
  let designerPage: LowCodePageRecord | null = null;
  let templateListPage: LowCodePageRecord | null = null;
  let templateEditPage: LowCodePageRecord | null = null;

  const [designerResult, listResult] = await Promise.allSettled([
    getLowCodePage(serviceApi, {
      code: PRINT_DESIGNER_PAGE_CODE,
      includeData: true,
    }),
    getLowCodePage(serviceApi, {
      code: PRINT_TEMPLATE_LIST_PAGE_CODE,
      includeData: true,
    }),
  ]);

  if (designerResult.status === 'fulfilled') designerPage = asPage(designerResult.value);
  if (listResult.status === 'fulfilled') templateListPage = asPage(listResult.value);

  const followUpTasks: Promise<unknown>[] = [
    getLowCodePage(serviceApi, {
      code: PRINT_DESIGNER_PAGE_CODE,
      includeData: false,
    }),
    getLowCodePage(serviceApi, {
      code: PRINT_TEMPLATE_LIST_PAGE_CODE,
      includeData: false,
    }),
    loadAvailableLowCodeFormDefinitions(serviceApi, PRINT_DESIGNER_FORM_CODES),
  ];

  if (templateListPage?.edit_page_id) {
    followUpTasks.push(
      getLowCodePage(serviceApi, {
        id: templateListPage.edit_page_id,
        includeData: false,
      }).then(async (page) => {
        const editPage = asPage(page);
        const editPageCode = editPage?.code;
        if (typeof editPageCode === 'string' && editPageCode.trim()) {
          // Warm the canonical code key as well. The save dialog resolves the
          // page by code, so this request must complete during page startup.
          const codePage = await getLowCodePage(serviceApi, {
            code: editPageCode,
            includeData: false,
          });
          templateEditPage = asPage(codePage) ?? editPage;
          return;
        }
        templateEditPage = editPage;
      }),
    );
  }

  await Promise.allSettled(followUpTasks);

  return { designerPage, templateListPage, templateEditPage };
}
