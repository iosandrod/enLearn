import { renderSlot, useSlots } from 'vue';
import { createEditorInputProp, createEditorSwitchProp, } from '../../../visual-editor/visual-editor.props';
const defaultSlots = {
    value: '24',
    slot0: {
        key: 'slot0',
        label: '弹框内容',
        span: 24,
        children: [],
    },
};
function toWidthStyle(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return { width: `${value}px` };
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return { width: Number.isFinite(parsed) && String(parsed) === value.trim() ? `${parsed}px` : value };
    }
    return { width: '640px' };
}
function modalShellStyle(width) {
    return {
        ...toWidthStyle(width),
        maxWidth: 'calc(100% - 48px)',
        maxHeight: 'calc(100% - 48px)',
        border: '1px solid #d8e0ea',
        borderRadius: '8px',
        background: '#ffffff',
        boxShadow: '0 18px 48px rgb(15 23 42 / 22%)',
        overflow: 'hidden',
    };
}
export default {
    key: 'lowcode-modal',
    moduleName: 'businessComponents',
    label: '弹框',
    preview: () => (<div style={{
            width: '220px',
            border: '1px solid #dcdfe6',
            borderRadius: '6px',
            background: '#fff',
            boxShadow: '0 8px 18px rgb(15 23 42 / 10%)',
            overflow: 'hidden',
        }}>
      <div style={{
            display: 'flex',
            padding: '8px 10px',
            borderBottom: '1px solid #ebeef5',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 600,
        }}>
        <span>弹框</span>
        <i class="ri-close-line" aria-hidden="true"/>
      </div>
      <div style={{ padding: '12px' }}>
        <div style={{
            height: '36px',
            border: '1px dashed #cbd5e1',
            borderRadius: '4px',
            background: '#f8fafc',
        }}/>
      </div>
    </div>),
    render({ props, styles }) {
        const slots = useSlots();
        return () => (<div style={{
                ...styles,
                position: 'relative',
                display: 'grid',
                width: '100%',
                minHeight: '360px',
                padding: '24px',
                placeItems: 'center',
                background: 'rgb(15 23 42 / 34%)',
                boxSizing: 'border-box',
            }}>
        <section style={modalShellStyle(props.width)}>
          <header style={{
                display: 'flex',
                minHeight: '44px',
                padding: '10px 14px',
                borderBottom: '1px solid #e5e7eb',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                boxSizing: 'border-box',
            }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                color: '#0f172a',
                fontSize: '15px',
                fontWeight: 700,
                lineHeight: '22px',
            }}>
                {props.title || '弹框'}
              </div>
              {props.description ? (<div style={{
                    marginTop: '2px',
                    color: '#64748b',
                    fontSize: '12px',
                    lineHeight: '18px',
                }}>
                  {props.description}
                </div>) : null}
            </div>
            <span style={{
                display: 'grid',
                width: '28px',
                height: '28px',
                borderRadius: '4px',
                color: '#64748b',
                placeItems: 'center',
                flex: 'none',
            }}>
              <i class="ri-close-line" aria-hidden="true"/>
            </span>
          </header>
          <div style={{
                minHeight: '160px',
                padding: '14px',
                boxSizing: 'border-box',
            }}>
            {renderSlot(slots, 'slot0')}
          </div>
        </section>
      </div>);
    },
    showStyleConfig: true,
    props: {
        blockId: createEditorInputProp({
            label: 'Block ID',
            defaultValue: 'modal-block',
        }),
        title: createEditorInputProp({
            label: '标题',
            defaultValue: '弹框',
        }),
        description: createEditorInputProp({
            label: '描述',
            defaultValue: '',
        }),
        open: createEditorSwitchProp({
            label: '默认打开',
            defaultValue: false,
        }),
        width: createEditorInputProp({
            label: '宽度',
            defaultValue: '640',
        }),
        slots: createEditorInputProp({
            label: '内容插槽',
            defaultValue: defaultSlots,
        }),
    },
};
