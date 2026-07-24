import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'tree',
  label: '树',
  component,
  order: 130,
} satisfies LowCodeBlockMaterial;
