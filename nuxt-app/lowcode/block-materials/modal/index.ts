import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'modal',
  label: '弹框',
  component,
  order: 100,
} satisfies LowCodeBlockMaterial;
