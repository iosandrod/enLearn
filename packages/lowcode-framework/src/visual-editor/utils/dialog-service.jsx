import { defineComponent, reactive, createApp, getCurrentInstance } from 'vue';
import { ElInput, ElDialog, ElButton } from '../components/common/designer-ui';
import { defer } from './defer';
var DialogServiceEditType;
(function (DialogServiceEditType) {
    DialogServiceEditType["textarea"] = "textarea";
    DialogServiceEditType["input"] = "input";
})(DialogServiceEditType || (DialogServiceEditType = {}));
const keyGenerator = (() => {
    let count = 0;
    return () => `auto_key_${count++}`;
})();
const ServiceComponent = defineComponent({
    name: 'DialogService',
    props: {
        option: { type: Object, required: true },
    },
    setup(props) {
        const ctx = getCurrentInstance();
        const state = reactive({
            option: props.option,
            editValue: null,
            showFlag: false,
            key: keyGenerator(),
        });
        const methods = {
            service: (option) => {
                state.option = option;
                state.editValue = option.editValue;
                state.key = keyGenerator();
                methods.show();
            },
            show: () => {
                state.showFlag = true;
            },
            hide: () => {
                state.showFlag = false;
            },
        };
        const handler = {
            onConfirm: () => {
                state.option.onConfirm(state.editValue);
                methods.hide();
            },
            onCancel: () => {
                methods.hide();
            },
        };
        Object.assign(ctx.proxy, methods);
        return () => (<>
        <ElDialog v-model={state.showFlag} title={state.option.title} key={state.key}>
          {{
                default: () => (<div>
                {state.option.editType === DialogServiceEditType.textarea ? (<ElInput type="textarea" {...{ rows: 10 }} v-model={state.editValue}/>) : (<ElInput v-model={state.editValue}/>)}
              </div>),
                footer: () => (<div>
                <ElButton {...{ onClick: handler.onCancel }}>取消</ElButton>
                <ElButton {...{ onClick: handler.onConfirm }}>确定</ElButton>
              </div>),
            }}
        </ElDialog>
      </>);
    },
});
const DialogService = (() => {
    let ins;
    return (option) => {
        if (!ins) {
            const el = document.createElement('div');
            document.body.appendChild(el);
            const app = createApp(ServiceComponent, { option });
            ins = app.mount(el);
        }
        ins.service(option);
    };
})();
export const $$dialog = Object.assign(DialogService, {
    input: (initValue, title, option) => {
        const dfd = defer();
        const opt = {
            ...option,
            editType: DialogServiceEditType.input,
            onConfirm: dfd.resolve,
            editValue: initValue,
            title,
        };
        DialogService(opt);
        return dfd.promise;
    },
    textarea: (initValue, title, option) => {
        const dfd = defer();
        const opt = {
            ...option,
            editType: DialogServiceEditType.textarea,
            onConfirm: dfd.resolve,
            editValue: initValue,
            title,
        };
        DialogService(opt);
        return dfd.promise;
    },
});
