import type { LowCodeBlockMaterial } from '../types';
import { createDefaultPlanningFlowBlock } from '../defaults';
import converter from '../../visual-converters/planning-visual';
import component from './index.vue';

export default {
  type: 'planningFlow',
  label: '工艺路线图',
  component,
  designer: () =>
    import('../../../packages/business-component/planning-flow').then((module) => module.default),
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultPlanningFlowBlock,
  converter,
  order: 140,
} satisfies LowCodeBlockMaterial;
