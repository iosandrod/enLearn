import type { LowCodeBlockMaterial } from '../types';
import { createDefaultTextBlock } from '../defaults';
import component from './index.vue';

export default {
  type: 'text',
  label: '文本',
  component,
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultTextBlock,
  order: 30,
} satisfies LowCodeBlockMaterial;
