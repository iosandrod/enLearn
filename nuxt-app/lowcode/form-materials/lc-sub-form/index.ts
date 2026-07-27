import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'lc-sub-form',
  label: '子表单',
  component,
  order: 34,
} satisfies LowCodeFormMaterial;
