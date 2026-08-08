import type { LowCodeGridSchema } from '@enlearn/lowcode-framework/types/lowcode';

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
