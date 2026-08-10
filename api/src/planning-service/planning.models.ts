export type PlanningFieldKind =
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'uuid'
  | 'date'
  | 'datetime'
  | 'time'
  | 'interval'
  | 'json'
  | 'relation';

export type PlanningFieldDefinition = {
  name: string;
  label: string;
  kind: PlanningFieldKind;
  required?: boolean;
  default?: unknown;
  relation?: string;
  relationFilters?: Record<string, string | number | boolean>;
  relationLabelField?: string;
  relationOnDelete?: 'cascade' | 'restrict' | 'set null';
  relationTree?: boolean;
  relationFilterBindings?: Record<string, string>;
  options?: Array<{ label: string; value: string }>;
  readOnly?: boolean;
};

export type PlanningModelDefinition = {
  key: string;
  sourceTable: string;
  title: string;
  description: string;
  group:
    | '基础数据'
    | '采购配送'
    | '产能工艺'
    | '需求计划'
    | '计划结果'
    | '计划配置'
    | '预测管理'
    | '诊断分析'
    | '执行管理'
    | '场景管理'
    | '时间维度'
    | '扩展属性'
    | '历史归档'
    | '集成管理';
  icon: string;
  businessKey?: 'name' | 'reference' | 'code';
  businessKeyUnique?: boolean;
  access?: 'manage' | 'view';
  fields: PlanningFieldDefinition[];
};

const text = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'text', ...options });
const number = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'number', ...options });
const integer = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'integer', ...options });
const bool = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'boolean', ...options });
const uuid = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'uuid', ...options });
const date = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'date', ...options });
const datetime = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'datetime', ...options });
const time = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'time', ...options });
const interval = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'interval', ...options });
const json = (
  name: string,
  label: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'json', ...options });
const relation = (
  name: string,
  label: string,
  target: string,
  options: Partial<PlanningFieldDefinition> = {}
): PlanningFieldDefinition => ({ name, label, kind: 'relation', relation: target, ...options });
const choices = (...values: string[]) => values.map((value) => ({ label: value, value }));

const auditFields = [
  text('source', '数据来源'),
  datetime('lastmodified', '最后修改', { readOnly: true })
];
const categoryFields = [
  text('description', '说明'),
  text('category', '分类'),
  text('subcategory', '子分类')
];
const masterCategoryFields = (targetType: 'item' | 'customer' | 'supplier') => [
  text('description', '说明'),
  relation('category_id', '类别', 'planning_category', {
    relationFilters: { target_type: targetType, status: 'active' },
    relationLabelField: 'name',
    relationOnDelete: 'restrict',
    relationTree: true
  }),
  text('category', '分类', { readOnly: true }),
  text('subcategory', '子分类', { readOnly: true })
];
const hierarchyFields = (target: string) => [
  relation('owner_id', '上级', target),
  integer('lft', '左节点', { readOnly: true }),
  integer('rght', '右节点', { readOnly: true }),
  integer('lvl', '层级', { readOnly: true })
];

export const PLANNING_MODEL_DEFINITIONS: PlanningModelDefinition[] = [
  {
    key: 'planning_calendar', sourceTable: 'calendar', title: '日历', group: '基础数据',
    icon: 'ri-calendar-line', businessKey: 'name', description: '工作时间、能力或阈值日历。',
    fields: [text('name', '名称', { required: true }), ...categoryFields, number('defaultvalue', '默认值', { default: 0 }), ...auditFields]
  },
  {
    key: 'planning_calendarbucket', sourceTable: 'calendarbucket', title: '日历明细', group: '基础数据',
    icon: 'ri-calendar-event-line', description: '日历生效区间、周内日期和每日时间段。',
    fields: [
      relation('calendar_id', '日历', 'planning_calendar', { required: true }),
      datetime('startdate', '开始日期', { default: '1971-01-01T00:00:00Z' }),
      datetime('enddate', '结束日期', { default: '2030-12-31T00:00:00Z' }),
      number('value', '值', { required: true, default: 0 }), integer('priority', '优先级', { default: 0 }),
      bool('monday', '周一', { default: true }), bool('tuesday', '周二', { default: true }),
      bool('wednesday', '周三', { default: true }), bool('thursday', '周四', { default: true }),
      bool('friday', '周五', { default: true }), bool('saturday', '周六', { default: true }),
      bool('sunday', '周日', { default: true }), time('starttime', '开始时间', { default: '00:00:00' }),
      time('endtime', '结束时间', { default: '23:59:59' }), ...auditFields
    ]
  },
  {
    key: 'planning_category', sourceTable: 'category', title: '主数据类别', group: '基础数据',
    icon: 'ri-folder-tree-line', businessKey: 'code', businessKeyUnique: false,
    description: '统一维护物料、客户和供应商的账套级层级类别。',
    fields: [
      text('target_type', '类别对象', {
        required: true,
        options: [
          { label: '物料', value: 'item' },
          { label: '客户', value: 'customer' },
          { label: '供应商', value: 'supplier' }
        ]
      }),
      text('code', '类别编码', { required: true }),
      text('name', '类别名称', { required: true }),
      relation('parent_id', '上级类别', 'planning_category', {
        relationFilters: { status: 'active' },
        relationFilterBindings: { target_type: 'target_type' },
        relationLabelField: 'name',
        relationOnDelete: 'restrict',
        relationTree: true
      }),
      text('description', '说明'),
      text('status', '状态', {
        required: true,
        default: 'active',
        options: [
          { label: '启用', value: 'active' },
          { label: '停用', value: 'inactive' }
        ]
      }),
      integer('sort_order', '排序', { default: 0 }),
      json('metadata', '扩展信息', { default: {} }),
      ...auditFields
    ]
  },
  {
    key: 'planning_location', sourceTable: 'location', title: '地点', group: '基础数据',
    icon: 'ri-map-pin-line', businessKey: 'name', description: '工厂、仓库和其他计划地点。',
    fields: [text('name', '名称', { required: true }), ...hierarchyFields('planning_location'), ...categoryFields, relation('available_id', '可用日历', 'planning_calendar'), ...auditFields]
  },
  {
    key: 'planning_customer', sourceTable: 'customer', title: '客户', group: '基础数据',
    icon: 'ri-user-star-line', businessKey: 'name', description: '计划需求所引用的客户主数据。',
    fields: [text('name', '名称', { required: true }), ...hierarchyFields('planning_customer'), ...masterCategoryFields('customer'), ...auditFields]
  },
  {
    key: 'planning_item', sourceTable: 'item', title: '物料', group: '基础数据',
    icon: 'ri-box-3-line', businessKey: 'name', description: '原料、半成品和成品物料。',
    fields: [
      text('name', '名称', { required: true }), ...hierarchyFields('planning_item'), ...masterCategoryFields('item'),
      number('cost', '成本'), text('type', '计划类型', { options: choices('make to stock', 'make to order') }),
      number('weight', '重量'), number('volume', '体积'), integer('periodofcover', '覆盖周期'), text('uom', '单位'),
      integer('latedemandcount', '延期需求数', { readOnly: true }), number('latedemandquantity', '延期需求量', { readOnly: true }),
      number('latedemandvalue', '延期需求金额', { readOnly: true }), integer('unplanneddemandcount', '未排需求数', { readOnly: true }),
      number('unplanneddemandquantity', '未排需求量', { readOnly: true }), number('unplanneddemandvalue', '未排需求金额', { readOnly: true }),
      text('demand_pattern', '需求模式', { readOnly: true }), number('adi', 'ADI', { readOnly: true }), number('cv2', 'CV²', { readOnly: true }),
      number('outlier_1b', '1期异常值', { readOnly: true }), number('outlier_6b', '6期异常值', { readOnly: true }),
      number('outlier_12b', '12期异常值', { readOnly: true }), ...auditFields
    ]
  },
  {
    key: 'planning_supplier', sourceTable: 'supplier', title: '供应商', group: '基础数据',
    icon: 'ri-truck-line', businessKey: 'name', description: '采购来源与供应商主数据。',
    fields: [text('name', '名称', { required: true }), ...hierarchyFields('planning_supplier'), ...masterCategoryFields('supplier'), relation('available_id', '可用日历', 'planning_calendar'), ...auditFields]
  },
  {
    key: 'planning_itemsupplier', sourceTable: 'itemsupplier', title: '物料供应', group: '采购配送',
    icon: 'ri-shopping-bag-3-line', description: '物料、供应商和地点之间的采购规则。',
    fields: [
      relation('item_id', '物料', 'planning_item', { required: true }), relation('location_id', '地点', 'planning_location'),
      relation('supplier_id', '供应商', 'planning_supplier', { required: true }), interval('leadtime', '采购提前期'),
      interval('extra_safety_leadtime', '额外安全提前期'), interval('hard_safety_leadtime', '硬安全提前期'),
      number('sizeminimum', '最小批量', { default: 1 }), number('sizemultiple', '批量倍数'), number('sizemaximum', '最大批量'),
      interval('batchwindow', '合批窗口', { default: '7 days' }), number('cost', '采购成本'), integer('priority', '优先级', { default: 1 }),
      datetime('effective_start', '生效开始', { default: '1971-01-01T00:00:00Z' }), datetime('effective_end', '生效结束', { default: '2030-12-31T00:00:00Z' }),
      relation('resource_id', '资源', 'planning_resource'), number('resource_qty', '资源用量', { default: 1 }), interval('fence', '冻结期'), ...auditFields
    ]
  },
  {
    key: 'planning_itemdistribution', sourceTable: 'itemdistribution', title: '物料配送', group: '采购配送',
    icon: 'ri-route-line', description: '地点之间的物料补货和配送通道。',
    fields: [
      relation('item_id', '物料', 'planning_item', { required: true }), relation('location_id', '目的地点', 'planning_location', { required: true }),
      relation('origin_id', '来源地点', 'planning_location', { required: true }), interval('leadtime', '配送提前期'),
      number('sizeminimum', '最小批量', { default: 1 }), number('sizemultiple', '批量倍数'), number('sizemaximum', '最大批量'),
      interval('batchwindow', '合批窗口', { default: '7 days' }), number('cost', '配送成本'), integer('priority', '优先级', { default: 1 }),
      datetime('effective_start', '生效开始', { default: '1971-01-01T00:00:00Z' }), datetime('effective_end', '生效结束', { default: '2030-12-31T00:00:00Z' }),
      relation('resource_id', '资源', 'planning_resource'), number('resource_qty', '资源用量', { default: 1 }), interval('fence', '冻结期'), ...auditFields
    ]
  },
  {
    key: 'planning_buffer', sourceTable: 'buffer', title: '库存缓冲区', group: '采购配送',
    icon: 'ri-stack-line', description: '物料在地点上的库存状态和上下限。',
    fields: [
      ...categoryFields, text('type', '类型', { default: 'default', options: choices('default', 'infinite') }),
      relation('location_id', '地点', 'planning_location', { required: true }), relation('item_id', '物料', 'planning_item', { required: true }),
      text('batch', '批次', { default: '' }), number('onhand', '现有量', { default: 0 }), number('minimum', '最小库存', { default: 0 }),
      relation('minimum_calendar_id', '最小库存日历', 'planning_calendar'), interval('min_interval', '最小间隔'),
      number('maximum', '最大库存', { default: 0 }), relation('maximum_calendar_id', '最大库存日历', 'planning_calendar'), ...auditFields
    ]
  },
  {
    key: 'planning_setupmatrix', sourceTable: 'setupmatrix', title: '换型矩阵', group: '产能工艺',
    icon: 'ri-table-line', businessKey: 'name', description: '资源换型规则的集合。',
    fields: [text('name', '名称', { required: true }), ...auditFields]
  },
  {
    key: 'planning_resource', sourceTable: 'resource', title: '资源', group: '产能工艺',
    icon: 'ri-hammer-line', businessKey: 'name', description: '设备、人员、产线等能力资源。',
    fields: [
      text('name', '名称', { required: true }), ...hierarchyFields('planning_resource'), ...categoryFields,
      text('type', '类型', { default: 'default', options: choices('default', 'buckets', 'buckets_day', 'buckets_week', 'buckets_month', 'infinite') }),
      bool('constrained', '受约束'), number('maximum', '最大能力', { default: 1 }), relation('maximum_calendar_id', '最大能力日历', 'planning_calendar'),
      relation('available_id', '可用日历', 'planning_calendar'), relation('location_id', '地点', 'planning_location'), number('cost', '单位成本'),
      interval('maxearly', '最大提前量'), relation('setupmatrix_id', '换型矩阵', 'planning_setupmatrix'), text('setup', '当前换型'),
      number('efficiency', '效率'), relation('efficiency_calendar_id', '效率日历', 'planning_calendar'), integer('overloadcount', '超载次数', { readOnly: true }), ...auditFields
    ]
  },
  {
    key: 'planning_skill', sourceTable: 'skill', title: '技能', group: '产能工艺',
    icon: 'ri-award-line', businessKey: 'name', description: '资源能力所需或具备的技能。',
    fields: [text('name', '名称', { required: true }), ...auditFields]
  },
  {
    key: 'planning_resourceskill', sourceTable: 'resourceskill', title: '资源技能', group: '产能工艺',
    icon: 'ri-user-settings-line', description: '资源与技能的有效期和优先级关联。',
    fields: [
      relation('resource_id', '资源', 'planning_resource', { required: true }), relation('skill_id', '技能', 'planning_skill', { required: true }),
      datetime('effective_start', '生效开始'), datetime('effective_end', '生效结束'), integer('priority', '优先级', { default: 1 }), ...auditFields
    ]
  },
  {
    key: 'planning_setuprule', sourceTable: 'setuprule', title: '换型规则', group: '产能工艺',
    icon: 'ri-git-merge-line', description: '换型矩阵中的前后状态、耗时和成本规则。',
    fields: [
      relation('setupmatrix_id', '换型矩阵', 'planning_setupmatrix', { required: true }), integer('priority', '优先级', { required: true }),
      text('fromsetup', '原换型'), text('tosetup', '目标换型'), interval('duration', '换型时长'), number('cost', '换型成本'),
      relation('resource_id', '限定资源', 'planning_resource'), ...auditFields
    ]
  },
  {
    key: 'planning_operation', sourceTable: 'operation', title: '工序', group: '产能工艺',
    icon: 'ri-settings-3-line', businessKey: 'name', description: '制造工序、路线、备选与拆分结构。',
    fields: [
      text('name', '名称', { required: true }), text('type', '类型', { default: 'fixed_time', options: choices('fixed_time', 'time_per', 'routing', 'alternate', 'split') }),
      ...categoryFields, relation('item_id', '产出物料', 'planning_item'), relation('location_id', '地点', 'planning_location', { required: true }),
      relation('owner_id', '上级工序', 'planning_operation'), integer('priority', '优先级', { default: 1 }), datetime('effective_start', '生效开始'),
      datetime('effective_end', '生效结束'), interval('fence', '冻结期'), interval('posttime', '后处理时间'), number('sizeminimum', '最小批量', { default: 1 }),
      number('sizemultiple', '批量倍数'), number('sizemaximum', '最大批量'), number('cost', '工序成本'), interval('duration', '固定时长'),
      interval('duration_per', '单位时长'), text('search', '搜索模式', { options: choices('PRIORITY', 'MINCOST', 'MINPENALTY', 'MINCOSTPENALTY') }),
      relation('available_id', '可用日历', 'planning_calendar'), interval('batchwindow', '合批窗口'), ...auditFields
    ]
  },
  {
    key: 'planning_operationmaterial', sourceTable: 'operationmaterial', title: '工序物料', group: '产能工艺',
    icon: 'ri-node-tree', description: '工序的物料消耗、产出和批量转移。',
    fields: [
      relation('operation_id', '工序', 'planning_operation', { required: true }), relation('item_id', '物料', 'planning_item', { required: true }),
      relation('location_id', '地点', 'planning_location'), number('quantity', '变动用量', { default: 1 }), number('quantity_fixed', '固定用量'),
      text('type', '流动时点', { default: 'start', options: choices('start', 'end', 'transfer_batch') }),
      datetime('effective_start', '生效开始', { default: '1971-01-01T00:00:00Z' }), datetime('effective_end', '生效结束', { default: '2030-12-31T00:00:00Z' }),
      text('name', '名称'), integer('priority', '优先级', { default: 1 }), text('search', '搜索模式', { options: choices('PRIORITY', 'MINCOST', 'MINPENALTY', 'MINCOSTPENALTY') }),
      number('transferbatch', '转移批量'), interval('offset', '偏移时间'), ...auditFields
    ]
  },
  {
    key: 'planning_operationresource', sourceTable: 'operationresource', title: '工序资源', group: '产能工艺',
    icon: 'ri-tools-line', description: '工序所消耗的资源与技能。',
    fields: [
      relation('operation_id', '工序', 'planning_operation', { required: true }), relation('resource_id', '资源', 'planning_resource', { required: true }),
      relation('skill_id', '技能', 'planning_skill'), number('quantity', '变动用量', { default: 1 }), number('quantity_fixed', '固定用量'),
      datetime('effective_start', '生效开始', { default: '1971-01-01T00:00:00Z' }), datetime('effective_end', '生效结束', { default: '2030-12-31T00:00:00Z' }),
      text('name', '名称'), integer('priority', '优先级', { default: 1 }), text('setup', '换型'),
      text('search', '搜索模式', { options: choices('PRIORITY', 'MINCOST', 'MINPENALTY', 'MINCOSTPENALTY') }), ...auditFields
    ]
  },
  {
    key: 'planning_suboperation', sourceTable: 'suboperation', title: '子工序', group: '产能工艺',
    icon: 'ri-git-branch-line', description: '路线、备选和拆分工序的成员关系。',
    fields: [
      relation('operation_id', '父工序', 'planning_operation', { required: true }), integer('priority', '优先级', { required: true, default: 1 }),
      relation('suboperation_id', '子工序', 'planning_operation', { required: true }),
      datetime('effective_start', '生效开始', { default: '1971-01-01T00:00:00Z' }), datetime('effective_end', '生效结束', { default: '2030-12-31T00:00:00Z' }), ...auditFields
    ]
  },
  {
    key: 'planning_operation_dependency', sourceTable: 'operation_dependency', title: '工序依赖', group: '产能工艺',
    icon: 'ri-links-line', description: '工序之间的前置依赖和安全提前期。',
    fields: [
      relation('operation_id', '工序', 'planning_operation', { required: true }), relation('blockedby_id', '前置工序', 'planning_operation', { required: true }),
      number('quantity', '数量比例', { default: 1 }), interval('safety_leadtime', '安全提前期'), interval('hard_safety_leadtime', '硬安全提前期'), ...auditFields
    ]
  },
  {
    key: 'planning_demand', sourceTable: 'demand', title: '需求', group: '需求计划',
    icon: 'ri-file-list-3-line', businessKey: 'name', description: '待交付的客户需求和计划结果。',
    fields: [
      text('name', '需求编号', { required: true }), text('owner', '上级需求'), ...categoryFields,
      relation('customer_id', '客户', 'planning_customer', { required: true }), relation('item_id', '物料', 'planning_item', { required: true }),
      relation('location_id', '地点', 'planning_location', { required: true }), datetime('due', '交期', { required: true }),
      text('status', '状态', { default: 'open', options: choices('inquiry', 'quote', 'open', 'closed', 'canceled') }),
      relation('operation_id', '交付工序', 'planning_operation'), number('quantity', '数量', { required: true }), integer('priority', '优先级', { required: true, default: 10 }),
      number('minshipment', '最小发运量'), interval('maxlateness', '最大延期'), text('policy', '计划策略', { default: 'independent', options: choices('independent', 'alltogether', 'inratio') }),
      text('batch', '批次'), interval('delay', '延期', { readOnly: true }), number('plannedquantity', '已计划量', { readOnly: true }),
      datetime('deliverydate', '计划交期', { readOnly: true }), json('plan', '计划明细', { readOnly: true, default: {} }),
      text('source_type', '来源类型', { readOnly: true, default: 'manual', options: choices('manual', 'sales_order_line', 'forecast', 'external') }),
      text('source_system', '来源系统', { readOnly: true, default: 'enlearn' }), text('source_key', '来源唯一键', { readOnly: true }),
      uuid('source_order_id', '来源订单编号', { readOnly: true }), uuid('source_line_id', '来源明细编号', { readOnly: true }),
      text('source_doc_no', '来源单号', { readOnly: true }), text('source_line_no', '来源行号', { readOnly: true }),
      datetime('source_updated_at', '来源更新时间', { readOnly: true }),
      text('sync_status', '同步状态', { readOnly: true, default: 'manual', options: choices('manual', 'pending', 'synced', 'ignored', 'error') }),
      text('sync_message', '同步消息', { readOnly: true }), ...auditFields
    ]
  },
  {
    key: 'planning_operationplan', sourceTable: 'operationplan', title: '计划订单', group: '计划结果',
    icon: 'ri-calendar-check-line', businessKey: 'reference', description: '制造、采购、配送、交付和库存计划订单。',
    fields: [
      text('reference', '计划单号', { required: true }), text('status', '状态', { options: choices('proposed', 'approved', 'confirmed', 'completed', 'closed') }),
      text('type', '订单类型', { required: true, default: 'MO', options: choices('STCK', 'MO', 'WO', 'PO', 'DO', 'DLVR') }),
      number('quantity', '数量', { required: true, default: 1 }), number('quantity_completed', '完成数量'), number('color', '颜色值', { default: 0 }),
      datetime('startdate', '开始时间'), datetime('enddate', '结束时间'), text('remark', '备注'), number('criticality', '关键度', { readOnly: true }),
      interval('delay', '延期', { readOnly: true }), json('plan', '计划明细', { readOnly: true, default: {} }), relation('operation_id', '工序', 'planning_operation'),
      relation('owner_id', '上级计划单', 'planning_operationplan'), text('batch', '批次'), relation('item_id', '物料', 'planning_item'),
      relation('origin_id', '来源地点', 'planning_location'), relation('destination_id', '目的地点', 'planning_location'), relation('supplier_id', '供应商', 'planning_supplier'),
      relation('location_id', '地点', 'planning_location'), relation('demand_id', '需求', 'planning_demand'), datetime('due', '需求日期'), text('name', '名称'),
      text('forecast', '预测编号'), relation('plan_version_id', '计划版本', 'planning_plan_version'), ...auditFields
    ]
  },
  {
    key: 'planning_operationplanresource', sourceTable: 'operationplanresource', title: '计划资源', group: '计划结果',
    icon: 'ri-speed-up-line', description: '计划订单的资源负荷明细。',
    fields: [
      relation('resource_id', '资源', 'planning_resource', { required: true }), relation('operationplan_id', '计划订单', 'planning_operationplan', { required: true }),
      relation('plan_version_id', '计划版本', 'planning_plan_version', { readOnly: true }),
      number('quantity', '负荷数量', { default: 1 }), text('setup', '换型'), text('status', '状态', { options: choices('proposed', 'confirmed', 'closed') }), ...auditFields
    ]
  },
  {
    key: 'planning_operationplanmaterial', sourceTable: 'operationplanmaterial', title: '计划物料', group: '计划结果',
    icon: 'ri-exchange-box-line', description: '计划订单的库存消耗和产出明细。',
    fields: [
      relation('item_id', '物料', 'planning_item', { required: true }), relation('location_id', '地点', 'planning_location', { required: true }),
      relation('operationplan_id', '计划订单', 'planning_operationplan', { required: true }), number('quantity', '数量', { required: true }),
      relation('plan_version_id', '计划版本', 'planning_plan_version', { readOnly: true }),
      datetime('flowdate', '流动时间', { required: true }), number('onhand', '结余库存', { readOnly: true }), number('minimum', '最小库存', { readOnly: true }),
      number('periodofcover', '覆盖周期', { readOnly: true }), text('status', '状态', { options: choices('proposed', 'confirmed', 'closed') }), ...auditFields
    ]
  },
  {
    key: 'planning_parameter', sourceTable: 'common_parameter', title: '计划参数', group: '计划配置',
    icon: 'ri-equalizer-2-line', businessKey: 'name', description: '账套级排产、预测和展示参数，对应 frePPLe common_parameter。',
    fields: [
      text('name', '参数编码', { required: true }), text('value', '参数值'), text('description', '说明'), ...auditFields
    ]
  },
  {
    key: 'planning_forecast', sourceTable: 'forecast', title: '预测对象', group: '预测管理',
    icon: 'ri-line-chart-line', businessKey: 'name', description: '按客户、物料和地点定义的预测对象及预测方法。',
    fields: [
      text('name', '预测编号', { required: true }), ...categoryFields,
      relation('customer_id', '客户', 'planning_customer', { required: true }),
      relation('item_id', '物料', 'planning_item', { required: true }),
      relation('location_id', '地点', 'planning_location', { required: true }),
      text('batch', '批次'), text('method', '预测方法', {
        default: 'automatic', options: choices('automatic', 'constant', 'trend', 'seasonal', 'intermittent', 'moving average', 'manual', 'aggregate')
      }),
      integer('priority', '优先级', { required: true, default: 10 }), number('minshipment', '最小发运量'),
      interval('maxlateness', '最大延期'), bool('discrete', '离散数量', { default: true }),
      number('out_smape', '预测误差', { readOnly: true }), text('out_method', '计算方法', { readOnly: true }),
      number('out_deviation', '标准差', { readOnly: true }), bool('planned', '参与排产', { default: true }),
      relation('operation_id', '交付工序', 'planning_operation'), ...auditFields
    ]
  },
  {
    key: 'planning_measure', sourceTable: 'measure', title: '预测度量', group: '预测管理',
    icon: 'ri-ruler-2-line', businessKey: 'name', description: '预测时间序列的度量定义、计算表达式和编辑方式。',
    fields: [
      text('name', '度量编码', { required: true }), text('label', '显示名称'), text('description', '说明'),
      text('type', '类型', { default: 'aggregate', options: choices('aggregate', 'local', 'computed') }),
      text('mode_future', '未来模式', { default: 'edit', options: choices('edit', 'view', 'hide') }),
      text('mode_past', '历史模式', { default: 'edit', options: choices('edit', 'view', 'hide') }),
      text('compute_expression', '计算表达式'), text('update_expression', '更新表达式'),
      bool('initially_hidden', '默认隐藏'), text('formatter', '格式', { default: 'number', options: choices('number', 'currency') }),
      bool('discrete', '离散数量'), number('defaultvalue', '默认值', { default: 0 }), text('overrides', '覆盖度量'), ...auditFields
    ]
  },
  {
    key: 'planning_forecastplan', sourceTable: 'forecastplan', title: '预测计划', group: '预测管理',
    icon: 'ri-calendar-todo-line', description: '按客户、物料、地点和时间桶保存预测及订单度量。',
    fields: [
      relation('forecast_id', '预测对象', 'planning_forecast'), relation('item_id', '物料', 'planning_item', { required: true }),
      relation('location_id', '地点', 'planning_location', { required: true }), relation('customer_id', '客户', 'planning_customer', { required: true }),
      datetime('startdate', '开始时间', { required: true }), datetime('enddate', '结束时间', { required: true }),
      json('value', '度量值', { required: true, default: {} })
    ]
  },
  {
    key: 'planning_problem', sourceTable: 'out_problem', title: '计划问题', group: '诊断分析',
    icon: 'ri-error-warning-line', access: 'view', description: '求解器输出的缺料、延期、超载等计划问题。',
    fields: [
      relation('run_id', '运行任务', 'planning_run'), relation('plan_version_id', '计划版本', 'planning_plan_version', { readOnly: true }),
      text('entity', '实体', { required: true }), text('owner', '对象', { required: true }),
      text('name', '问题类型', { required: true }), text('description', '问题说明', { required: true }),
      datetime('startdate', '开始时间', { required: true }), datetime('enddate', '结束时间', { required: true })
    ]
  },
  {
    key: 'planning_constraint', sourceTable: 'out_constraint', title: '需求约束', group: '诊断分析',
    icon: 'ri-git-close-pull-request-line', access: 'view', description: '求解器输出的需求、预测和物料约束冲突。',
    fields: [
      relation('run_id', '运行任务', 'planning_run'), relation('plan_version_id', '计划版本', 'planning_plan_version', { readOnly: true }),
      relation('demand_id', '需求', 'planning_demand'), relation('forecast_id', '预测对象', 'planning_forecast'),
      relation('item_id', '物料', 'planning_item'), text('entity', '实体', { required: true }), text('owner', '对象', { required: true }),
      text('name', '约束类型', { required: true }), text('description', '约束说明', { required: true }),
      datetime('startdate', '开始时间', { required: true }), datetime('enddate', '结束时间', { required: true })
    ]
  },
  {
    key: 'planning_resourceplan', sourceTable: 'out_resourceplan', title: '资源负荷', group: '诊断分析',
    icon: 'ri-bar-chart-grouped-line', access: 'view', description: '按资源和时间桶汇总的可用、占用、换型及空闲能力。',
    fields: [
      relation('run_id', '运行任务', 'planning_run'), relation('plan_version_id', '计划版本', 'planning_plan_version', { readOnly: true }),
      relation('resource_id', '资源', 'planning_resource', { required: true }),
      datetime('startdate', '开始时间', { required: true }), number('available', '可用能力'), number('unavailable', '不可用能力'),
      number('setup', '换型负荷'), number('load', '总负荷'), number('free', '空闲能力'), number('load_confirmed', '确认负荷')
    ]
  },
  {
    key: 'planning_run', sourceTable: 'execute_log', title: '排产运行', group: '执行管理',
    icon: 'ri-play-circle-line', access: 'view', description: '排产、预测、归档和导出任务的运行状态与日志投影。',
    fields: [
      relation('scenario_id', '场景', 'planning_scenario'), relation('workflow_job_id', '作业定义', 'planning_schedule'),
      text('name', '任务名称', { required: true }), datetime('submitted', '提交时间', { required: true }),
      datetime('started', '开始时间'), datetime('finished', '完成时间'), json('arguments', '运行参数', { default: {} }),
      text('status', '状态', { required: true, default: 'queued', options: choices('queued', 'running', 'succeeded', 'failed', 'canceled') }),
      text('message', '消息'), text('logfile', '日志文件'), text('trigger_run_id', '调度运行编号'),
      integer('processid', '进程编号'), integer('progress', '进度', { default: 0 }),
      integer('attempt', '尝试次数', { readOnly: true, default: 1 }),
      json('output', '运行输出', { readOnly: true }), uuid('submitted_by', '提交人编号')
    ]
  },
  {
    key: 'planning_schedule', sourceTable: 'execute_schedule', title: '排产调度', group: '执行管理',
    icon: 'ri-timer-line', description: '排产作业定义和定时调度配置，可映射到 enLearn 作业调度引擎。',
    fields: [
      text('name', '调度名称', { required: true }), text('job_type', '任务类型', {
        required: true, default: 'supply_plan', options: choices('supply_plan', 'forecast', 'archive', 'export', 'scenario_copy')
      }),
      relation('scenario_id', '场景', 'planning_scenario'), datetime('next_run', '下次运行'),
      text('timezone', '时区', { default: 'Asia/Shanghai' }), text('cron_expr', 'Cron 表达式'),
      bool('enabled', '启用', { default: false }), text('email_failure', '失败通知邮箱'), text('email_success', '成功通知邮箱'),
      json('data', '任务参数', { default: {} }), text('trigger_task_id', '调度任务编码'), text('schedule_id', '外部调度编号'), ...auditFields
    ]
  },
  {
    key: 'planning_export', sourceTable: 'execute_export', title: '排产导出', group: '执行管理',
    icon: 'ri-file-download-line', description: '排产数据和报表导出定义。',
    fields: [
      text('name', '导出文件名', { required: true }), text('sql', 'SQL 定义'), text('report', '报表编码'),
      json('arguments', '导出参数', { default: {} }), ...auditFields
    ]
  },
  {
    key: 'planning_scenario', sourceTable: 'common_scenario', title: '计划场景', group: '场景管理',
    icon: 'ri-git-branch-line', businessKey: 'name', description: '账套内的基线和 what-if 计划场景元数据。',
    fields: [
      text('name', '场景编码', { required: true }), text('description', '说明'),
      text('status', '状态', { required: true, default: 'free', options: choices('free', 'in use', 'busy') }),
      relation('source_scenario_id', '来源场景', 'planning_scenario'), text('help_url', '帮助地址'), json('info', '场景信息', { default: {} }),
      datetime('copied_at', '复制时间'), datetime('released_at', '释放时间'), ...auditFields
    ]
  },
  {
    key: 'planning_bucket', sourceTable: 'common_bucket', title: '时间桶', group: '时间维度',
    icon: 'ri-calendar-2-line', businessKey: 'name', description: '日、周、月、季度等报表和预测时间维度。',
    fields: [
      text('name', '时间桶编码', { required: true }), text('description', '说明'), integer('level', '粒度级别', { required: true }), ...auditFields
    ]
  },
  {
    key: 'planning_bucketdetail', sourceTable: 'common_bucketdetail', title: '时间桶明细', group: '时间维度',
    icon: 'ri-calendar-event-line', description: '时间桶中的具体起止区间。',
    fields: [
      relation('bucket_id', '时间桶', 'planning_bucket', { required: true }), text('name', '期间名称', { required: true }),
      datetime('startdate', '开始时间', { required: true }), datetime('enddate', '结束时间', { required: true }), ...auditFields
    ]
  },
  {
    key: 'planning_attribute', sourceTable: 'common_attribute', title: '扩展属性', group: '扩展属性',
    icon: 'ri-list-settings-line', description: '排产模型的自定义字段定义；字段值由模型扩展 JSON 保存。',
    fields: [
      text('model', '模型', { required: true }), text('name', '字段编码', { required: true }), text('label', '显示名称', { required: true }),
      text('type', '字段类型', { required: true, options: choices('string', 'boolean', 'number', 'integer', 'date', 'datetime', 'duration', 'time', 'jsonb') }),
      bool('editable', '可编辑', { default: true }), bool('initially_hidden', '默认隐藏', { default: false }), ...auditFields
    ]
  },
  {
    key: 'planning_archive_manager', sourceTable: 'ax_manager', title: '归档快照', group: '历史归档',
    icon: 'ri-archive-line', access: 'view', description: '计划历史快照的统计和保留信息。',
    fields: [
      relation('scenario_id', '场景', 'planning_scenario'), datetime('snapshot_date', '快照时间', { required: true }),
      integer('total_records', '总记录数', { required: true }), integer('buffer_records', '库存记录数', { required: true }),
      integer('demand_records', '需求记录数', { required: true }), integer('operationplan_records', '计划单记录数', { required: true })
    ]
  },
  {
    key: 'planning_archived_buffer', sourceTable: 'ax_buffer', title: '历史库存', group: '历史归档',
    icon: 'ri-stack-history-line', access: 'view', description: '快照时点的物料库存和安全库存。',
    fields: [
      relation('snapshot_id', '归档快照', 'planning_archive_manager', { required: true }), text('item', '物料', { required: true }),
      text('location', '地点', { required: true }), text('batch', '批次'), number('cost', '成本'), number('onhand', '现有量'), number('safetystock', '安全库存')
    ]
  },
  {
    key: 'planning_archived_demand', sourceTable: 'ax_demand', title: '历史需求', group: '历史归档',
    icon: 'ri-file-history-line', access: 'view', description: '快照时点的需求、交付日期和已计划数量。',
    fields: [
      relation('snapshot_id', '归档快照', 'planning_archive_manager', { required: true }), text('name', '需求编号', { required: true }),
      text('item', '物料', { required: true }), number('cost', '成本'), text('location', '地点', { required: true }),
      text('customer', '客户', { required: true }), datetime('due', '交期', { required: true }), text('status', '状态'),
      integer('priority', '优先级', { required: true }), number('quantity', '数量', { required: true }),
      datetime('deliverydate', '计划交期'), number('quantityplanned', '已计划数量')
    ]
  },
  {
    key: 'planning_archived_operationplan', sourceTable: 'ax_operationplan', title: '历史计划订单', group: '历史归档',
    icon: 'ri-calendar-check-line', access: 'view', description: '快照时点的制造、采购、配送和交付计划。',
    fields: [
      relation('snapshot_id', '归档快照', 'planning_archive_manager', { required: true }), text('reference', '计划单号', { required: true }),
      text('status', '状态'), text('type', '订单类型', { required: true }), number('quantity', '数量', { required: true }),
      datetime('startdate', '开始时间'), datetime('enddate', '结束时间'), text('operation', '工序'), text('owner', '上级计划单'),
      text('batch', '批次'), text('item', '物料', { required: true }), number('item_cost', '物料成本'), number('itemsupplier_cost', '采购成本'),
      text('origin', '来源地点'), text('destination', '目的地点'), text('supplier', '供应商'), text('location', '地点'),
      text('demand', '需求'), datetime('due', '需求日期'), text('name', '名称')
    ]
  },
  {
    key: 'planning_source_mapping', sourceTable: 'source_mapping', title: '主数据映射', group: '集成管理',
    icon: 'ri-git-merge-line', description: '外部或业务系统编码到排产客户、物料、地点、供应商、资源和工序的账套内映射。',
    fields: [
      text('source_system', '来源系统', { required: true, default: 'enlearn' }),
      text('entity_type', '实体类型', { required: true, options: choices('item', 'customer', 'location', 'supplier', 'resource', 'operation') }),
      text('source_key', '来源编码', { required: true }), text('source_name', '来源名称'),
      relation('item_id', '目标物料', 'planning_item'), relation('customer_id', '目标客户', 'planning_customer'),
      relation('location_id', '目标地点', 'planning_location'), relation('supplier_id', '目标供应商', 'planning_supplier'),
      relation('resource_id', '目标资源', 'planning_resource'), relation('operation_id', '目标工序', 'planning_operation'),
      text('status', '状态', { required: true, default: 'active', options: choices('active', 'inactive') }),
      json('metadata', '扩展信息', { default: {} }), datetime('last_synced_at', '最后同步', { readOnly: true }), ...auditFields
    ]
  },
  {
    key: 'planning_plan_version', sourceTable: 'plan_version', title: '计划版本', group: '计划结果',
    icon: 'ri-git-commit-line', businessKey: 'code', description: '一次排产运行的可追溯结果版本，承载场景、输入快照、发布状态和结果汇总。',
    fields: [
      text('code', '版本编码', { required: true }), text('name', '版本名称', { required: true }),
      relation('scenario_id', '计划场景', 'planning_scenario', { required: true }), relation('run_id', '运行任务', 'planning_run', { readOnly: true }),
      relation('parent_version_id', '来源版本', 'planning_plan_version'), integer('version_no', '版本序号', { readOnly: true }),
      text('status', '状态', { readOnly: true, default: 'draft', options: choices('draft', 'running', 'completed', 'published', 'superseded', 'failed', 'canceled') }),
      bool('is_current', '当前发布版本', { readOnly: true, default: false }), datetime('input_cutoff', '输入截止时间'),
      datetime('horizon_start', '计划开始'), datetime('horizon_end', '计划结束'), text('solver', '求解器'),
      json('parameters', '参数快照', { default: {} }), json('input_snapshot', '输入快照', { default: {} }),
      json('result_summary', '结果汇总', { readOnly: true, default: {} }), datetime('started_at', '开始时间', { readOnly: true }),
      datetime('completed_at', '完成时间', { readOnly: true }), datetime('published_at', '发布时间', { readOnly: true }),
      uuid('published_by', '发布人', { readOnly: true }), ...auditFields
    ]
  },
  {
    key: 'planning_demand_sync_state', sourceTable: 'demand_sync_state', title: '需求同步状态', group: '集成管理',
    icon: 'ri-refresh-line', access: 'view', description: '销售订单明细到排产需求的幂等同步状态、映射缺口和错误信息。',
    fields: [
      text('source_type', '来源类型', { required: true, default: 'sales_order_line', options: choices('sales_order_line') }),
      text('source_system', '来源系统', { required: true, default: 'enlearn' }), text('source_key', '来源唯一键', { required: true }),
      uuid('source_order_id', '来源订单编号'), uuid('source_line_id', '来源明细编号'), text('source_doc_no', '来源单号'),
      text('source_line_no', '来源行号'), relation('demand_id', '排产需求', 'planning_demand'),
      text('status', '同步状态', { required: true, default: 'pending', options: choices('pending', 'synced', 'ignored', 'error') }),
      text('message', '同步消息'), datetime('source_updated_at', '来源更新时间'), datetime('attempted_at', '尝试时间', { readOnly: true }),
      json('payload', '同步快照', { readOnly: true, default: {} })
    ]
  }
];

export const PLANNING_MODEL_BY_KEY = new Map(
  PLANNING_MODEL_DEFINITIONS.map((model) => [model.key, model])
);

export const PLANNING_MODEL_KEYS = PLANNING_MODEL_DEFINITIONS.map((model) => model.key);

export function planningWritableFields(model: PlanningModelDefinition) {
  return model.fields.filter((field) => !field.readOnly).map((field) => field.name);
}

export function planningRequiredFields(model: PlanningModelDefinition) {
  return model.fields.filter((field) => field.required).map((field) => field.name);
}

export function planningDefaults(model: PlanningModelDefinition) {
  return Object.fromEntries(
    model.fields
      .filter((field) => Object.prototype.hasOwnProperty.call(field, 'default'))
      .map((field) => [field.name, field.default])
  );
}
