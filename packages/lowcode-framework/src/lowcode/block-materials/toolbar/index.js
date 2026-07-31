import { createDefaultToolbarBlock } from '../defaults';
import component from './index.vue';
export default {
    type: 'toolbar',
    label: '工具栏',
    component,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultToolbarBlock,
    order: 50,
};
