import { registerExtendCellAreaHook } from './hook';
export * from './types';
export function install(VxeUI, options) {
    registerExtendCellAreaHook(VxeUI, options);
}
export const ExtendCellArea = {
    install
};
export default ExtendCellArea;
//# sourceMappingURL=index.js.map