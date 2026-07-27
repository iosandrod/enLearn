import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'vxe-switch',
  label: '开关',
  component,
  aliases: ['switch'],
  order: 40,
} satisfies LowCodeFormMaterial;
