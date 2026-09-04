import type { SFCDescriptor } from '@vue/compiler-sfc';
import type { LowCodeMaterialKind } from './types';

const pagePropsType = `
export interface LowCodeBlockMaterialProps<T = any> {
  block: T;
  resolvedData: { [key: string]: any };
  formModels: { [key: string]: { [key: string]: any } };
  searchFilters: { [key: string]: { [key: string]: any } };
  loadingBlockId?: string;
  loadingGridId?: string;
}
export interface LowCodeBlockMaterialEmits {
  formSubmit: [payload: any];
  formAction: [payload: any];
  gridEdit: [payload: any];
  gridDelete: [payload: any];
  toolbarAction: [payload: any];
  searchSubmit: [payload: any];
  searchAction: [payload: any];
  runtimeEvent: [event: any];
}
`;

const formPropsType = `
export type LowCodeResolvedOption = any;
export type LowCodeFormMaterialPatchPayload = any;
export type LowCodeFormMaterialSelectPayload = any;
export interface LowCodeFormMaterialProps {
  field: any;
  modelValue: any;
  options?: any[];
  optionSources?: { [key: string]: any };
  formValues?: { [key: string]: any };
  onFieldChange?: (payload: any) => void;
}
`;

const lowCodeTypes = `
export type LowCodeAction = any;
export type LowCodeButtonGroupAction = any;
export type LowCodeField = any;
export type LowCodeGridColumn = any;
export type LowCodePageButtonGroupBlock = any;
export type LowCodePageContainerBlock = any;
export type LowCodePageDetailBlock = any;
export type LowCodePageDrawerBlock = any;
export type LowCodePageFormBlock = any;
export type LowCodePageGridBlock = any;
export type LowCodePageModalBlock = any;
export type LowCodePagePlanningBomBlock = any;
export type LowCodePagePlanningFlowBlock = any;
export type LowCodePagePlanningGanttBlock = any;
export type LowCodePageSearchFormBlock = any;
export type LowCodePageSectionBlock = any;
export type LowCodePageStatCardBlock = any;
export type LowCodePageTabsBlock = any;
export type LowCodePageTextBlock = any;
export type LowCodePageToolbarBlock = any;
export type LowCodePageTreeBlock = any;
`;

const virtualTypeFiles = new Map<string, string>([
  ['/lowcode/block-materials/types.ts', pagePropsType],
  ['/lowcode/form-materials/types.ts', formPropsType],
  ['/types/lowcode.ts', lowCodeTypes],
]);

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function virtualFile(path: string) {
  const normalized = normalizePath(path).replace(/\.vue\.ts$/, '.vue');
  if (virtualTypeFiles.has(normalized)) return virtualTypeFiles.get(normalized);
  if (!normalized.endsWith('.ts') && virtualTypeFiles.has(`${normalized}.ts`)) {
    return virtualTypeFiles.get(`${normalized}.ts`);
  }
  return undefined;
}

export const lowCodeMaterialTypeFileSystem = {
  fileExists(path: string) {
    const normalized = normalizePath(path).replace(/\.vue\.ts$/, '.vue');
    return virtualTypeFiles.has(normalized);
  },
  readFile(path: string) {
    return virtualFile(path);
  },
};

export function materialCompilerFilename(sourcePath: string) {
  return normalizePath(sourcePath);
}

export function assertLowCodeMaterialSfc(
  descriptor: SFCDescriptor,
  kind: LowCodeMaterialKind,
  code: string,
) {
  if (!descriptor.template) {
    throw new Error(`${kind} material ${code} must contain a template.`);
  }
  if (!descriptor.script && !descriptor.scriptSetup) {
    throw new Error(`${kind} material ${code} must contain a script or script setup block.`);
  }
  if (descriptor.script?.src || descriptor.scriptSetup?.src || descriptor.template.src) {
    throw new Error(`${kind} material ${code} cannot use external SFC src attributes.`);
  }
  if (descriptor.styles.some((style) => Boolean(style.src))) {
    throw new Error(`${kind} material ${code} cannot use external style src attributes.`);
  }
  if (descriptor.customBlocks.length) {
    throw new Error(`${kind} material ${code} cannot use custom SFC blocks.`);
  }
}
