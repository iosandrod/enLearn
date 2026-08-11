import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'base-info',
  label: '关联资料',
  component,
  order: 35,
} satisfies LowCodeFormMaterial;
