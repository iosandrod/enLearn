import type { LowCodeBlockMaterial } from '../types';
import { createDefaultTreeBlock } from '../defaults';
import component from './index.vue';

export default {
  type: 'tree',
  label: '树',
  component,
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultTreeBlock,
  order: 130,
} satisfies LowCodeBlockMaterial;
