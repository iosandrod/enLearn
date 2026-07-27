import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'lc-array-table',
  label: '数组表格',
  component,
  order: 35,
} satisfies LowCodeFormMaterial;
