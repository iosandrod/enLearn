import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'container',
  label: '容器',
  component,
  order: 10,
} satisfies LowCodeBlockMaterial;
