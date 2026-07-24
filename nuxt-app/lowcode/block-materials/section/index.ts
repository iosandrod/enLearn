import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'section',
  label: '分区',
  component,
  order: 20,
} satisfies LowCodeBlockMaterial;
