import type { LowCodeFormMaterial } from '../types';
import component from './control';

export default {
  type: 'lc-basic-control',
  label: '基础数值控件',
  component,
  aliases: ['lc-rate', 'lc-slider', 'lc-stepper'],
  order: 32,
} satisfies LowCodeFormMaterial;
