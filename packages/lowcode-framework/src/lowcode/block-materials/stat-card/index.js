import { createDefaultStatCardBlock } from '../defaults';
import component from './index.vue';
export default {
    type: 'statCard',
    label: '统计卡',
    component,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultStatCardBlock,
    aliases: ['stat-card'],
    order: 120,
};
