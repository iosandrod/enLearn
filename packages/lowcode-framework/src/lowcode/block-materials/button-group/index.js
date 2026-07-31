import { createDefaultButtonGroupBlock } from '../defaults';
import converter from '../../visual-converters/lowcode-button-group';
import component from './index.vue';
export default {
    type: 'buttonGroup',
    label: '按钮组',
    component,
    designer: () => import('../../../packages/business-component/lowcode-button-group').then((module) => module.default),
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultButtonGroupBlock,
    converter,
    order: 55,
};
