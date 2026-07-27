import type { LowCodeBlockMaterial } from '../types';
import { createDefaultGridBlock } from '../defaults';
import converter from '~/lowcode/visual-converters/lowcode-grid';
import component from './index.vue';

export default {
  type: 'grid',
  label: '表格',
  component,
  designer: () =>
    import('~/packages/business-component/lowcode-grid').then((module) => module.default),
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultGridBlock,
  converter,
  order: 80,
} satisfies LowCodeBlockMaterial;
