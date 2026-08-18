import { createApp, defineComponent, getCurrentInstance, PropType, reactive, ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import DesignerUI, { ElButton, ElDialog } from '../common/designer-ui';
import VisualEditorProvider from '../../../components/VisualEditorProvider.vue';
import type {
  VisualEditorBlockData,
  VisualEditorModelValue,
  VisualEditorPage,
} from '../../visual-editor.utils';
import { defer } from '../../utils/defer';

export type ModalDesignerResult = {
  designerModel: VisualEditorModelValue;
  blocks: VisualEditorBlockData[];
  overlays: VisualEditorBlockData[];
};

interface ModalDesignerServiceOption {
  title?: string;
  blocks?: VisualEditorBlockData[];
  overlays?: VisualEditorBlockData[];
  onConfirm: (value: ModalDesignerResult) => void;
  onCancel?: () => void;
}

type ModalProviderInstance = {
  getSnapshot: () => {
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  };
};

const defaultActions: VisualEditorModelValue['actions'] = {
  fetch: {
    name: '接口请求',
    apis: [],
  },
  dialog: {
    name: '对话框',
    handlers: [],
  },
};

function createInitialData(option: ModalDesignerServiceOption): VisualEditorModelValue {
  return {
    pages: {
      '/': {
        title: option.title || '弹框内容',
        path: '/',
        config: {
          bgColor: '',
          bgImage: '',
          keepAlive: false,
        },
        blocks: cloneDeep(option.blocks ?? []),
        overlays: cloneDeep(option.overlays ?? []),
      },
    },
    models: [],
    actions: cloneDeep(defaultActions),
  };
}

const ServiceComponent = defineComponent({
  props: {
    option: {
      type: Object as PropType<ModalDesignerServiceOption>,
      required: true,
    },
  },
  setup(props) {
    const ctx = getCurrentInstance()!;
    const providerRef = ref<ModalProviderInstance | null>(null);
    const state = reactive({
      showFlag: false,
      providerKey: 0,
      option: props.option,
      initialData: createInitialData(props.option),
    });

    const methods = {
      service: async (option: ModalDesignerServiceOption) => {
        state.option = option;
        state.initialData = createInitialData(option);
        state.providerKey += 1;
        state.showFlag = true;
      },
      hide: () => {
        state.showFlag = false;
      },
    };

    const handler = {
      onConfirm: () => {
        const snapshot = providerRef.value?.getSnapshot();
        if (!snapshot) return;

        state.option.onConfirm({
          designerModel: snapshot.model,
          blocks: cloneDeep(snapshot.currentPage.blocks),
          overlays: cloneDeep(snapshot.currentPage.overlays ?? []),
        });
        methods.hide();
      },
      onCancel: () => {
        state.option.onCancel?.();
        methods.hide();
      },
    };

    Object.assign(ctx.proxy!, methods);

    return () => (
      <ElDialog
        v-model={state.showFlag}
        title={state.option.title || '弹框设计'}
        width="min(1360px, calc(100vw - 40px))"
        top="3vh"
        destroyOnClose={true}
        onClose={handler.onCancel}
      >
        {{
          default: () => (
            <div
              style={{
                height: 'min(760px, calc(100vh - 180px))',
                minHeight: '520px',
                border: '1px solid #d8e0ea',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#eef3f8',
              }}
            >
              <VisualEditorProvider
                key={state.providerKey}
                ref={providerRef}
                initialData={state.initialData}
                initialPath="/"
                showHeader={false}
                leftExcludeLabels={['页面']}
                leftWidth="320px"
                allowFormDesign={true}
                showPageSetting={false}
                workbenchMode="page"
                persistToSession={false}
                showGlobalDialogHost={false}
              />
            </div>
          ),
          footer: () => (
            <div>
              <ElButton onClick={handler.onCancel}>取消</ElButton>
              <ElButton type="primary" onClick={handler.onConfirm}>
                确定
              </ElButton>
            </div>
          ),
        }}
      </ElDialog>
    );
  },
});

export const $$modalDesigner = (option: Omit<ModalDesignerServiceOption, 'onConfirm'>) => {
  const dfd = defer<ModalDesignerResult>();
  const el = document.createElement('div');
  document.body.appendChild(el);

  const app = createApp(ServiceComponent, {
    option: {
      ...option,
      onConfirm: () => undefined,
    },
  });
  app.use(DesignerUI);
  app.config.globalProperties.$$refs = {};

  const cleanup = () => {
    window.setTimeout(() => {
      app.unmount();
      el.remove();
    }, 0);
  };

  const ins = app.mount(el) as unknown as {
    service: (option: ModalDesignerServiceOption) => Promise<void>;
  };

  ins.service({
    ...option,
    onCancel: cleanup,
    onConfirm: (value) => {
      dfd.resolve(value);
      cleanup();
    },
  });

  return dfd.promise;
};
