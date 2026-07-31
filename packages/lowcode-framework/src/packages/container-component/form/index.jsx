import { renderSlot, useSlots } from 'vue';
import { Button, Field, Form } from 'vant';
import { compProps } from './compProps';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
function resolveFieldType(component) {
    if (component === 'vxe-password-input')
        return 'password';
    if (component === 'vxe-textarea')
        return 'textarea';
    return 'text';
}
function isRequired(value) {
    if (typeof value === 'boolean')
        return value;
    return typeof value === 'string' && ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}
function readDesignedBlocks(value) {
    const model = value;
    const blocks = model?.pages?.['/']?.blocks;
    return Array.isArray(blocks) ? blocks : [];
}
export default {
    key: 'form',
    moduleName: 'businessComponents',
    label: '普通表单',
    preview: () => (<Form>
      <Field name="username" label="用户名" placeholder="用户名"/>
      <Field type="password" name="password" label="密码" placeholder="密码"/>
      <div style="margin: 16px;">
        <Button round size="small" block type="primary">
          提交
        </Button>
      </div>
    </Form>),
    render({ props, styles, block, custom }) {
        const slots = useSlots();
        const { registerRef } = useGlobalProperties();
        const onSubmit = (values) => {
            console.log('onSubmit:', values);
        };
        return () => {
            const fields = Array.isArray(props.fields) ? props.fields : [];
            const designedBlocks = readDesignedBlocks(props.formDesignerModel);
            const renderDesignedBlocks = typeof custom.renderDesignedBlocks === 'function'
                ? custom.renderDesignedBlocks
                : undefined;
            return (<div style={styles}>
          <Form ref={(el) => registerRef(el, block._vid)} {...props} style={{ width: '100%' }} onSubmit={onSubmit}>
            {designedBlocks.length && renderDesignedBlocks ? (renderDesignedBlocks(designedBlocks, String(props.formDesignerUpdatedAt || ''))) : fields.length ? (<div style={{
                        display: 'grid',
                        gap: '8px',
                    }}>
                {fields.map((field, index) => (<div key={String(field.field || index)}>
                    <Field name={String(field.field || '')} label={String(field.label || field.field || '字段')} placeholder={String(field.placeholder || '')} type={resolveFieldType(field.component)} required={isRequired(field.required)}/>
                    {field.help ? (<div style={{
                                padding: '2px 16px 0',
                                color: '#8c8c8c',
                                fontSize: '12px',
                            }}>
                        {String(field.help)}
                      </div>) : null}
                  </div>))}
              </div>) : (renderSlot(slots, 'default'))}
            {fields.length ? (<div style="margin: 16px;">
                <Button round size="small" block type="primary">
                  提交
                </Button>
              </div>) : null}
          </Form>
        </div>);
        };
    },
    resize: {
        height: true,
        width: true,
    },
    events: [
        { label: '提交表单且验证通过后触发', value: 'submit' },
        { label: '提交表单且验证不通过后触发', value: 'failed' },
    ],
    props: compProps,
};
