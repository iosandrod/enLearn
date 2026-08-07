import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'lc-monaco-editor',
  label: '代码编辑器',
  component,
  aliases: ['monaco-editor'],
  order: 34,
} satisfies LowCodeFormMaterial;
