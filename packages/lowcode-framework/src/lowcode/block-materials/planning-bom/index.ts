import type { LowCodeBlockMaterial } from '../types';
import { createDefaultPlanningBomBlock } from '../defaults';
import converter from '../../visual-converters/planning-visual';
import component from './index.vue';

export default {
  type: 'planningBom',
  label: '工艺 BOM 树',
  component,
  designer: () =>
    import('../../../packages/business-component/planning-bom').then((module) => module.default),
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultPlanningBomBlock,
  converter,
  order: 160,
} satisfies LowCodeBlockMaterial;
