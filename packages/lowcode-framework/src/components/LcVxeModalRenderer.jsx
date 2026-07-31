import { defineComponent, h, resolveComponent } from 'vue';
export default defineComponent({
    name: 'LcVxeModalRenderer',
    props: {
        modals: {
            type: Array,
            default: () => [],
        },
    },
    setup(props) {
        const VxeModal = resolveComponent('vxe-modal');
        return () => props.modals.map((modal) => {
            const slots = {};
            if (modal.body)
                slots.default = modal.body;
            if (modal.footer)
                slots.footer = modal.footer;
            return h(VxeModal, {
                key: modal.id,
                modelValue: modal.visible,
                title: modal.title,
                width: modal.width,
                height: modal.height,
                ...(modal.props ?? {}),
                'onUpdate:modelValue': (visible) => modal.onVisibleChange?.(visible),
                onClose: (...args) => modal.onClose?.(...args),
            }, slots);
        });
    },
});
