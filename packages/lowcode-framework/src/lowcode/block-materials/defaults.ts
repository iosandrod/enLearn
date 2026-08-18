import type {
  LowCodePageContainerBlock,
  LowCodePageButtonGroupBlock,
  LowCodePageDetailBlock,
  LowCodePageDrawerBlock,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageModalBlock,
  LowCodePagePlanningBomBlock,
  LowCodePagePlanningFlowBlock,
  LowCodePagePlanningGanttBlock,
  LowCodePageSearchFormBlock,
  LowCodePageSectionBlock,
  LowCodePageStatCardBlock,
  LowCodePageTabsBlock,
  LowCodePageTextBlock,
  LowCodePageToolbarBlock,
  LowCodePageTreeBlock,
} from '../../types/lowcode';
import { createDefaultButtonGroupActions } from '../actions/builtins';

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
      actions: createDefaultButtonGroupActions(),
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
      tableType: 'default',
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
      overlays: [],
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
      overlays: [],
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

export function createDefaultPlanningFlowBlock(
  overrides?: Partial<LowCodePagePlanningFlowBlock>
) {
  return withOverrides<LowCodePagePlanningFlowBlock>(
    {
      id: 'planning-flow-block',
      kind: 'planningFlow',
      title: '工艺路线',
      sourceKey: 'planningFlow',
      height: 520,
      fitViewOnInit: true,
    },
    overrides
  );
}

export function createDefaultPlanningGanttBlock(
  overrides?: Partial<LowCodePagePlanningGanttBlock>
) {
  return withOverrides<LowCodePagePlanningGanttBlock>(
    {
      id: 'planning-gantt-block',
      kind: 'planningGantt',
      title: '排产甘特图',
      sourceKey: 'operationPlans',
      height: 520,
      rowLabelField: 'resource_name',
      startField: 'startdate',
      endField: 'enddate',
      labelField: 'reference',
      statusField: 'status',
    },
    overrides
  );
}

export function createDefaultPlanningBomBlock(
  overrides?: Partial<LowCodePagePlanningBomBlock>
) {
  return withOverrides<LowCodePagePlanningBomBlock>(
    {
      id: 'planning-bom-block',
      kind: 'planningBom',
      title: '工艺 BOM',
      sourceKey: 'planningBom',
      height: 520,
      keyField: 'id',
      titleField: 'title',
      childrenField: 'children',
      rows: [],
    },
    overrides
  );
}
