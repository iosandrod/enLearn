import type { LowCodeGridSchema } from '@enlearn/lowcode-framework/types/lowcode';

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
