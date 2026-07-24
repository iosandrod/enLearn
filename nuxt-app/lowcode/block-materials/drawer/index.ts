import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'drawer',
  label: '抽屉',
  component,
  order: 110,
} satisfies LowCodeBlockMaterial;
