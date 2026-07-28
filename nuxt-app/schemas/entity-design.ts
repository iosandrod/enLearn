import type { LowCodeFormSchema } from '~/types/lowcode';

const dataTypeOptions = [
  { label: 'uuid', value: 'uuid' },
  { label: 'text', value: 'text' },
  { label: 'varchar', value: 'varchar' },
  { label: 'integer', value: 'integer' },
  { label: 'bigint', value: 'bigint' },
  { label: 'numeric', value: 'numeric' },
  { label: 'boolean', value: 'boolean' },
  { label: 'date', value: 'date' },
  { label: 'timestamptz', value: 'timestamptz' },
  { label: 'jsonb', value: 'jsonb' }
];

export const entityTableFormSchema: LowCodeFormSchema = {
  title: '表格实体',
  columns: 2,
  fields: [
    {
      field: 'code',
      label: '实体编码',
      component: 'vxe-input',
      props: { placeholder: 'sale', clearable: true },
      rules: [{ required: true, message: '请输入实体编码' }]
    },
    {
      field: 'tableName',
      label: '真实表名',
      component: 'vxe-input',
      props: { placeholder: 'public.sale', clearable: true },
      rules: [{ required: true, message: '请输入真实表名' }]
    },
    {
      field: 'title',
      label: '显示名称',
      component: 'vxe-input',
      props: { placeholder: '销售订单', clearable: true },
      rules: [{ required: true, message: '请输入显示名称' }]
    },
    {
      field: 'primaryKey',
      label: '主键列',
      component: 'vxe-input',
      props: { placeholder: 'id', clearable: true }
    },
    {
      field: 'description',
      label: '业务说明',
      component: 'vxe-textarea',
      props: {
        placeholder: '说明这张表的业务含义和使用边界',
        rows: 3,
        resize: 'vertical'
      }
    },
    {
      field: 'createPhysical',
      label: '同步创建真实表',
      component: 'vxe-switch',
      help: '关闭后只保存 metadata，不执行 create table。'
    }
  ],
  layout: [
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'code' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'tableName' }] }
      ]
    },
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'title' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'primaryKey' }] }
      ]
    },
    { kind: 'field', field: 'description' },
    { kind: 'field', field: 'createPhysical' }
  ],
  actions: [
    { code: 'save', label: '保存表', type: 'submit', status: 'primary' },
    { code: 'delete', label: '删除 metadata', type: 'button', status: 'danger' },
    { code: 'reset', label: '新建表', type: 'button' }
  ]
};

export const entityColumnFormSchema: LowCodeFormSchema = {
  title: '列设计',
  columns: 2,
  fields: [
    {
      field: 'columnName',
      label: '列名',
      component: 'vxe-input',
      props: { placeholder: 'sale_no', clearable: true },
      rules: [{ required: true, message: '请输入列名' }]
    },
    {
      field: 'label',
      label: '列标题',
      component: 'vxe-input',
      props: { placeholder: '订单编号', clearable: true }
    },
    {
      field: 'dataType',
      label: '数据类型',
      component: 'vxe-select',
      options: dataTypeOptions
    },
    {
      field: 'storageKind',
      label: '存储方式',
      component: 'vxe-select',
      options: [
        { label: '真实列', value: 'physical' },
        { label: '虚拟列', value: 'virtual' }
      ],
      help: '虚拟列只进入设计 metadata，不强制落到真实表。'
    },
    {
      field: 'defaultValue',
      label: '默认值 SQL',
      component: 'vxe-input',
      props: { placeholder: "'draft' / 0 / now()", clearable: true }
    },
    {
      field: 'expression',
      label: '虚拟表达式',
      component: 'vxe-textarea',
      props: {
        placeholder: 'quantity * unit_price',
        rows: 2,
        resize: 'vertical'
      }
    },
    {
      field: 'isRequired',
      label: '必填',
      component: 'vxe-switch'
    },
    {
      field: 'isUnique',
      label: '唯一',
      component: 'vxe-switch'
    }
  ],
  layout: [
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'columnName' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'label' }] }
      ]
    },
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'dataType' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'storageKind' }] }
      ]
    },
    { kind: 'field', field: 'defaultValue' },
    { kind: 'field', field: 'expression' },
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'isRequired' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'isUnique' }] }
      ]
    }
  ],
  actions: [
    { code: 'save', label: '保存列', type: 'submit', status: 'primary' },
    { code: 'delete', label: '删除列', type: 'button', status: 'danger' },
    { code: 'reset', label: '新建列', type: 'button' }
  ]
};

export const entityRelationFormSchema: LowCodeFormSchema = {
  title: '外键关系',
  columns: 2,
  fields: [
    {
      field: 'sourceTableId',
      label: '来源表',
      component: 'vxe-select',
      optionsSourceKey: 'tables',
      props: { filterable: true, clearable: true },
      rules: [{ required: true, message: '请选择来源表' }]
    },
    {
      field: 'sourceColumnName',
      label: '来源列',
      component: 'vxe-select',
      optionsSourceKey: 'sourceColumns',
      props: { filterable: true, clearable: true },
      rules: [{ required: true, message: '请选择来源列' }]
    },
    {
      field: 'targetTableId',
      label: '目标表',
      component: 'vxe-select',
      optionsSourceKey: 'tables',
      props: { filterable: true, clearable: true },
      rules: [{ required: true, message: '请选择目标表' }]
    },
    {
      field: 'targetColumnName',
      label: '目标列',
      component: 'vxe-select',
      optionsSourceKey: 'targetColumns',
      props: { filterable: true, clearable: true },
      rules: [{ required: true, message: '请选择目标列' }]
    },
    {
      field: 'relationType',
      label: '关系类型',
      component: 'vxe-select',
      options: [
        { label: '多对一', value: 'many_to_one' },
        { label: '一对多', value: 'one_to_many' },
        { label: '一对一', value: 'one_to_one' },
        { label: '多对多', value: 'many_to_many' }
      ]
    },
    {
      field: 'isEnforced',
      label: '创建真实 FK 约束',
      component: 'vxe-switch',
      help: '开启后会尝试在数据库中创建外键约束。'
    }
  ],
  layout: [
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'sourceTableId' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'sourceColumnName' }] }
      ]
    },
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'targetTableId' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'targetColumnName' }] }
      ]
    },
    {
      kind: 'row',
      gutter: 10,
      columns: [
        { span: 12, blocks: [{ kind: 'field', field: 'relationType' }] },
        { span: 12, blocks: [{ kind: 'field', field: 'isEnforced' }] }
      ]
    }
  ],
  actions: [
    { code: 'save', label: '保存关系', type: 'submit', status: 'primary' },
    { code: 'reset', label: '新建关系', type: 'button' }
  ]
};
