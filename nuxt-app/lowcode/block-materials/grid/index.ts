import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'grid',
  label: '表格',
  component,
  order: 80,
} satisfies LowCodeBlockMaterial;
