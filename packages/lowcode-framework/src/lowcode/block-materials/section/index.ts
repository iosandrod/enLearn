import type { LowCodeBlockMaterial } from '../types';
import { createDefaultSectionBlock } from '../defaults';
import component from './index.vue';

export default {
  type: 'section',
  label: '分区',
  component,
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultSectionBlock,
  order: 20,
} satisfies LowCodeBlockMaterial;
