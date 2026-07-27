import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'vxe-tree-select',
  label: '树形选择',
  component,
  aliases: ['tree-select'],
  order: 80,
} satisfies LowCodeFormMaterial;
