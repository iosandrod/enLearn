import type { LowCodeBlockMaterial } from '../types';
import { createDefaultSearchFormBlock } from '../defaults';
import converter from '~/lowcode/visual-converters/lowcode-search-form';
import component from './index.vue';

export default {
  type: 'searchForm',
  label: '查询表单',
  component,
  designer: () =>
    import('~/packages/business-component/lowcode-search-form').then((module) => module.default),
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultSearchFormBlock,
  converter,
  aliases: ['search-form'],
  order: 70,
} satisfies LowCodeBlockMaterial;
