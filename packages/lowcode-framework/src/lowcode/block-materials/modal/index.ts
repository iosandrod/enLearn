import type { LowCodeBlockMaterial } from '../types';
import { createDefaultModalBlock } from '../defaults';
import component from './index.vue';

export default {
  type: 'modal',
  label: '弹框',
  component,
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultModalBlock,
  order: 100,
} satisfies LowCodeBlockMaterial;
