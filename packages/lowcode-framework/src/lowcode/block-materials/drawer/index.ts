import type { LowCodeBlockMaterial } from '../types';
import { createDefaultDrawerBlock } from '../defaults';
import component from './index.vue';

export default {
  type: 'drawer',
  label: '抽屉',
  component,
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultDrawerBlock,
  order: 110,
} satisfies LowCodeBlockMaterial;
