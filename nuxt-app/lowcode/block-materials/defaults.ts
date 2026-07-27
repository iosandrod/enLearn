import type {
  LowCodePageContainerBlock,
  LowCodePageButtonGroupBlock,
  LowCodePageDetailBlock,
  LowCodePageDrawerBlock,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageModalBlock,
  LowCodePageSearchFormBlock,
  LowCodePageSectionBlock,
  LowCodePageStatCardBlock,
  LowCodePageTabsBlock,
  LowCodePageTextBlock,
  LowCodePageToolbarBlock,
  LowCodePageTreeBlock,
} from '~/types/lowcode';

function withOverrides<T extends { id: string }>(block: T, overrides?: Partial<T>) {
  return {
    ...block,
    ...(overrides ?? {}),
  } as T;
}

export function createDefaultTextBlock(overrides?: Partial<LowCodePageTextBlock>) {
  return withOverrides<LowCodePageTextBlock>(
    {
      id: 'text-block',
      kind: 'text',
      content: 'Text block',
      tone: 'default',
    },
    overrides
  );
}

export function createDefaultContainerBlock(overrides?: Partial<LowCodePageContainerBlock>) {
  return withOverrides<LowCodePageContainerBlock>(
    {
      id: 'container-block',
      kind: 'container',
      title: 'Container',
      columns: 1,
      gap: 8,
      panel: true,
      blocks: [],
    },
    overrides
  );
}

export function createDefaultSectionBlock(overrides?: Partial<LowCodePageSectionBlock>) {
  return withOverrides<LowCodePageSectionBlock>(
    {
      id: 'section-block',
      kind: 'section',
      title: 'Section',
      panel: true,
      blocks: [],
    },
    overrides
  );
}

export function createDefaultTabsBlock(overrides?: Partial<LowCodePageTabsBlock>) {
  return withOverrides<LowCodePageTabsBlock>(
    {
      id: 'tabs-block',
      kind: 'tabs',
      defaultKey: 'basic',
      tabs: [
        {
          key: 'basic',
          label: 'Basic',
          blocks: [],
        },
      ],
    },
    overrides
  );
}

export function createDefaultToolbarBlock(overrides?: Partial<LowCodePageToolbarBlock>) {
  return withOverrides<LowCodePageToolbarBlock>(
    {
      id: 'toolbar-block',
      kind: 'toolbar',
      actions: [
        {
          code: 'refresh',
          label: 'Refresh',
          status: 'primary',
        },
      ],
    },
    overrides
  );
}

export function createDefaultButtonGroupBlock(overrides?: Partial<LowCodePageButtonGroupBlock>) {
  return withOverrides<LowCodePageButtonGroupBlock>(
    {
      id: 'button-group',
      kind: 'buttonGroup',
      title: '按钮组',
      align: 'left',
      gap: 8,
      actions: [
        {
          code: 'create',
          label: '新增',
          status: 'primary',
          type: 'button',
          eventName: 'buttonGroup.create',
        },
        {
          code: 'more',
          label: '更多',
          type: 'button',
          eventName: 'buttonGroup.more',
          children: [
            {
              code: 'import',
              label: '导入',
              type: 'button',
              eventName: 'buttonGroup.import',
            },
            {
              code: 'export',
              label: '导出',
              type: 'button',
              eventName: 'buttonGroup.export',
            },
          ],
        },
      ],
    },
    overrides
  );
}

export function createDefaultFormBlock(overrides?: Partial<LowCodePageFormBlock>) {
  return withOverrides<LowCodePageFormBlock>(
    {
      id: 'form-block',
      kind: 'form',
      title: '普通表单',
      sourceKey: 'record',
      submitSourceKey: 'record',
      schema: {
        fields: [],
        actions: [
          {
            code: 'submit',
            label: 'Submit',
            type: 'submit',
            status: 'primary',
          },
          {
            code: 'reset',
            label: 'Reset',
            type: 'reset',
          },
        ],
      },
    },
    overrides
  );
}

export function createDefaultSearchFormBlock(overrides?: Partial<LowCodePageSearchFormBlock>) {
  return withOverrides<LowCodePageSearchFormBlock>(
    {
      id: 'search-form-block',
      kind: 'searchForm',
      title: 'Query Conditions',
      targetSourceKey: 'records',
      schema: {
        fields: [],
        actions: [
          {
            code: 'submit',
            label: 'Search',
            type: 'submit',
            status: 'primary',
          },
          {
            code: 'reset',
            label: 'Reset',
            type: 'reset',
          },
        ],
      },
    },
    overrides
  );
}

export function createDefaultGridBlock(overrides?: Partial<LowCodePageGridBlock>) {
  return withOverrides<LowCodePageGridBlock>(
    {
      id: 'grid-block',
      kind: 'grid',
      title: 'Records',
      sourceKey: 'records',
      schema: {
        title: 'Records',
        grid: {
          border: true,
          stripe: true,
          showOverflow: true,
          rowConfig: { keyField: 'id' },
          columns: [],
        },
      },
    },
    overrides
  );
}

export function createDefaultDetailBlock(overrides?: Partial<LowCodePageDetailBlock>) {
  return withOverrides<LowCodePageDetailBlock>(
    {
      id: 'detail-block',
      kind: 'detail',
      title: 'Detail',
      fields: [],
    },
    overrides
  );
}

export function createDefaultModalBlock(overrides?: Partial<LowCodePageModalBlock>) {
  return withOverrides<LowCodePageModalBlock>(
    {
      id: 'modal-block',
      kind: 'modal',
      title: 'Modal',
      open: false,
      width: 640,
      blocks: [],
    },
    overrides
  );
}

export function createDefaultDrawerBlock(overrides?: Partial<LowCodePageDrawerBlock>) {
  return withOverrides<LowCodePageDrawerBlock>(
    {
      id: 'drawer-block',
      kind: 'drawer',
      title: 'Drawer',
      open: false,
      width: 480,
      placement: 'right',
      blocks: [],
    },
    overrides
  );
}

export function createDefaultStatCardBlock(overrides?: Partial<LowCodePageStatCardBlock>) {
  return withOverrides<LowCodePageStatCardBlock>(
    {
      id: 'stat-card-block',
      kind: 'statCard',
      title: 'Stats',
      items: [
        {
          label: 'Total',
          field: 'count',
        },
      ],
    },
    overrides
  );
}

export function createDefaultTreeBlock(overrides?: Partial<LowCodePageTreeBlock>) {
  return withOverrides<LowCodePageTreeBlock>(
    {
      id: 'tree-block',
      kind: 'tree',
      title: 'Tree',
      keyField: 'id',
      titleField: 'title',
      childrenField: 'children',
      rows: [],
    },
    overrides
  );
}
