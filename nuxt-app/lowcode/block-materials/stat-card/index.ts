import type { LowCodeBlockMaterial } from '../types';
import component from './index.vue';

export default {
  type: 'statCard',
  label: '统计卡',
  component,
  aliases: ['stat-card'],
  order: 120,
} satisfies LowCodeBlockMaterial;
