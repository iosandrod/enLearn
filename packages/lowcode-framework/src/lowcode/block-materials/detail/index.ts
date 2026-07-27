import type { LowCodeBlockMaterial } from '../types';
import { createDefaultDetailBlock } from '../defaults';
import component from './index.vue';

export default {
  type: 'detail',
  label: '详情',
  component,
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultDetailBlock,
  order: 90,
} satisfies LowCodeBlockMaterial;
