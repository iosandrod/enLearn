import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'lc-number-input',
  label: '数字输入',
  component,
  order: 31,
} satisfies LowCodeFormMaterial;
