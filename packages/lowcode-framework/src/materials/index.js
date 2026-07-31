import { registerLowCodeBlockMaterial, } from '../lowcode/block-materials';
import { registerLowCodeFormMaterial, } from '../lowcode/form-materials';
import { registerMaterialPropForm } from '../visual-editor/material-prop-forms';
import { registerVisualToLowCodeConverter, } from '../lowcode/visual-converters';
export const lowCodeMaterialPluginContext = {
    registerBlockMaterial: registerLowCodeBlockMaterial,
    registerFormMaterial: registerLowCodeFormMaterial,
    registerVisualConverter: registerVisualToLowCodeConverter,
    registerMaterialPropForm,
};
const installedMaterialPlugins = new Set();
export function installLowCodeMaterialPlugin(plugin) {
    const key = plugin.name || plugin;
    if (installedMaterialPlugins.has(key))
        return;
    plugin.install(lowCodeMaterialPluginContext);
    installedMaterialPlugins.add(key);
}
export function getInstalledLowCodeMaterialPlugins() {
    return [...installedMaterialPlugins];
}
export { default as lowCodeBusinessComponents } from '../packages/business-component';
export { default as lowCodeButtonGroupVisualComponent } from '../packages/business-component/lowcode-button-group';
export { default as lowCodeButtonGroupConverter } from '../lowcode/visual-converters/lowcode-button-group';
export * from '../visual-editor/material-prop-forms';
export * from '../visual-editor/material-prop-forms/helpers';
export * from '../lowcode/block-materials/defaults';
export * from '../lowcode/block-materials';
export * from '../lowcode/form-materials';
export * from '../lowcode/form-materials/useLowCodeFormMaterialModel';
