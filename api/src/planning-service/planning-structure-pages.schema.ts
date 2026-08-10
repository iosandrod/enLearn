import type { LowCodePageSchema } from '../lowcode-service/lowcode.schema';

export const PLANNING_ROUTING_PAGE_CODE = 'planning_routing_view';
export const PLANNING_ROUTING_ROUTE = '/dashboard/planning/routing-view';
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

function optionSource(optionType: 'item' | 'operation' | 'resource', label: string) {
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

export function buildPlanningRoutingPageSchema(): LowCodePageSchema {
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
            operationId: '{{ forms.planning_routing_filter.operationId }}'
          }
        },
        autoLoad: true
      },
      itemOptions: optionSource('item', '物料选项'),
      resourceOptions: optionSource('resource', '资源选项'),
      operationOptions: optionSource('operation', '工序选项')
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
        initialValues: { itemId: '', resourceId: '', operationId: '' },
        schema: {
          columns: 3,
          fields: [
            selectField('itemId', '产出物料', 'itemOptions', '全部物料', 'flow'),
            selectField('resourceId', '资源', 'resourceOptions', '全部资源', 'flow'),
            selectField('operationId', '工序', 'operationOptions', '全部工序', 'flow')
          ],
          actions: searchActions()
        }
      },
      {
        id: 'planning_routing_flow',
        kind: 'planningFlow',
        sourceKey: 'flow',
        height: 650,
        title: '工艺路线',
        description: '工序顺序、依赖关系、投入物料和占用资源。',
        fitViewOnInit: true
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

export const PLANNING_ROUTING_PAGE_SCHEMA = buildPlanningRoutingPageSchema();
export const PLANNING_BOM_PAGE_SCHEMA = buildPlanningBomPageSchema();
