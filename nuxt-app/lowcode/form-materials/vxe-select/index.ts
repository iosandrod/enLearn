import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'vxe-select',
  label: '下拉选择',
  component,
  aliases: ['select'],
  order: 50,
} satisfies LowCodeFormMaterial;
