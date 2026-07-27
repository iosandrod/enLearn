import type { LowCodeBlockMaterial } from '../types';
import { createDefaultTabsBlock } from '../defaults';
import converter from '../../visual-converters/vxe-tabs';
import component from './index.vue';

export default {
  type: 'tabs',
  label: '页签',
  component,
  designer: () =>
    import('../../../packages/container-component/vxe-tabs').then((module) => module.default),
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultTabsBlock,
  converter,
  order: 40,
} satisfies LowCodeBlockMaterial;
