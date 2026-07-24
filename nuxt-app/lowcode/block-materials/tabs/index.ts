import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'tabs',
  label: '页签',
  component,
  order: 40,
} satisfies LowCodeBlockMaterial;
