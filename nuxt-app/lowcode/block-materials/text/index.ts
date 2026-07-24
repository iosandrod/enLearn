import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'text',
  label: '文本',
  component,
  order: 30,
} satisfies LowCodeBlockMaterial;
