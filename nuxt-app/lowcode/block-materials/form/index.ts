import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'form',
  label: '表单',
  component,
  order: 60,
} satisfies LowCodeBlockMaterial;
