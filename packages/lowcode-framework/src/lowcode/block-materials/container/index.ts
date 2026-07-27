import type { LowCodeBlockMaterial } from '../types';
import { createDefaultContainerBlock } from '../defaults';
import component from './index.vue';

export default {
  type: 'container',
  label: '容器',
  component,
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultContainerBlock,
  order: 10,
} satisfies LowCodeBlockMaterial;
