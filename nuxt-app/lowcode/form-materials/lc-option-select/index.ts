import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'lc-option-select',
  label: '选项选择',
  component,
  order: 34,
} satisfies LowCodeFormMaterial;
