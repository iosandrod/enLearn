import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'detail',
  label: '详情',
  component,
  order: 90,
} satisfies LowCodeBlockMaterial;
