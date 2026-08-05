import { computed, defineComponent } from 'vue';

type AnyRecord = Record<string, any>;

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readModel(attrs: AnyRecord) {
  return attrs.modelValue ?? attrs.value ?? '';
}

function emitModel(
  emit: (event: string, ...args: any[]) => void,
  value: unknown
) {
  emit('update:modelValue', value);
  emit('change', value);
}

function renderDefault(slots: AnyRecord, fallback?: unknown) {
  return slots.default?.() ?? fallback;
}

function statusColor(type: unknown) {
  switch (type) {
    case 'primary':
      return '#2563eb';
    case 'success':
      return '#16a34a';
    case 'warning':
      return '#d97706';
    case 'danger':
      return '#dc2626';
    default:
      return '#475569';
  }
}

export const Field: any = defineComponent({
  name: 'LcField',
  inheritAttrs: false,
  emits: ['update:modelValue', 'change', 'click', 'focus', 'blur', 'clear'],
  setup(_, { attrs, slots, emit }) {
    return () => {
      const fieldAttrs = attrs as AnyRecord;
      const label = fieldAttrs.label;
      const inputSlot = slots.input?.();
      const type = fieldAttrs.type === 'textarea' ? 'textarea' : 'input';
      const controlProps: AnyRecord = {
        value: readModel(fieldAttrs),
        type: fieldAttrs.type === 'password' ? 'password' : 'text',
        placeholder: fieldAttrs.placeholder,
        readonly: fieldAttrs.readonly,
        disabled: fieldAttrs.disabled,
        style: {
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          border: '1px solid #d8e0ea',
          borderRadius: '4px',
          padding: '6px 8px',
          background: fieldAttrs.disabled ? '#f1f5f9' : '#fff'
        },
        onInput: (event: Event) =>
          emitModel(
            emit,
            (event.target as HTMLInputElement | HTMLTextAreaElement).value
          ),
        onFocus: (event: FocusEvent) => emit('focus', event),
        onBlur: (event: FocusEvent) => emit('blur', event)
      };
      const control = inputSlot ? (
        inputSlot
      ) : type === 'textarea' ? (
        <textarea {...controlProps} />
      ) : (
        <input {...controlProps} />
      );

      return (
        <label
          class={['lc-legacy-field', fieldAttrs.class]}
          style={{
            display: 'grid',
            width: '100%',
            minWidth: 0,
            gap: '6px',
            color: '#334155',
            fontSize: '13px',
            ...(fieldAttrs.style as AnyRecord)
          }}
          onClick={(event: MouseEvent) => emit('click', event)}
        >
          {label ? (
            <span
              style={{ fontSize: '12px', fontWeight: 600, lineHeight: '18px' }}
            >
              {fieldAttrs.required ? (
                <span style={{ color: '#dc2626' }}>* </span>
              ) : null}
              {label}
            </span>
          ) : null}
          <div style={{ minWidth: 0, width: '100%' }}>{control}</div>
        </label>
      );
    };
  }
});

export const Button: any = defineComponent({
  name: 'LcButton',
  inheritAttrs: false,
  emits: ['click', 'touchstart'],
  setup(_, { attrs, slots, emit }) {
    return () => {
      const buttonAttrs = attrs as AnyRecord;
      const color = buttonAttrs.color || statusColor(buttonAttrs.type);
      const plain = buttonAttrs.plain === true;
      return (
        <button
          {...buttonAttrs}
          type={
            buttonAttrs['native-type'] || buttonAttrs.nativeType || 'button'
          }
          disabled={buttonAttrs.disabled || buttonAttrs.loading}
          style={{
            display: buttonAttrs.block ? 'flex' : 'inline-flex',
            width: buttonAttrs.block ? '100%' : undefined,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: buttonAttrs.size === 'large' ? '40px' : '32px',
            padding: buttonAttrs.size === 'mini' ? '2px 8px' : '6px 14px',
            border: `1px solid ${color}`,
            borderRadius: buttonAttrs.round
              ? '999px'
              : buttonAttrs.square
                ? '0'
                : '4px',
            background: plain ? '#fff' : color,
            color: plain ? color : '#fff',
            cursor: buttonAttrs.disabled ? 'not-allowed' : 'pointer',
            opacity: buttonAttrs.disabled ? 0.6 : 1,
            ...(buttonAttrs.style as AnyRecord)
          }}
          onClick={(event: MouseEvent) => emit('click', event)}
          onTouchstart={(event: TouchEvent) => emit('touchstart', event)}
        >
          {renderDefault(
            slots,
            buttonAttrs.loading
              ? buttonAttrs['loading-text'] || 'Loading'
              : buttonAttrs.text
          )}
        </button>
      );
    };
  }
});

export const Form: any = defineComponent({
  name: 'LcForm',
  inheritAttrs: false,
  emits: ['submit', 'failed'],
  setup(_, { attrs, slots, emit }) {
    return () => (
      <form
        {...(attrs as AnyRecord)}
        onSubmit={(event: Event) => {
          event.preventDefault();
          emit('submit', {});
        }}
      >
        {renderDefault(slots)}
      </form>
    );
  }
});

export const Row: any = defineComponent({
  name: 'LcRow',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <div
        {...(attrs as AnyRecord)}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          width: '100%',
          gap: attrs.gutter ? `${Number(attrs.gutter) || 0}px` : undefined,
          alignItems:
            attrs.align === 'center'
              ? 'center'
              : attrs.align === 'bottom'
                ? 'flex-end'
                : 'flex-start',
          justifyContent:
            attrs.justify === 'end'
              ? 'flex-end'
              : attrs.justify === 'center'
                ? 'center'
                : (attrs.justify as any),
          ...(attrs.style as AnyRecord)
        }}
      >
        {renderDefault(slots)}
      </div>
    );
  }
});

export const Col: any = defineComponent({
  name: 'LcCol',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => {
      const span = Math.min(24, Math.max(1, Number(attrs.span) || 24));
      return (
        <div
          {...(attrs as AnyRecord)}
          style={{
            position: 'relative',
            flex: `0 0 ${(span / 24) * 100}%`,
            maxWidth: `${(span / 24) * 100}%`,
            minWidth: 0,
            boxSizing: 'border-box',
            ...(attrs.style as AnyRecord)
          }}
        >
          {renderDefault(slots)}
        </div>
      );
    };
  }
});

export const Switch: any = defineComponent({
  name: 'LcSwitch',
  inheritAttrs: false,
  emits: ['update:modelValue', 'change', 'click'],
  setup(_, { attrs, emit }) {
    return () => (
      <input
        type="checkbox"
        checked={
          readModel(attrs as AnyRecord) ===
          ((attrs as AnyRecord).activeValue ?? true)
        }
        disabled={(attrs as AnyRecord).disabled}
        onChange={(event: Event) => {
          const checked = (event.target as HTMLInputElement).checked;
          emitModel(
            emit,
            checked
              ? ((attrs as AnyRecord).activeValue ?? true)
              : ((attrs as AnyRecord).inactiveValue ?? false)
          );
        }}
        onClick={(event: MouseEvent) => emit('click', event)}
      />
    );
  }
});

export const Slider: any = defineComponent({
  name: 'LcSlider',
  inheritAttrs: false,
  emits: ['update:modelValue', 'change'],
  setup(_, { attrs, emit }) {
    return () => (
      <input
        type="range"
        value={Number(readModel(attrs as AnyRecord)) || 0}
        min={(attrs as AnyRecord).min ?? 0}
        max={(attrs as AnyRecord).max ?? 100}
        step={(attrs as AnyRecord).step ?? 1}
        disabled={(attrs as AnyRecord).disabled}
        style={{ width: '100%' }}
        onInput={(event: Event) =>
          emitModel(emit, Number((event.target as HTMLInputElement).value))
        }
      />
    );
  }
});

export const Stepper: any = defineComponent({
  name: 'LcStepper',
  inheritAttrs: false,
  emits: ['update:modelValue', 'change'],
  setup(_, { attrs, emit }) {
    return () => (
      <input
        type="number"
        value={readModel(attrs as AnyRecord)}
        min={(attrs as AnyRecord).min}
        max={(attrs as AnyRecord).max}
        step={(attrs as AnyRecord).step ?? 1}
        disabled={(attrs as AnyRecord).disabled}
        style={{ width: '100%', boxSizing: 'border-box' }}
        onInput={(event: Event) =>
          emitModel(emit, Number((event.target as HTMLInputElement).value))
        }
      />
    );
  }
});

export const Rate: any = defineComponent({
  name: 'LcRate',
  inheritAttrs: false,
  emits: ['update:modelValue', 'change'],
  setup(_, { attrs, emit }) {
    return () => {
      const count = Number((attrs as AnyRecord).count) || 5;
      const value = Number(readModel(attrs as AnyRecord)) || 0;
      return (
        <span style={{ display: 'inline-flex', gap: '4px', color: '#f59e0b' }}>
          {Array.from({ length: count }, (_, index) => (
            <button
              type="button"
              style={{
                border: 0,
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer'
              }}
              onClick={() => emitModel(emit, index + 1)}
            >
              {index < value ? '★' : '☆'}
            </button>
          ))}
        </span>
      );
    };
  }
});

export const CheckboxGroup: any = defineComponent({
  name: 'LcCheckboxGroup',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <div
        {...(attrs as AnyRecord)}
        style={{
          display: 'flex',
          flexDirection: attrs.direction === 'vertical' ? 'column' : 'row',
          flexWrap: 'wrap',
          gap: '8px',
          ...(attrs.style as AnyRecord)
        }}
      >
        {renderDefault(slots)}
      </div>
    );
  }
});

export const Checkbox: any = defineComponent({
  name: 'LcCheckbox',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          ...(attrs.style as AnyRecord)
        }}
      >
        <input type="checkbox" value={(attrs as AnyRecord).name} />
        {renderDefault(slots)}
      </label>
    );
  }
});

export const RadioGroup: any = CheckboxGroup;

export const Radio: any = defineComponent({
  name: 'LcRadio',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          ...(attrs.style as AnyRecord)
        }}
      >
        <input
          type="radio"
          name={(attrs as AnyRecord).name}
          value={(attrs as AnyRecord).name}
        />
        {renderDefault(slots)}
      </label>
    );
  }
});

export const Image: any = defineComponent({
  name: 'LcImage',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => (
      <img
        {...(attrs as AnyRecord)}
        src={(attrs as AnyRecord).src}
        style={{
          maxWidth: '100%',
          objectFit: (attrs as AnyRecord).fit || 'cover',
          ...(attrs.style as AnyRecord)
        }}
      />
    );
  }
});

export const NoticeBar: any = defineComponent({
  name: 'LcNoticeBar',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <div
        {...(attrs as AnyRecord)}
        style={{
          width: '100%',
          padding: '8px 12px',
          color: (attrs as AnyRecord).color || '#92400e',
          background: (attrs as AnyRecord).background || '#fef3c7',
          boxSizing: 'border-box',
          ...(attrs.style as AnyRecord)
        }}
      >
        {renderDefault(slots, (attrs as AnyRecord).text)}
      </div>
    );
  }
});

export const Progress: any = defineComponent({
  name: 'LcProgress',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => {
      const percentage = Math.min(
        100,
        Math.max(0, Number((attrs as AnyRecord).percentage) || 0)
      );
      return (
        <div
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '999px',
            background: '#e2e8f0'
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: '100%',
              borderRadius: 'inherit',
              background: (attrs as AnyRecord).color || '#2563eb'
            }}
          />
        </div>
      );
    };
  }
});

export const Divider: any = defineComponent({
  name: 'LcDivider',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <div
        {...(attrs as AnyRecord)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          color: '#64748b',
          ...(attrs.style as AnyRecord)
        }}
      >
        <span style={{ flex: 1, borderTop: '1px solid #e2e8f0' }} />
        {renderDefault(slots, (attrs as AnyRecord).content)}
        <span style={{ flex: 1, borderTop: '1px solid #e2e8f0' }} />
      </div>
    );
  }
});

export const NavBar: any = defineComponent({
  name: 'LcNavBar',
  inheritAttrs: false,
  emits: ['click-left', 'click-right'],
  setup(_, { attrs, slots, emit }) {
    return () => (
      <div
        {...(attrs as AnyRecord)}
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 80px',
          alignItems: 'center',
          width: '100%',
          minHeight: '44px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          ...(attrs.style as AnyRecord)
        }}
      >
        <button
          type="button"
          onClick={() => emit('click-left')}
          style={{ border: 0, background: 'transparent' }}
        >
          {(attrs as AnyRecord).leftText || ''}
        </button>
        <strong style={{ textAlign: 'center' }}>
          {renderDefault(slots, (attrs as AnyRecord).title)}
        </strong>
        <button
          type="button"
          onClick={() => emit('click-right')}
          style={{ border: 0, background: 'transparent' }}
        >
          {(attrs as AnyRecord).rightText || ''}
        </button>
      </div>
    );
  }
});

export const Tabbar: any = defineComponent({
  name: 'LcTabbar',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <nav
        {...(attrs as AnyRecord)}
        class={['van-tabbar', 'lc-tabbar', (attrs as AnyRecord).class]}
        style={{
          display: 'flex',
          width: '100%',
          minHeight: '50px',
          borderTop: '1px solid #e2e8f0',
          background: '#fff',
          ...(attrs.style as AnyRecord)
        }}
      >
        {renderDefault(slots)}
      </nav>
    );
  }
});

export const TabbarItem: any = defineComponent({
  name: 'LcTabbarItem',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <a
        {...(attrs as AnyRecord)}
        href={(attrs as AnyRecord).url || '#'}
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          color: (attrs as AnyRecord).active ? '#2563eb' : '#64748b',
          textDecoration: 'none',
          fontSize: '12px',
          ...(attrs.style as AnyRecord)
        }}
      >
        {renderDefault(slots)}
      </a>
    );
  }
});

export const Popup: any = defineComponent({
  name: 'LcPopup',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    const visible = computed(
      () => (attrs as AnyRecord).show ?? (attrs as AnyRecord).modelValue ?? true
    );
    return () =>
      visible.value ? (
        <div
          {...(attrs as AnyRecord)}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #e2e8f0',
            background: '#fff',
            boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)',
            boxSizing: 'border-box',
            ...(attrs.style as AnyRecord)
          }}
        >
          {renderDefault(slots)}
        </div>
      ) : null;
  }
});

export const Picker: any = defineComponent({
  name: 'LcPicker',
  inheritAttrs: false,
  emits: ['confirm', 'cancel', 'change'],
  setup(_, { attrs, emit }) {
    return () => (
      <select
        value={
          toArray((attrs as AnyRecord).columns)[
            (attrs as AnyRecord).defaultIndex || 0
          ]?.value
        }
        style={{ width: '100%' }}
        onChange={(event: Event) => {
          const selected = toArray((attrs as AnyRecord).columns).find(
            (item: AnyRecord) =>
              item.value === (event.target as HTMLSelectElement).value
          );
          emit('change', selected);
          emit('confirm', selected);
        }}
      >
        {toArray((attrs as AnyRecord).columns).map((item: AnyRecord) => (
          <option value={item.value}>{item.label}</option>
        ))}
      </select>
    );
  }
});

export const DatetimePicker: any = defineComponent({
  name: 'LcDatetimePicker',
  inheritAttrs: false,
  emits: ['update:modelValue', 'confirm', 'cancel', 'change'],
  setup(_, { attrs, emit }) {
    return () => (
      <input
        type="datetime-local"
        value={readModel(attrs as AnyRecord)}
        style={{ width: '100%', boxSizing: 'border-box' }}
        onInput={(event: Event) => {
          const value = (event.target as HTMLInputElement).value;
          emitModel(emit, value);
          emit('confirm', value);
        }}
      />
    );
  }
});

export const Swipe: any = defineComponent({
  name: 'LcSwipe',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <div
        {...(attrs as AnyRecord)}
        style={{
          display: 'flex',
          width: '100%',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          ...(attrs.style as AnyRecord)
        }}
      >
        {renderDefault(slots)}
      </div>
    );
  }
});

export const SwipeItem: any = defineComponent({
  name: 'LcSwipeItem',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => (
      <div
        {...(attrs as AnyRecord)}
        style={{
          flex: '0 0 100%',
          scrollSnapAlign: 'start',
          ...(attrs.style as AnyRecord)
        }}
      >
        {renderDefault(slots)}
      </div>
    );
  }
});
