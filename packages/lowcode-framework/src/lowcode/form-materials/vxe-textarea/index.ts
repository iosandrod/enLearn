import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'vxe-textarea',
  label: '多行文本',
  component,
  aliases: ['textarea'],
  order: 20,
} satisfies LowCodeFormMaterial;
