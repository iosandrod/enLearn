import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'lc-color-picker',
  label: '颜色选择',
  component,
  order: 32,
} satisfies LowCodeFormMaterial;
