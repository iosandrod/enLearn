import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'lc-json-editor',
  label: 'JSON 编辑器',
  component,
  order: 33,
} satisfies LowCodeFormMaterial;
