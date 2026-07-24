import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'toolbar',
  label: '工具栏',
  component,
  order: 50,
} satisfies LowCodeBlockMaterial;
