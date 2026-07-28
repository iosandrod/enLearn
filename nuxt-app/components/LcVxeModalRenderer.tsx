import { defineComponent, h, type PropType, type VNodeChild } from 'vue';

export type LcVxeModalRender = () => VNodeChild;

export type LcVxeModalConfig = {
  id: string;
  visible: boolean;
  title?: string;
  width?: string | number;
  height?: string | number;
  props?: Record<string, unknown>;
  body?: LcVxeModalRender;
  footer?: LcVxeModalRender;
  onVisibleChange?: (visible: boolean) => void;
  onClose?: (...args: unknown[]) => void;
};

export default defineComponent({
  name: 'LcVxeModalRenderer',
  props: {
    modals: {
      type: Array as PropType<LcVxeModalConfig[]>,
      default: () => [],
    },
  },
  setup(props) {
    return () =>
      props.modals.map((modal) => {
        const slots: Record<string, LcVxeModalRender> = {};
        if (modal.body) slots.default = modal.body;
        if (modal.footer) slots.footer = modal.footer;

        return h(
          'vxe-modal',
          {
            key: modal.id,
            modelValue: modal.visible,
            title: modal.title,
            width: modal.width,
            height: modal.height,
            ...(modal.props ?? {}),
            'onUpdate:modelValue': (visible: boolean) => modal.onVisibleChange?.(visible),
            onClose: (...args: unknown[]) => modal.onClose?.(...args),
          },
          slots,
        );
      });
  },
});
