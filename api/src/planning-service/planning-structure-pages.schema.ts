import { isRecord, type LowCodePageSchema } from '../lowcode-service/lowcode.schema';

export const PLANNING_ROUTING_PAGE_CODE = 'planning_routing_view';
export const PLANNING_ROUTING_ROUTE = '/dashboard/planning/routing-view';
export const PLANNING_ROUTE_DESIGNER_PAGE_CODE = 'planning_route_designer';
export const PLANNING_ROUTE_DESIGNER_ROUTE = '/dashboard/planning/route-designer';
export const PLANNING_BOM_PAGE_CODE = 'planning_bom_view';
export const PLANNING_BOM_ROUTE = '/dashboard/planning/bom-view';

export const PLANNING_STRUCTURE_ROUTES = [
  {
    code: 'planning-routing-view',
    title: '工艺路线',
    path: PLANNING_ROUTING_ROUTE,
    pageCode: PLANNING_ROUTING_PAGE_CODE,
    icon: 'ri-route-line',
    sortOrder: 70
  },
  {
    code: 'planning-bom-view',
    title: 'BOM',
    path: PLANNING_BOM_ROUTE,
    pageCode: PLANNING_BOM_PAGE_CODE,
    icon: 'ri-node-tree',
    sortOrder: 80
  }
] as const;

function optionSource(optionType: 'item' | 'operation' | 'resource' | 'route', label: string) {
  return {
    key: `${optionType}Options`,
    label,
    sourceType: 'custom' as const,
    serviceName: 'planning',
    serviceMethod: 'getPlanningConsoleOptions',
    postData: { optionType },
    autoLoad: true
  };
}

function selectField(
  field: string,
  label: string,
  optionsSourceKey: string,
  placeholder: string,
  targetSourceKey: 'flow' | 'bom'
) {
  return {
    field,
    label,
    component: 'vxe-select',
    optionsSourceKey,
    optionProps: { label: 'label', value: 'id' },
    props: { clearable: true, filterable: true, placeholder },
    events: {
      change: [{ type: 'refreshDataSources', sourceKeys: [targetSourceKey] }]
    }
  };
}

function searchActions() {
  return [
    { code: 'submit', label: '查询', type: 'submit', status: 'primary', icon: 'ri-search-line' },
    { code: 'reset', label: '重置', type: 'reset', icon: 'ri-refresh-line' }
  ];
}

const textFormatter = { type: 'text', emptyText: '-' };
const numberFormatter = { type: 'number', locale: 'zh-CN', emptyText: '0' };
const datetimeFormatter = { type: 'datetime', locale: 'zh-CN', emptyText: '-' };

function planningListSource(key: string, label: string, resource: string, autoLoad: boolean) {
  return {
    key,
    label,
    sourceType: 'custom' as const,
    serviceName: 'planning',
    serviceMethod: 'listItems',
    tableName: resource,
    postData: {
      resource,
      tableName: resource,
      ...(autoLoad
        ? {}
        : {
            filters: { operation_id: '__none__' },
            requiredFilters: ['operation_id']
          }),
      limit: 1000
    },
    autoLoad
  };
}

function gridConfig(columns: Array<Record<string, unknown>>, height: number) {
  return {
    border: true,
    stripe: true,
    showOverflow: 'tooltip',
    height,
    rowConfig: { keyField: 'id', isCurrent: true },
    columnConfig: { resizable: true },
    columns
  };
}

function detailGrid(
  id: string,
  sourceKey: string,
  columns: Array<Record<string, unknown>>
) {
  return {
    id,
    kind: 'grid',
    tableType: 'detail',
    sourceKey,
    schema: {
      grid: gridConfig(columns, 270),
      rowActions: { edit: false, delete: false }
    }
  };
}

export function buildPlanningRoutingPageSchema(): LowCodePageSchema {
  const detailSourceKeys = [
    'routingSuboperations',
    'routingMaterials',
    'routingResources',
    'routingDependencies'
  ];
  const rowLinkedSourceKeys = [...detailSourceKeys, 'flow'];

  return {
    schemaVersion: 1,
    code: PLANNING_ROUTING_PAGE_CODE,
    route: PLANNING_ROUTING_ROUTE,
    title: '工艺路线',
    pageType: 'custom',
    description: '查看工序顺序、依赖关系、投入物料和占用资源。',
    layout: 'dashboard',
    status: 'published',
    keepAlive: true,
    dataSources: {
      flow: {
        key: 'flow',
        label: '工艺路线图',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'getPlanningConsoleData',
        postData: {
          dataset: 'flow',
          filters: {
            itemId: '{{ forms.planning_routing_filter.itemId }}',
            resourceId: '{{ forms.planning_routing_filter.resourceId }}',
            operationId: '__none__'
          },
          requiredFilters: ['operationId']
        },
        autoLoad: false
      },
      routingOperations: planningListSource(
        'routingOperations',
        '工艺路线表',
        'planning_operation',
        true
      ),
      routingSuboperations: planningListSource(
        'routingSuboperations',
        '路线工序',
        'planning_suboperation',
        false
      ),
      routingMaterials: planningListSource(
        'routingMaterials',
        '关联物料',
        'planning_operationmaterial',
        false
      ),
      routingResources: planningListSource(
        'routingResources',
        '关联资源',
        'planning_operationresource',
        false
      ),
      routingDependencies: planningListSource(
        'routingDependencies',
        '工序依赖',
        'planning_operation_dependency',
        false
      ),
      itemOptions: optionSource('item', '物料选项'),
      resourceOptions: optionSource('resource', '资源选项'),
      routeOptions: optionSource('route', '工艺路线选项')
    },
    eventHandlers: [{
      event: 'planningFlow.nodeSelect',
      blockId: 'planning_routing_flow',
      directives: [{
        type: 'navigate',
        route: '/dashboard/planning/operation/edit?id={{ row.id }}&fromPage=planning_routing_view'
      }]
    }],
    blocks: [
      {
        id: 'planning_routing_filter',
        kind: 'searchForm',
        title: '路线筛选',
        targetSourceKey: 'flow',
        initialValues: { itemId: '', resourceId: '' },
        schema: {
          columns: 2,
          fields: [
            selectField('itemId', '产出物料', 'itemOptions', '全部物料', 'flow'),
            selectField('resourceId', '资源', 'resourceOptions', '全部资源', 'flow')
          ],
          actions: searchActions()
        }
      },
      {
        id: 'planning_routing_grid',
        kind: 'grid',
        tableType: 'main',
        title: '工艺路线表',
        sourceKey: 'routingOperations',
        schema: {
          grid: gridConfig([
            { type: 'seq', title: '序号', width: 64, align: 'center' },
            { field: 'name', title: '名称', minWidth: 200, fixed: 'left', sortable: true },
            {
              field: 'type',
              title: '类型',
              width: 116,
              align: 'center',
              formatter: {
                type: 'enum',
                map: {
                  fixed_time: '固定时长',
                  time_per: '单位时长',
                  routing: '工艺路线',
                  alternate: '备选工序',
                  split: '拆分工序'
                },
                emptyText: '-'
              }
            },
            { field: 'item_id_label', title: '产出物料', minWidth: 180, formatter: textFormatter },
            { field: 'location_id_label', title: '地点', minWidth: 150, formatter: textFormatter },
            { field: 'owner_id_label', title: '上级工序', minWidth: 180, formatter: textFormatter },
            { field: 'priority', title: '优先级', width: 90, align: 'right', formatter: numberFormatter },
            { field: 'duration', title: '固定时长', width: 120, formatter: textFormatter },
            { field: 'duration_per', title: '单位时长', width: 120, formatter: textFormatter },
            { field: 'cost', title: '工序成本', width: 110, align: 'right', formatter: numberFormatter },
            { field: 'effective_start', title: '生效开始', width: 180, formatter: datetimeFormatter },
            { field: 'effective_end', title: '生效结束', width: 180, formatter: datetimeFormatter },
            { field: 'description', title: '说明', minWidth: 220, formatter: textFormatter }
          ], 330),
          rowActions: { edit: false, delete: false },
          events: {
            rowCurrentChange: rowLinkedSourceKeys.map((sourceKey) => ({
              type: 'setSearchFilters',
              sourceKey,
              mode: 'replace',
              values: sourceKey === 'flow'
                ? { operationId: '{{ event.row.id }}' }
                : { operation_id: '{{ event.row.id }}' }
            })),
            rowDblclick: [{
              type: 'navigate',
              route: '/dashboard/planning/operation/edit?id={{ row.id }}&fromPage=planning_routing_view'
            }]
          }
        }
      },
      {
        id: 'planning_routing_detail_tabs',
        kind: 'tabs',
        title: '关联信息',
        defaultKey: 'suboperations',
        tabs: [
          {
            key: 'suboperations',
            label: '路线工序',
            blocks: [detailGrid(
              'planning_routing_suboperations_grid',
              'routingSuboperations',
              [
                { type: 'seq', title: '序号', width: 64, align: 'center' },
                { field: 'suboperation_id_label', title: '工序', minWidth: 220, fixed: 'left', formatter: textFormatter },
                { field: 'operation_id_label', title: '所属路线', minWidth: 200, formatter: textFormatter },
                { field: 'priority', title: '顺序/优先级', width: 120, align: 'right', formatter: numberFormatter },
                { field: 'effective_start', title: '生效开始', width: 180, formatter: datetimeFormatter },
                { field: 'effective_end', title: '生效结束', width: 180, formatter: datetimeFormatter }
              ]
            )]
          },
          {
            key: 'materials',
            label: '关联物料',
            blocks: [detailGrid(
              'planning_routing_materials_grid',
              'routingMaterials',
              [
                { type: 'seq', title: '序号', width: 64, align: 'center' },
                { field: 'item_id_label', title: '物料', minWidth: 220, fixed: 'left', formatter: textFormatter },
                { field: 'location_id_label', title: '地点', minWidth: 160, formatter: textFormatter },
                { field: 'name', title: '名称', minWidth: 160, formatter: textFormatter },
                {
                  field: 'type',
                  title: '流动时点',
                  width: 112,
                  align: 'center',
                  formatter: {
                    type: 'enum',
                    map: { start: '开始', end: '结束', transfer_batch: '分批转移' },
                    emptyText: '-'
                  }
                },
                { field: 'quantity', title: '变动用量', width: 110, align: 'right', formatter: numberFormatter },
                { field: 'quantity_fixed', title: '固定用量', width: 110, align: 'right', formatter: numberFormatter },
                { field: 'transferbatch', title: '转移批量', width: 110, align: 'right', formatter: numberFormatter },
                { field: 'priority', title: '优先级', width: 90, align: 'right', formatter: numberFormatter },
                { field: 'effective_start', title: '生效开始', width: 180, formatter: datetimeFormatter },
                { field: 'effective_end', title: '生效结束', width: 180, formatter: datetimeFormatter }
              ]
            )]
          },
          {
            key: 'resources',
            label: '关联资源',
            blocks: [detailGrid(
              'planning_routing_resources_grid',
              'routingResources',
              [
                { type: 'seq', title: '序号', width: 64, align: 'center' },
                { field: 'resource_id_label', title: '资源', minWidth: 220, fixed: 'left', formatter: textFormatter },
                { field: 'skill_id_label', title: '技能', minWidth: 180, formatter: textFormatter },
                { field: 'name', title: '名称', minWidth: 160, formatter: textFormatter },
                { field: 'quantity', title: '变动用量', width: 110, align: 'right', formatter: numberFormatter },
                { field: 'quantity_fixed', title: '固定用量', width: 110, align: 'right', formatter: numberFormatter },
                { field: 'setup', title: '换型', minWidth: 130, formatter: textFormatter },
                { field: 'priority', title: '优先级', width: 90, align: 'right', formatter: numberFormatter },
                { field: 'effective_start', title: '生效开始', width: 180, formatter: datetimeFormatter },
                { field: 'effective_end', title: '生效结束', width: 180, formatter: datetimeFormatter }
              ]
            )]
          },
          {
            key: 'dependencies',
            label: '工序依赖',
            blocks: [detailGrid(
              'planning_routing_dependencies_grid',
              'routingDependencies',
              [
                { type: 'seq', title: '序号', width: 64, align: 'center' },
                { field: 'blockedby_id_label', title: '前置工序', minWidth: 240, fixed: 'left', formatter: textFormatter },
                { field: 'operation_id_label', title: '当前工序', minWidth: 220, formatter: textFormatter },
                { field: 'quantity', title: '数量比例', width: 110, align: 'right', formatter: numberFormatter },
                { field: 'safety_leadtime', title: '安全提前期', width: 140, formatter: textFormatter },
                { field: 'hard_safety_leadtime', title: '硬安全提前期', width: 150, formatter: textFormatter }
              ]
            )]
          },
          {
            key: 'flow',
            label: '路线图',
            blocks: [{
              id: 'planning_routing_flow',
              kind: 'planningFlow',
              sourceKey: 'flow',
              height: 560,
              title: '工艺路线',
              description: '工序顺序、依赖关系、投入物料和占用资源。',
              fitViewOnInit: true
            }]
          }
        ]
      }
    ]
  };
}

export function buildPlanningBomPageSchema(): LowCodePageSchema {
  return {
    schemaVersion: 1,
    code: PLANNING_BOM_PAGE_CODE,
    route: PLANNING_BOM_ROUTE,
    title: 'BOM',
    pageType: 'custom',
    description: '查看产成品、工艺路线、工序和组件之间的递归结构。',
    layout: 'dashboard',
    status: 'published',
    keepAlive: true,
    dataSources: {
      bom: {
        key: 'bom',
        label: 'BOM 结构',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'getPlanningConsoleData',
        postData: {
          dataset: 'bom',
          filters: { itemId: '{{ forms.planning_bom_filter.itemId }}' }
        },
        autoLoad: true
      },
      itemOptions: optionSource('item', '产品与物料选项')
    },
    eventHandlers: [{
      event: 'planningBom.nodeSelect',
      blockId: 'planning_bom_tree',
      directives: [{
        type: 'navigate',
        route: '/dashboard/planning/{{ row.entityType }}/edit?id={{ row.entityId }}&fromPage=planning_bom_view'
      }]
    }],
    blocks: [
      {
        id: 'planning_bom_filter',
        kind: 'searchForm',
        title: 'BOM 筛选',
        targetSourceKey: 'bom',
        initialValues: { itemId: '' },
        schema: {
          columns: 3,
          fields: [
            selectField('itemId', '产品/物料', 'itemOptions', '全部产品与物料', 'bom')
          ],
          actions: searchActions()
        }
      },
      {
        id: 'planning_bom_tree',
        kind: 'planningBom',
        sourceKey: 'bom',
        height: 650,
        title: 'BOM',
        description: '按产品、工艺路线、工序和组件递归展开。',
        keyField: 'id',
        titleField: 'title',
        childrenField: 'children'
      }
    ]
  };
}

export function buildPlanningRouteDesignerPageSchema(): LowCodePageSchema {
  const base = buildPlanningRoutingPageSchema();
  const detailSourceKeys = [
    'routingSuboperations',
    'routingMaterials',
    'routingResources',
    'routingDependencies'
  ];
  const detailTabsBlock = base.blocks.find((block) => block.id === 'planning_routing_detail_tabs');
  const tabs = Array.isArray(detailTabsBlock?.tabs)
    ? detailTabsBlock.tabs.filter(isRecord)
    : [];
  const flowTab = tabs.find((tab) => tab.key === 'flow');
  const flowBlock = Array.isArray(flowTab?.blocks)
    ? flowTab.blocks.find(isRecord)
    : undefined;
  if (!detailTabsBlock || !flowBlock) {
    throw new Error('The planning routing page must define its flow and detail tabs.');
  }

  const flowSource = base.dataSources?.flow;
  const flowPostData = flowSource?.postData ?? {};
  const { requiredFilters: _requiredFilters, ...flowPostDataWithoutRequiredFilters } = flowPostData;
  const dataSources = Object.fromEntries(
    Object.entries(base.dataSources ?? {})
      .filter(([key]) => key === 'flow' || key === 'routeOptions' || detailSourceKeys.includes(key))
      .map(([key, source]) => key === 'flow'
        ? [key, {
            ...source,
            postData: {
              ...flowPostDataWithoutRequiredFilters,
              filters: { operationId: '{{ forms.planning_route_designer_filter.operationId }}' },
              requiredFilters: ['operationId']
            },
            autoLoad: false
          }]
        : [key, source])
  );

  return {
    ...base,
    code: PLANNING_ROUTE_DESIGNER_PAGE_CODE,
    route: PLANNING_ROUTE_DESIGNER_ROUTE,
    title: '工艺路线设计',
    description: '查看工艺路线，并在选中工序后查看其物料、资源、子工序和前置依赖。',
    dataSources,
    scriptPolicy: {
      capabilities: [
        'action.execute',
        'dialog.confirmLowCodePage',
        'message.success',
        'pageFunction.execute'
      ]
    },
    functions: [{
      name: 'newRoute',
      label: '新建路线',
      description: '在工序编辑页弹框中新建并保存一条工艺路线。',
      enabled: true,
      script: [
        'const result = await this.$dialog.confirmLowCodePage({',
        '  pageCode: "planning_operation-edit",',
        '  title: "新建路线",',
        '  confirmLabel: "保存路线",',
        '  cancelLabel: "取消",',
        '  submitOnConfirm: true,',
        '  requireSelection: false,',
        '  includeEventHistory: false,',
        '  dialog: { id: "planning-route-designer-new-route-dialog" }',
        '});',
        'if (!result || result.action !== "confirm") return null;',
        'await this.executeAction({',
        '  node: "planning_route_designer_filter",',
        '  method: "refreshOptions",',
        '  sourceKeys: ["routeOptions"]',
        '});',
        'await this.$message.success("工艺路线已保存。");',
        'return result;'
      ].join('\n')
    }],
    eventHandlers: [{
      event: 'planningFlow.nodeSelect',
      blockId: 'planning_route_designer_flow',
      directives: detailSourceKeys.map((sourceKey) => ({
        type: 'setSearchFilters',
        sourceKey,
        mode: 'replace',
        values: { operation_id: '{{ event.row.id }}' }
      }))
    }],
    blocks: [
      {
        id: 'planning_route_designer_actions',
        kind: 'buttonGroup',
        align: 'left',
        gap: 8,
        actions: [{
          code: 'planning-route-designer-new-route',
          label: '新建路线',
          type: 'button',
          mode: 'button',
          status: 'primary',
          icon: 'ri-add-line',
          permissionCode: 'planning.models.manage',
          script: 'return this.executeFunction({ name: "newRoute", args: {} });'
        }]
      },
      {
        id: 'planning_route_designer_filter',
        kind: 'searchForm',
        title: '工艺路线查询',
        targetSourceKey: 'flow',
        initialValues: { operationId: '' },
        schema: {
          columns: 1,
          fields: [
            selectField('operationId', '工艺路线', 'routeOptions', '请选择工艺路线', 'flow')
          ],
          actions: searchActions()
        }
      },
      {
        ...flowBlock,
        id: 'planning_route_designer_flow',
        title: '工艺路线',
        description: '选择工序后，关联信息将在下方子表中更新。',
        height: 560
      },
      {
        ...detailTabsBlock,
        id: 'planning_route_designer_detail_tabs',
        tabs: tabs.filter((tab) => tab.key !== 'flow')
      }
    ]
  } as LowCodePageSchema;
}

export const PLANNING_ROUTING_PAGE_SCHEMA = buildPlanningRoutingPageSchema();
export const PLANNING_ROUTE_DESIGNER_PAGE_SCHEMA = buildPlanningRouteDesignerPageSchema();
export const PLANNING_BOM_PAGE_SCHEMA = buildPlanningBomPageSchema();
