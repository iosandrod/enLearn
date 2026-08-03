import type { LowCodeFormSchema, LowCodeGridSchema } from '@enlearn/lowcode-framework/types/lowcode';

export const lowCodePageEditorSchema: LowCodeFormSchema = {
  columns: 2,
  fields: [
    {
      field: 'code',
      label: 'Page Code',
      component: 'vxe-input',
      props: {
        placeholder: 'dashboard-lowcode-demo',
        clearable: true
      },
      rules: [{ required: true, message: 'Code is required' }]
    },
    {
      field: 'route',
      label: 'Route',
      component: 'vxe-input',
      props: {
        placeholder: '/dashboard/low-code/demo',
        clearable: true
      },
      rules: [{ required: true, message: 'Route is required' }]
    },
    {
      field: 'title',
      label: 'Title',
      component: 'vxe-input',
      props: {
        placeholder: 'Demo Admin Page',
        clearable: true
      },
      rules: [{ required: true, message: 'Title is required' }]
    },
    {
      field: 'pageType',
      label: 'Page Type',
      component: 'vxe-select',
      options: [
        { label: 'Custom', value: 'custom' },
        { label: 'List Page', value: 'list' },
        { label: 'Edit Page', value: 'edit' },
        { label: 'Detail Page', value: 'detail' }
      ]
    },
    {
      field: 'layout',
      label: 'Layout',
      component: 'vxe-select',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Dashboard', value: 'dashboard' },
        { label: 'Blank', value: 'blank' }
      ]
    },
    {
      field: 'status',
      label: 'Status',
      component: 'vxe-select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' }
      ]
    },
    {
      field: 'keep_alive',
      label: 'Keep Alive',
      component: 'vxe-switch'
    },
    {
      field: 'parentListPageCode',
      label: 'Parent List Page',
      component: 'vxe-input',
      props: {
        placeholder: 'Required when Page Type is Edit Page',
        clearable: true
      },
      span: 2
    },
    {
      field: 'description',
      label: 'Description',
      component: 'vxe-textarea',
      props: {
        placeholder: 'Describe what this page is for',
        rows: 3,
        resize: 'vertical'
      },
      span: 2
    },
    {
      field: 'schemaJson',
      label: 'Schema JSON',
      component: 'vxe-textarea',
      props: {
        placeholder: 'Paste the page schema JSON here',
        rows: 16,
        resize: 'vertical'
      },
      rules: [{ required: true, message: 'Schema JSON is required' }],
      span: 2
    }
  ],
  actions: [
    {
      code: 'save',
      label: 'Save Page',
      type: 'submit',
      status: 'primary'
    },
    {
      code: 'publish',
      label: 'Publish',
      type: 'button'
    },
    {
      code: 'archive',
      label: 'Archive',
      type: 'button',
      status: 'warning'
    },
    {
      code: 'reset',
      label: 'Reset',
      type: 'reset'
    }
  ]
};

export const lowCodePagesGridSchema: LowCodeGridSchema = {
  title: 'Low Code Pages',
  toolbar: [
    {
      code: 'refresh',
      label: 'Refresh'
    }
  ],
  grid: {
    border: true,
    stripe: true,
    showOverflow: true,
    rowConfig: { keyField: 'code' },
    columns: [
      { field: 'code', title: 'Code', minWidth: 180 },
      { field: 'route', title: 'Route', minWidth: 220 },
      { field: 'title', title: 'Title', minWidth: 180 },
      {
        field: 'page_type',
        title: 'Page Type',
        minWidth: 120,
        formatter: {
          type: 'enum',
          map: {
            list: 'List',
            edit: 'Edit',
            detail: 'Detail',
            custom: 'Custom'
          }
        }
      },
      {
        field: 'status',
        title: 'Status',
        minWidth: 120,
        formatter: {
          type: 'enum',
          map: {
            draft: 'Draft',
            published: 'Published',
            archived: 'Archived'
          }
        }
      },
      { field: 'version', title: 'Version', width: 90, align: 'center' },
      {
        field: 'updated_at',
        title: 'Updated At',
        minWidth: 190,
        formatter: {
          type: 'datetime',
          locale: 'en-US'
        }
      },
      {
        title: 'Actions',
        width: 180,
        fixed: 'right',
        slots: { default: 'actions' }
      }
    ]
  }
};
