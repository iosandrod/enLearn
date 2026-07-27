import type { LowCodePageBlock, LowCodePageDataSource } from '~/types/lowcode';
import type {
  VisualEditorBlockData,
  VisualEditorModelValue,
  VisualEditorPage,
} from '@/visual-editor/visual-editor.utils';

export type VisualBlockProps = Record<string, unknown>;

export type VisualToLowCodeConversionResult = {
  blocks: LowCodePageBlock[];
  dataSources: Record<string, LowCodePageDataSource>;
};

export type VisualToLowCodeContext = {
  dataSources: Record<string, LowCodePageDataSource>;
  convertBlocks: (blocks?: VisualEditorBlockData[]) => LowCodePageBlock[];
};

export type VisualToLowCodeConverter = {
  type: string;
  componentKey?: string;
  componentKeys?: string[];
  order?: number;
  match?: (block: VisualEditorBlockData) => boolean;
  defaultProps?: VisualBlockProps | (() => VisualBlockProps);
  validate?: (block: VisualEditorBlockData) => string[];
  toRuntimeBlock?: (
    block: VisualEditorBlockData,
    context: VisualToLowCodeContext
  ) => LowCodePageBlock | null;
  fromRuntimeBlock?: (
    block: LowCodePageBlock,
    context: VisualToLowCodeContext
  ) => VisualEditorBlockData | null;
  convert?: (
    block: VisualEditorBlockData,
    context: VisualToLowCodeContext
  ) => LowCodePageBlock | null;
};

export type VisualToLowCodeEntry = {
  model: VisualEditorModelValue;
  currentPage: VisualEditorPage;
};
