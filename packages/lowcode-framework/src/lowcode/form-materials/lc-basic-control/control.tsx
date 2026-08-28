import { defineComponent, h } from 'vue';
import { Rate, Slider, Stepper } from '../../../components/LegacyWidgets';

const controls = {
  'lc-rate': Rate,
  'lc-slider': Slider,
  'lc-stepper': Stepper,
};

export default defineComponent({
  name: 'LcBasicControl',
  props: {
    field: { type: Object, required: true },
    modelValue: null,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      const component = controls[props.field.component as keyof typeof controls] ?? Stepper;
      return h(component, {
        ...(props.field.props ?? {}),
        modelValue: props.modelValue,
        'onUpdate:modelValue': (value: unknown) => emit('update:modelValue', value),
      });
    };
  },
}) as unknown as import('vue').Component;
