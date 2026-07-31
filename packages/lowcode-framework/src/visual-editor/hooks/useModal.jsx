/**
 * @name: useModal
 * @author: 卜启缘
 * @date: 2021/5/7 15:26
 * @description：useModal
 * @update: 2021/5/7 15:26
 */
import { defineComponent, reactive, createApp, getCurrentInstance, isVNode, } from 'vue';
import { ElButton, ElDialog } from '../components/common/designer-ui';
import { isFunction } from '../utils/is';
const Modal = defineComponent({
    props: {
        options: {
            type: Object,
            default: () => ({}),
        },
    },
    setup(props) {
        const instance = getCurrentInstance();
        const state = reactive({
            options: props.options,
            visible: true,
        });
        const methods = {
            service: (options) => {
                state.options = options;
                methods.show();
            },
            show: () => (state.visible = true),
            hide: () => (state.visible = false),
        };
        const handler = {
            onConfirm: async () => {
                await state.options.onConfirm?.();
                methods.hide();
            },
            onCancel: () => {
                state.options.onCancel?.();
                methods.hide();
            },
        };
        Object.assign(instance.proxy, methods);
        return () => (<ElDialog v-model={state.visible} title={state.options.title} destroyOnClose={true} {...state.options.props} onClose={handler.onCancel}>
        {{
                default: () => isVNode(state.options.content) ? (<content />) : isFunction(state.options.content) ? (state.options.content()) : null,
                footer: () => state.options.footer === null ? null : (<div>
                <ElButton {...{ onClick: handler.onCancel }}>取消</ElButton>
                <ElButton type={'primary'} {...{ onClick: handler.onConfirm }}>
                  确定
                </ElButton>
              </div>),
            }}
      </ElDialog>);
    },
});
export const useModal = (() => {
    let instance;
    return (options) => {
        if (instance) {
            instance.service(options);
            return instance;
        }
        const div = document.createElement('div');
        document.body.appendChild(div);
        const app = createApp(Modal, { options });
        instance = app.mount(div);
        return instance;
    };
})();
