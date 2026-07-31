import { convertVisualBlocks, convertVisualEditorToLowCode as convertVisualEditorSchema, } from '../lowcode/visual-converters';
export function convertVisualEditorToLowCode(model, currentPage) {
    return convertVisualEditorSchema({ model, currentPage });
}
export { convertVisualBlocks };
