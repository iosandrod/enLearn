import type { LowCodeFormMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'vxe-checkbox-group',
  label: '复选框组',
  component,
  aliases: ['checkbox', 'checkbox-group'],
  order: 60,
} satisfies LowCodeFormMaterial;
