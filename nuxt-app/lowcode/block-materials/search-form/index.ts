import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'searchForm',
  label: '查询表单',
  component,
  aliases: ['search-form'],
  order: 70,
} satisfies LowCodeBlockMaterial;
