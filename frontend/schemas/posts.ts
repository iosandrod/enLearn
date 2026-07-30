import type { LowCodeFormSchema, LowCodeGridSchema } from '@enlearn/lowcode-framework/types/lowcode';

export const postFormSchema: LowCodeFormSchema = {
  columns: 1,
  fields: [
    {
      field: 'title',
      label: 'Post Title',
      component: 'vxe-input',
      props: {
        placeholder: 'Enter a post title',
        clearable: true
      },
      rules: [{ required: true, message: 'Post title is required' }]
    },
    {
      field: 'content',
      label: 'Post Content',
      component: 'vxe-textarea',
      props: {
        placeholder: 'Write something',
        rows: 4,
        resize: 'vertical'
      }
    }
  ],
  actions: [
    {
      code: 'submit',
      label: 'Save Post',
      type: 'submit',
      status: 'primary'
    },
    {
      code: 'reset',
      label: 'Reset',
      type: 'reset'
    }
  ]
};

export const postsGridSchema: LowCodeGridSchema = {
  title: 'Posts',
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
    rowConfig: { keyField: 'id' },
    columns: [
      { type: 'seq', width: 60, title: '#' },
      { field: 'title', title: 'Title', minWidth: 180 },
      { field: 'content', title: 'Content', minWidth: 260 },
      {
        field: 'updated_at',
        title: 'Updated At',
        width: 190,
        formatter: ({ cellValue }: { cellValue: unknown }) =>
          typeof cellValue === 'string' || typeof cellValue === 'number'
            ? new Date(cellValue).toLocaleString()
            : ''
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
