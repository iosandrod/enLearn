import type { LowCodeBlockMaterial } from '../types';
import { createDefaultPlanningGanttBlock } from '../defaults';
import converter from '../../visual-converters/planning-visual';
import component from './index.vue';

export default {
  type: 'planningGantt',
  label: '排产甘特图',
  component,
  designer: () =>
    import('../../../packages/business-component/planning-gantt').then((module) => module.default),
  materialVersion: '1.0.0',
  createDefaultBlock: createDefaultPlanningGanttBlock,
  converter,
  order: 150,
} satisfies LowCodeBlockMaterial;
