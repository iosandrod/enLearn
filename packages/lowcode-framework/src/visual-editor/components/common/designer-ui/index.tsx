import {
  Fragment,
  computed,
  defineComponent,
  h,
  type PropType,
  type VNode
} from 'vue';
import VxeUI, {
  VxeAlert,
  VxeButton,
  VxeCard,
  VxeCascader,
  VxeCheckbox,
  VxeCheckboxGroup,
  VxeCollapse,
  VxeCollapsePane,
  VxeColorPicker,
  VxeCol,
  VxeEmpty,
  VxeForm,
  VxeFormItem,
  VxeInput,
  VxeModal,
  VxeNumberInput,
  VxeOption,
  VxeRadio,
  VxeRadioGroup,
  VxeRow,
  VxeSelect,
  VxeSwitch,
  VxeTabPane,
  VxeTabs,
  VxeTag,
  VxeTextarea,
  VxeTooltip,
  VxeUpload
} from 'vxe-pc-ui';
import { VxeColumn, VxeGrid, VxeTable } from 'vxe-table';

type MessageType = 'success' | 'error' | 'warning' | 'info';
type MessageOptions = Record<string, unknown> & {
  type?: MessageType;
  message?: string;
};

function classNames(...values: unknown[]) {
  return values
    .flatMap((value) => {
      if (!value) return [];
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value;
      if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([name]) => name);
      }
      return [];
    })
    .join(' ');
}

function flattenVNodes(nodes: unknown): VNode[] {
  const result: VNode[] = [];
  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const vnode = node as VNode;
    if (vnode.type === Fragment && Array.isArray(vnode.children)) {
      vnode.children.forEach(visit);
      return;
    }
    result.push(vnode);
  };
  visit(nodes);
  return result;
}

function readOptionsFromSlot(slotValue: unknown) {
  return flattenVNodes(slotValue)
    .filter((node) => node.props)
    .map((node) => ({
      label: node.props?.label ?? node.children ?? node.props?.value ?? '',
      value: node.props?.value,
      disabled: Boolean(node.props?.disabled)
    }));
}

function resolveStatus(type?: string) {
  if (type === 'danger') return 'error';
  if (type === 'warning') return 'warning';
  if (type === 'success') return 'success';
  if (type === 'primary') return 'primary';
  return undefined;
}

function renderIcon(icon: unknown) {
  if (!icon) return null;
  if (typeof icon === 'string') return <i class={icon} aria-hidden="true" />;
  return h(icon as any);
}

function showMessage(status: MessageType, message: string) {
  const modal = (VxeUI as any).modal;
  if (modal?.message) {
    modal.message({
      content: message,
      status
    });
    return;
  }

  console[status === 'error' ? 'error' : status === 'warning' ? 'warn' : 'log'](message);
}

export const ElMessage = Object.assign(
  (option: string | MessageOptions) => {
    if (typeof option === 'string') {
      showMessage('info', option);
      return;
    }
    showMessage(option.type ?? 'info', option.message ?? '');
  },
  {
    success: (message: string) => showMessage('success', message),
    error: (message: string) => showMessage('error', message),
    warning: (message: string) => showMessage('warning', message),
    info: (message: string) => showMessage('info', message)
  }
);

export const ElMessageBox = {
  async prompt(message = '', title = '', options: Record<string, unknown> & { inputValue?: string } = {}) {
    const value = typeof window === 'undefined'
      ? options.inputValue ?? ''
      : window.prompt(`${title ? `${title}\n` : ''}${message}`, options.inputValue ?? '');

    if (value === null) {
      return Promise.reject(new Error('cancel'));
    }

    return { value };
  }
};

export const ElButton = defineComponent({
  name: 'LcVxeButtonAdapter',
  props: {
    type: String,
    disabled: Boolean,
    plain: Boolean,
    text: Boolean,
    circle: Boolean,
    icon: [String, Object, Function] as PropType<unknown>,
    title: String
  },
  emits: ['click'],
  setup(props, { attrs, slots, emit }) {
    return () =>
      h(
        VxeButton as any,
        {
          ...attrs,
          class: classNames(attrs.class, 'lc-vxe-button-adapter', { 'is-circle': props.circle }),
          status: resolveStatus(props.type),
          mode: props.text ? 'text' : 'button',
          disabled: props.disabled,
          title: props.title,
          onClick: (params: unknown) => emit('click', params)
        },
        {
          default: () => (
            <>
              {renderIcon(props.icon)}
              {slots.default?.()}
            </>
          )
        }
      );
  }
});

export const ElInput: any = defineComponent({
  name: 'LcVxeInputAdapter',
  inheritAttrs: false,
  props: {
    modelValue: [String, Number, Boolean] as PropType<string | number | boolean | undefined>,
    type: {
      type: String,
      default: 'text'
    },
    rows: {
      type: [String, Number],
      default: 3
    },
    placeholder: String,
    disabled: Boolean,
    readonly: Boolean,
    clearable: Boolean
  },
  emits: ['update:modelValue', 'change', 'input'],
  setup(props, { attrs, slots, emit }) {
    const update = (value: unknown) => {
      emit('update:modelValue', value);
      emit('input', value);
      emit('change', value);
    };

    return () => {
      const controlProps = {
        ...attrs,
        class: classNames(attrs.class, 'lc-vxe-input-adapter'),
        modelValue: props.modelValue as any,
        placeholder: props.placeholder,
        disabled: props.disabled,
        readonly: props.readonly,
        clearable: props.clearable,
        onUpdateModelValue: update,
        'onUpdate:modelValue': update
      } as any;

      const control = props.type === 'textarea'
        ? h(VxeTextarea as any, {
            ...controlProps,
            rows: Number(props.rows) || 3
          })
        : h(VxeInput as any, {
            ...controlProps,
            type: props.type === 'number' ? 'number' : props.type
          });

      if (!slots.prepend) return control;

      return (
        <div class="lc-vxe-input-group">
          <div class="lc-vxe-input-group__prepend">{slots.prepend()}</div>
          {control}
        </div>
      );
    };
  }
});

export const ElInputNumber = defineComponent({
  name: 'LcVxeNumberInputAdapter',
  props: {
    modelValue: [Number, String] as PropType<number | string | undefined>,
    min: Number,
    max: Number,
    step: Number,
    disabled: Boolean
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, emit }) {
    const update = (value: unknown) => {
      emit('update:modelValue', value);
      emit('change', value);
    };

    return () =>
      h(VxeNumberInput as any, {
          ...attrs,
          class: classNames(attrs.class, 'lc-vxe-number-input-adapter'),
          modelValue: props.modelValue,
          min: props.min,
          max: props.max,
          step: props.step,
          disabled: props.disabled,
          onUpdateModelValue: update,
          'onUpdate:modelValue': update
        } as any);
  }
});

export const ElColorPicker = VxeColorPicker as any;
export const ElSwitch = VxeSwitch as any;
export const ElOption = VxeOption as any;

export const ElSelect: any = defineComponent({
  name: 'LcVxeSelectAdapter',
  props: {
    modelValue: [String, Number, Boolean, Array, Object] as PropType<unknown>,
    multiple: Boolean,
    placeholder: String,
    disabled: Boolean,
    options: Array as PropType<Array<Record<string, unknown>>>
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, slots, emit }) {
    const update = (value: unknown) => {
      emit('update:modelValue', value);
      emit('change', value);
    };

    return () =>
      h(
        VxeSelect as any,
        {
          ...attrs,
          class: classNames(attrs.class, 'lc-vxe-select-adapter'),
          modelValue: props.modelValue,
          options: props.options || readOptionsFromSlot(slots.default?.()),
          multiple: props.multiple,
          placeholder: props.placeholder,
          disabled: props.disabled,
          onUpdateModelValue: update,
          'onUpdate:modelValue': update
        } as any,
        props.options ? undefined : slots
      );
  }
});

export const ElCascader = defineComponent({
  name: 'LcVxeCascaderAdapter',
  props: {
    modelValue: [String, Number, Array] as PropType<unknown>,
    options: {
      type: Array as PropType<unknown[]>,
      default: () => []
    },
    props: {
      type: Object as PropType<Record<string, unknown>>,
      default: () => ({})
    },
    clearable: Boolean,
    placeholder: String,
    disabled: Boolean
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, emit }) {
    const update = (value: unknown) => {
      emit('update:modelValue', value);
      emit('change', value);
    };

    return () =>
      h(VxeCascader as any, {
          ...attrs,
          class: classNames(attrs.class, 'lc-vxe-cascader-adapter'),
          modelValue: props.modelValue,
          options: props.options,
          optionProps: props.props,
          clearable: props.clearable,
          placeholder: props.placeholder,
          disabled: props.disabled,
          onUpdateModelValue: update,
          'onUpdate:modelValue': update
        } as any);
  }
});

export const ElForm: any = defineComponent({
  name: 'LcVxeFormAdapter',
  props: {
    model: Object as PropType<Record<string, unknown>>,
    rules: Object,
    labelPosition: String,
    labelWidth: [String, Number],
    size: String
  },
  setup(props, { attrs, slots, expose }) {
    const formRef = { value: null as any };
    expose({
      validate: (callback?: (valid: boolean) => void) => {
        const result = formRef.value?.validate?.();
        if (result?.then) {
          return result
            .then(() => {
              callback?.(true);
              return true;
            })
            .catch(() => {
              callback?.(false);
              return false;
            });
        }
        callback?.(true);
        return Promise.resolve(true);
      },
      clearValidate: (...args: unknown[]) => formRef.value?.clearValidate?.(...args),
      resetFields: (...args: unknown[]) => formRef.value?.reset?.(...args)
    });

    return () =>
      h(
        VxeForm as any,
        {
          ...attrs,
          ref: (vm: unknown) => (formRef.value = vm),
          class: classNames(attrs.class, 'lc-vxe-form-adapter'),
          data: props.model,
          rules: props.rules,
          titleWidth: props.labelWidth,
          vertical: props.labelPosition === 'top',
          customLayout: true
        },
        slots
      );
  }
});

export const ElFormItem = defineComponent({
  name: 'LcVxeFormItemAdapter',
  props: {
    label: [String, Number],
    prop: String,
    labelWidth: [String, Number],
    rules: [Array, Object],
    showMessage: Boolean
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        VxeFormItem as any,
        {
          ...attrs,
          class: classNames(attrs.class, 'lc-vxe-form-item-adapter'),
          title: props.label,
          field: props.prop,
          titleWidth: props.labelWidth,
          rules: props.rules,
          showMessage: props.showMessage
        },
        slots
      );
  }
});

export const ElDialog = defineComponent({
  name: 'LcVxeModalAdapter',
  props: {
    modelValue: Boolean,
    title: String,
    width: [String, Number],
    top: String,
    appendToBody: Boolean,
    closeOnClickModal: Boolean,
    destroyOnClose: Boolean,
    fullscreen: Boolean
  },
  emits: ['update:modelValue', 'close', 'closed'],
  setup(props, { attrs, slots, emit }) {
    const hide = () => {
      emit('update:modelValue', false);
      emit('close');
      emit('closed');
    };
    const modalClassName = classNames(attrs.class, attrs.className);

    return () =>
      h(
        VxeModal as any,
        {
          ...attrs,
          class: modalClassName,
          className: modalClassName,
          modelValue: props.modelValue,
          title: props.title,
          width: props.width,
          top: props.top,
          maskClosable: props.closeOnClickModal !== false,
          destroyOnClose: props.destroyOnClose,
          fullscreen: props.fullscreen,
          transfer: props.appendToBody !== false,
          showFooter: Boolean(slots.footer),
          'onUpdate:modelValue': (value: boolean) => emit('update:modelValue', value),
          onClose: hide
        } as any,
        {
          default: () => slots.default?.(),
          footer: () => slots.footer?.()
        }
      );
  }
});

export const ElTabs = defineComponent({
  name: 'LcVxeTabsAdapter',
  props: {
    modelValue: [String, Number] as PropType<string | number | undefined>,
    stretch: Boolean,
    type: String,
    tabPosition: String
  },
  emits: ['update:modelValue', 'tab-change'],
  setup(props, { attrs, slots, emit }) {
    return () =>
      h(
        VxeTabs as any,
        {
          ...attrs,
          class: classNames(attrs.class, 'lc-vxe-tabs-adapter', { 'is-stretch': props.stretch }),
          modelValue: props.modelValue,
          type: props.type === 'border-card' ? 'card' : props.type,
          position: props.tabPosition,
          'onUpdate:modelValue': (value: string | number) => {
            emit('update:modelValue', value);
            emit('tab-change', value);
          }
        } as any,
        slots
      );
  }
});

export const ElTabPane = defineComponent({
  name: 'LcVxeTabPaneAdapter',
  props: {
    label: [String, Number],
    name: [String, Number],
    lazy: Boolean
  },
  setup(props, { slots }) {
    return () =>
      h(
        VxeTabPane as any,
        { title: props.label, name: props.name, preload: !props.lazy },
        slots
      );
  }
});

export const ElCollapse = VxeCollapse as any;
export const ElCollapseItem = defineComponent({
  name: 'LcVxeCollapsePaneAdapter',
  props: {
    title: [String, Number],
    name: [String, Number]
  },
  setup(props, { attrs, slots }) {
    return () => h(VxeCollapsePane as any, { ...attrs, title: props.title, name: props.name }, slots);
  }
});

export const ElCard = VxeCard as any;
export const ElTooltip = VxeTooltip as any;

export const ElPopconfirm = defineComponent({
  name: 'LcVxePopconfirmAdapter',
  props: {
    title: String,
    confirmButtonText: String,
    cancelButtonText: String
  },
  emits: ['confirm', 'cancel'],
  setup(props, { slots, emit }) {
    return () => (
      <span
        class="lc-vxe-popconfirm-adapter"
        onClick={async (event) => {
          event.stopPropagation();
          const modal = (VxeUI as any).modal;
          const result = modal?.confirm
            ? await modal.confirm(props.title || '确定执行此操作？', '确认')
            : window.confirm(props.title || '确定执行此操作？')
              ? 'confirm'
              : 'cancel';
          if (result === 'confirm') emit('confirm');
          else emit('cancel');
        }}
      >
        {slots.reference ? slots.reference() : slots.default?.()}
      </span>
    );
  }
});

export const ElIcon = defineComponent({
  name: 'LcRemixIconSlot',
  props: {
    size: [String, Number],
    color: String
  },
  setup(props, { attrs, slots }) {
    return () => (
      <span
        {...attrs}
        class={classNames(attrs.class, 'lc-remix-icon-slot')}
        style={{
          fontSize: typeof props.size === 'number' ? `${props.size}px` : props.size,
          color: props.color
        }}
      >
        {slots.default?.()}
      </span>
    );
  }
});

export const ElEmpty = VxeEmpty as any;
export const ElAlert = VxeAlert as any;
export const ElRow = VxeRow as any;
export const ElCol = VxeCol as any;
export const ElTag = VxeTag as any;
export const ElRadio = VxeRadio as any;
export const ElRadioGroup = VxeRadioGroup as any;
export const ElCheckbox = VxeCheckbox as any;
export const ElCheckboxGroup = VxeCheckboxGroup as any;
export const ElUpload = VxeUpload as any;

export const ElTableColumn = defineComponent({
  name: 'LcVxeColumnAdapter',
  props: {
    label: [String, Number],
    prop: String,
    field: String,
    type: String,
    width: [String, Number],
    minWidth: [String, Number],
    fixed: [String, Boolean],
    align: String
  },
  setup(props, { slots }) {
    const fixed = computed(() =>
      props.fixed ? (props.fixed === true ? 'left' : props.fixed) : undefined
    );

    return () =>
      h(
        VxeColumn as any,
        {
          type: props.type,
          field: props.prop || props.field,
          title: props.label,
          width: props.width,
          minWidth: props.minWidth,
          fixed: fixed.value,
          align: props.align
        },
        slots
      );
  }
});

export const ElTable = defineComponent({
  name: 'LcVxeTableAdapter',
  props: {
    data: {
      type: Array as PropType<Record<string, unknown>[]>,
      default: () => []
    },
    height: [String, Number],
    rowKey: String,
    border: Boolean
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        VxeTable as any,
        {
          ...attrs,
          class: classNames(attrs.class, 'lc-vxe-table-adapter'),
          data: props.data,
          height: props.height,
          rowConfig: { keyField: props.rowKey },
          border: props.border
        },
        slots
      );
  }
});

export const ElGrid = VxeGrid as any;

export default {
  install(app: { use: (plugin: unknown) => void }) {
    app.use(VxeUI as any);
  }
};
