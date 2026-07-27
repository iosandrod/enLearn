import type {
  VisualEditorModelValue,
  VisualEditorPage,
} from '../visual-editor/visual-editor.utils';
import {
  convertVisualBlocks,
  convertVisualEditorToLowCode as convertVisualEditorSchema,
} from '../lowcode/visual-converters';

export function convertVisualEditorToLowCode(
  model: VisualEditorModelValue,
  currentPage: VisualEditorPage
) {
  return convertVisualEditorSchema({ model, currentPage });
}

export { convertVisualBlocks };
export type {
  VisualBlockProps,
  VisualToLowCodeContext,
  VisualToLowCodeConversionResult,
  VisualToLowCodeConverter,
} from '../lowcode/visual-converters';
