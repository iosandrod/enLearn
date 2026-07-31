import { createDefaultFormBlock } from '../defaults';
import converter from '../../visual-converters/lowcode-edit-form';
import component from './index.vue';
export default {
    type: 'form',
    label: '普通表单',
    component,
    designer: () => import('../../../packages/business-component/lowcode-edit-form').then((module) => module.default),
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultFormBlock,
    converter,
    order: 60,
};
