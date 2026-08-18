import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const ELECTRONICS_DEMO_SOURCE = 'electronics-demo';
export const ELECTRONICS_DEMO_ACCOUNT_CODE = '001';
export const ELECTRONICS_DEMO_CURRENT_DATE = '2026-08-10T00:00:00.000Z';
export const ELECTRONICS_DEMO_SCENARIO_NAME = 'EM-DEMO 电子制造基准场景';

const EFFECTIVE_START = '2026-01-01T00:00:00.000Z';
const EFFECTIVE_END = '2030-12-31T00:00:00.000Z';

type Row = Record<string, unknown>;

type NamedId = {
  id: string;
  name: string;
};

export type ElectronicsDemoSeedResult = {
  accountId: string;
  accountCode: string;
  baselineOperationPlanIds: string[];
  counts: Record<string, number>;
  demandIds: string[];
  itemIds: Record<string, string>;
  operationIds: Record<string, string>;
  resourceIds: Record<string, string>;
  salesOrderIds: string[];
  scenarioId: string;
  source: string;
};

type ItemDefinition = {
  category: string;
  code: string;
  cost: number;
  description: string;
  displayName: string;
  type?: 'make to order' | 'make to stock';
  uom: string;
};

type ResourceDefinition = {
  category: string;
  code: string;
  description: string;
  maximum?: number;
  setupMatrix?: string;
  skill: string;
  subcategory: string;
};

type OperationDefinition = {
  category: string;
  code: string;
  description: string;
  duration?: string;
  durationPer?: string;
  item?: string;
  materials?: Array<[string, number, string]>;
  parent?: string;
  priority: number;
  resource?: string;
  setup?: string;
  type: 'fixed_time' | 'routing' | 'time_per';
};

const ROUTE_OUTPUTS: Record<string, { item: string; step: string }> = {
  'RT-PCBA-100': { item: 'SA-PCBA-100', step: 'OP-PCBA-070-FCT' },
  'RT-PWR-100': { item: 'SA-PWR-100', step: 'OP-PWR-020-TEST' },
  'RT-CASE-100': { item: 'SA-CASE-100', step: 'OP-CASE-010-ASSY' },
  'RT-FG-CTRL-100': { item: 'FG-CTRL-100', step: 'OP-FG-040-PACK' }
};

const ITEM_DEFINITIONS: ItemDefinition[] = [
  {
    code: 'FG-CTRL-100',
    displayName: '工业智能控制器 EC100',
    description: '支持以太网、RS485 与数字量 IO 的工业智能控制器成品。',
    category: '成品', cost: 980, uom: '台'
  },
  {
    code: 'SA-PCBA-100',
    displayName: '控制主板 PCBA',
    description: '完成贴片、焊接、烧录与功能测试的控制主板 PCBA。',
    category: '半成品', cost: 420, uom: '块'
  },
  {
    code: 'SA-PWR-100',
    displayName: '24V 工业控制器电源模块',
    description: '24V 工业控制器电源模块。',
    category: '半成品', cost: 120, uom: '件'
  },
  {
    code: 'SA-CASE-100',
    displayName: '控制器机壳组件',
    description: '包含上下壳、散热片和紧固件的机壳组件。',
    category: '半成品', cost: 95, uom: '套'
  },
  {
    code: 'RM-PCB-CTRL-100',
    displayName: '六层控制板裸板',
    description: '六层控制板裸板。',
    category: '电子原料', cost: 48, uom: '块'
  },
  {
    code: 'RM-PCB-PWR-100',
    displayName: '双层电源板裸板',
    description: '双层电源板裸板。',
    category: '电子原料', cost: 18, uom: '块'
  },
  {
    code: 'RM-MCU-STM32',
    displayName: '工业级主控 MCU',
    description: '工业级主控 MCU。',
    category: '半导体', cost: 85, uom: '只'
  },
  {
    code: 'RM-FLASH-16M',
    displayName: '16Mbit SPI Flash',
    description: '16Mbit SPI Flash。',
    category: '半导体', cost: 12, uom: '只'
  },
  {
    code: 'RM-ETH-PHY',
    displayName: '工业以太网 PHY',
    description: '工业以太网 PHY；演示数据故意只保留有限库存且不设置采购源。',
    category: '半导体', cost: 32, uom: '只'
  },
  {
    code: 'RM-PWR-IC',
    displayName: '宽压输入电源管理 IC',
    description: '宽压输入电源管理 IC。',
    category: '半导体', cost: 16, uom: '只'
  },
  {
    code: 'RM-PASSIVE-KIT',
    displayName: '贴片无源器件套料',
    description: '电阻、电容、电感等贴片无源器件套料。',
    category: '电子原料', cost: 28, uom: '套'
  },
  {
    code: 'RM-CONNECTOR-KIT',
    displayName: '通信接口连接器套料',
    description: '端子、排针和通信接口连接器套料。',
    category: '电子原料', cost: 38, uom: '套'
  },
  {
    code: 'RM-TRANSFORMER-24V',
    displayName: '24V 隔离变压器',
    description: '24V 隔离变压器。',
    category: '电子原料', cost: 42, uom: '只'
  },
  {
    code: 'RM-SOLDER-PASTE',
    displayName: '无铅锡膏',
    description: '无铅锡膏。',
    category: '辅料', cost: 360, uom: 'kg'
  },
  {
    code: 'RM-CASE-TOP',
    displayName: '压铸铝上机壳',
    description: '压铸铝上机壳。',
    category: '结构件', cost: 32, uom: '件'
  },
  {
    code: 'RM-CASE-BOTTOM',
    displayName: '压铸铝下机壳',
    description: '压铸铝下机壳。',
    category: '结构件', cost: 35, uom: '件'
  },
  {
    code: 'RM-HEATSINK',
    displayName: '控制器散热片',
    description: '控制器散热片。',
    category: '结构件', cost: 18, uom: '件'
  },
  {
    code: 'RM-SCREW-M3',
    displayName: 'M3 不锈钢紧固螺钉',
    description: 'M3 不锈钢紧固螺钉。',
    category: '标准件', cost: 0.12, uom: '颗'
  },
  {
    code: 'PK-BOX-100',
    displayName: '控制器运输包装盒',
    description: '控制器运输包装盒。',
    category: '包装材料', cost: 6, uom: '只'
  },
  {
    code: 'PK-MANUAL-100',
    displayName: '安装与安全说明书',
    description: '安装与安全说明书。',
    category: '包装材料', cost: 1.2, uom: '本'
  },
  {
    code: 'PK-LABEL-100',
    displayName: '产品铭牌及合格证标签',
    description: '产品铭牌及合格证标签。',
    category: '包装材料', cost: 0.8, uom: '套'
  }
];

const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  ['RES-PRINT-01', '锡膏印刷机 01', 'SMT设备', 'SMT车间', 'SKILL-SMT', 'SMT-CTRL'],
  ['RES-SMT-HS-01', '高速贴片机 01', 'SMT设备', 'SMT车间', 'SKILL-SMT', 'SMT-CTRL'],
  ['RES-SMT-MF-01', '多功能贴片机 01', 'SMT设备', 'SMT车间', 'SKILL-SMT', 'SMT-CTRL'],
  ['RES-REFLOW-01', '八温区回流焊炉 01', 'SMT设备', 'SMT车间', 'SKILL-SMT', 'SMT-CTRL'],
  ['RES-AOI-01', '在线 AOI 01', '检测设备', 'SMT车间', 'SKILL-QC', 'TEST-CTRL'],
  ['RES-DIP-01', 'DIP 与手工焊工位 01', '人员工位', 'DIP车间', 'SKILL-SOLDER', 'DIP-CTRL'],
  ['RES-PROGRAM-01', '固件烧录工位 01', '测试工位', '测试车间', 'SKILL-TEST', 'TEST-CTRL'],
  ['RES-FCT-01', '功能测试台 01', '测试设备', '测试车间', 'SKILL-TEST', 'TEST-CTRL'],
  ['RES-PWR-ASSY-01', '电源模块装配工位 01', '人员工位', '装配车间', 'SKILL-ASSEMBLY', 'ASSY-CTRL'],
  ['RES-PWR-TEST-01', '电源模块测试台 01', '测试设备', '测试车间', 'SKILL-TEST', 'TEST-CTRL'],
  ['RES-CASE-01', '机壳预装工位 01', '人员工位', '装配车间', 'SKILL-ASSEMBLY', 'ASSY-CTRL'],
  ['RES-FINAL-ASSY-01', '总装工位 01', '人员工位', '总装车间', 'SKILL-ASSEMBLY', 'ASSY-CTRL'],
  ['RES-AGING-01', '老化测试架 01', '测试设备', '老化区', 'SKILL-TEST', 'TEST-CTRL'],
  ['RES-FINAL-QC-01', '终检工位 01', '人员工位', '质量部', 'SKILL-QC', 'TEST-CTRL'],
  ['RES-PACK-01', '包装工位 01', '人员工位', '包装区', 'SKILL-ASSEMBLY', 'PACK-CTRL'],
  ['RES-LOGISTICS-01', '厂内物流班组 01', '人员班组', '物流部', 'SKILL-LOGISTICS', 'LOGISTICS']
].map(([code, description, category, subcategory, skill, setupMatrix]) => ({
  code,
  description,
  category,
  subcategory,
  skill,
  setupMatrix,
  maximum: code === 'RES-LOGISTICS-01' ? 2 : 1
}));

const OPERATION_DEFINITIONS: OperationDefinition[] = [
  {
    code: 'RT-PCBA-100', type: 'routing', item: 'SA-PCBA-100', priority: 10,
    category: 'PCBA路线', description: '控制主板 PCBA 完整制造路线。'
  },
  {
    code: 'OP-PCBA-010-PRINT', type: 'time_per', parent: 'RT-PCBA-100', priority: 10,
    resource: 'RES-PRINT-01', setup: 'CTRL-100', duration: '10 minutes', durationPer: '12 seconds',
    category: 'PCBA工序', description: '锡膏印刷与首件确认。',
    materials: [['RM-PCB-CTRL-100', -1, '控制板裸板投入'], ['RM-SOLDER-PASTE', -0.025, '锡膏投入']]
  },
  {
    code: 'OP-PCBA-020-MOUNT', type: 'time_per', parent: 'RT-PCBA-100', priority: 20,
    resource: 'RES-SMT-HS-01', setup: 'CTRL-100', duration: '15 minutes', durationPer: '75 seconds',
    category: 'PCBA工序', description: '高速与多功能贴片。',
    materials: [
      ['RM-MCU-STM32', -1, 'MCU 投入'], ['RM-FLASH-16M', -1, 'Flash 投入'],
      ['RM-ETH-PHY', -1, '以太网 PHY 投入'], ['RM-PWR-IC', -2, '电源 IC 投入'],
      ['RM-PASSIVE-KIT', -1, '无源器件套料投入']
    ]
  },
  {
    code: 'OP-PCBA-030-REFLOW', type: 'fixed_time', parent: 'RT-PCBA-100', priority: 30,
    resource: 'RES-REFLOW-01', setup: 'CTRL-100', duration: '45 minutes',
    category: 'PCBA工序', description: '回流焊接。'
  },
  {
    code: 'OP-PCBA-040-AOI', type: 'time_per', parent: 'RT-PCBA-100', priority: 40,
    resource: 'RES-AOI-01', setup: 'CTRL-100', duration: '5 minutes', durationPer: '35 seconds',
    category: 'PCBA工序', description: '自动光学检测和缺陷复判。'
  },
  {
    code: 'OP-PCBA-050-DIP', type: 'time_per', parent: 'RT-PCBA-100', priority: 50,
    resource: 'RES-DIP-01', setup: 'CTRL-100', duration: '10 minutes', durationPer: '90 seconds',
    category: 'PCBA工序', description: '连接器插件、手工焊和清洗。',
    materials: [['RM-CONNECTOR-KIT', -1, '连接器套料投入']]
  },
  {
    code: 'OP-PCBA-060-PROGRAM', type: 'time_per', parent: 'RT-PCBA-100', priority: 60,
    resource: 'RES-PROGRAM-01', setup: 'CTRL-100', duration: '5 minutes', durationPer: '25 seconds',
    category: 'PCBA工序', description: 'Bootloader 与应用固件烧录。'
  },
  {
    code: 'OP-PCBA-070-FCT', type: 'time_per', parent: 'RT-PCBA-100', priority: 70,
    resource: 'RES-FCT-01', setup: 'CTRL-100', duration: '10 minutes', durationPer: '150 seconds',
    category: 'PCBA工序', description: '通信、IO、电源和边界功能测试。'
  },
  {
    code: 'RT-PWR-100', type: 'routing', item: 'SA-PWR-100', priority: 20,
    category: '电源模块路线', description: '电源模块装配与测试路线。'
  },
  {
    code: 'OP-PWR-010-ASSY', type: 'time_per', parent: 'RT-PWR-100', priority: 10,
    resource: 'RES-PWR-ASSY-01', setup: 'PWR-100', duration: '10 minutes', durationPer: '80 seconds',
    category: '电源模块工序', description: '电源板装配和焊接。',
    materials: [
      ['RM-PCB-PWR-100', -1, '电源裸板投入'], ['RM-TRANSFORMER-24V', -1, '变压器投入'],
      ['RM-PWR-IC', -1, '电源 IC 投入'], ['RM-PASSIVE-KIT', -0.35, '电源无源套料投入']
    ]
  },
  {
    code: 'OP-PWR-020-TEST', type: 'time_per', parent: 'RT-PWR-100', priority: 20,
    resource: 'RES-PWR-TEST-01', setup: 'PWR-100', duration: '5 minutes', durationPer: '75 seconds',
    category: '电源模块工序', description: '耐压、纹波和负载测试。'
  },
  {
    code: 'RT-CASE-100', type: 'routing', item: 'SA-CASE-100', priority: 30,
    category: '结构件路线', description: '机壳组件预装路线。'
  },
  {
    code: 'OP-CASE-010-ASSY', type: 'time_per', parent: 'RT-CASE-100', priority: 10,
    resource: 'RES-CASE-01', setup: 'CASE-100', duration: '5 minutes', durationPer: '55 seconds',
    category: '结构件工序', description: '上下壳、散热片及接地件预装。',
    materials: [
      ['RM-CASE-TOP', -1, '上壳投入'], ['RM-CASE-BOTTOM', -1, '下壳投入'],
      ['RM-HEATSINK', -1, '散热片投入'], ['RM-SCREW-M3', -4, '预装螺钉投入']
    ]
  },
  {
    code: 'RT-FG-CTRL-100', type: 'routing', item: 'FG-CTRL-100', priority: 40,
    category: '成品路线', description: '工业智能控制器总装、老化、终检和包装路线。'
  },
  {
    code: 'OP-FG-010-FINAL-ASSY', type: 'time_per', parent: 'RT-FG-CTRL-100', priority: 10,
    resource: 'RES-FINAL-ASSY-01', setup: 'CTRL-100', duration: '15 minutes', durationPer: '180 seconds',
    category: '成品工序', description: 'PCBA、电源模块与机壳总装。',
    materials: [
      ['SA-PCBA-100', -1, 'PCBA 投入'], ['SA-PWR-100', -1, '电源模块投入'],
      ['SA-CASE-100', -1, '机壳组件投入'], ['RM-SCREW-M3', -4, '总装螺钉投入'],
      ['PK-LABEL-100', -1, '铭牌标签投入']
    ]
  },
  {
    code: 'OP-FG-020-AGING', type: 'fixed_time', parent: 'RT-FG-CTRL-100', priority: 20,
    resource: 'RES-AGING-01', setup: 'CTRL-100', duration: '8 hours',
    category: '成品工序', description: '高低温通电老化测试。'
  },
  {
    code: 'OP-FG-030-FINAL-QC', type: 'time_per', parent: 'RT-FG-CTRL-100', priority: 30,
    resource: 'RES-FINAL-QC-01', setup: 'CTRL-100', duration: '5 minutes', durationPer: '120 seconds',
    category: '成品工序', description: '外观、安规和最终功能检验。'
  },
  {
    code: 'OP-FG-040-PACK', type: 'time_per', parent: 'RT-FG-CTRL-100', priority: 40,
    resource: 'RES-PACK-01', setup: 'CTRL-100', duration: '5 minutes', durationPer: '65 seconds',
    category: '成品工序', description: '装箱、说明书配套和成品入库。',
    materials: [['PK-BOX-100', -1, '包装盒投入'], ['PK-MANUAL-100', -1, '说明书投入']]
  }
];

const RAW_ITEM_CODES = ITEM_DEFINITIONS
  .map((item) => item.code)
  .filter((code) => code.startsWith('RM-') || code.startsWith('PK-'));

const SUPPLIER_BY_ITEM: Record<string, string> = Object.fromEntries(
  RAW_ITEM_CODES
    .filter((code) => code !== 'RM-ETH-PHY')
    .map((code) => [
      code,
      code.startsWith('RM-PCB-') || code === 'RM-SOLDER-PASTE'
        ? 'SUP-PCB-01'
        : code.startsWith('PK-') || code.startsWith('RM-CASE-') ||
            code === 'RM-HEATSINK' || code === 'RM-SCREW-M3'
          ? 'SUP-MECH-01'
          : 'SUP-SEMICON-01'
    ])
);

const INITIAL_ONHAND: Record<string, number> = {
  'RM-PCB-CTRL-100': 45,
  'RM-PCB-PWR-100': 70,
  'RM-MCU-STM32': 35,
  'RM-FLASH-16M': 50,
  'RM-ETH-PHY': 32,
  'RM-PWR-IC': 220,
  'RM-PASSIVE-KIT': 170,
  'RM-CONNECTOR-KIT': 65,
  'RM-TRANSFORMER-24V': 55,
  'RM-SOLDER-PASTE': 8,
  'RM-CASE-TOP': 75,
  'RM-CASE-BOTTOM': 75,
  'RM-HEATSINK': 75,
  'RM-SCREW-M3': 900,
  'PK-BOX-100': 65,
  'PK-MANUAL-100': 90,
  'PK-LABEL-100': 85
};

const SAFETY_STOCK: Record<string, number> = {
  'RM-PCB-CTRL-100': 10,
  'RM-MCU-STM32': 8,
  'RM-ETH-PHY': 5,
  'RM-SOLDER-PASTE': 2,
  'PK-BOX-100': 10,
  'FG-CTRL-100': 5
};

export async function seedElectronicsPlanningDemo(
  pool: Pool,
  accountCode = ELECTRONICS_DEMO_ACCOUNT_CODE
): Promise<ElectronicsDemoSeedResult> {
  return retryTransientSeed(() => seedElectronicsPlanningDemoOnce(pool, accountCode));
}

async function seedElectronicsPlanningDemoOnce(
  pool: Pool,
  accountCode: string
): Promise<ElectronicsDemoSeedResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const account = await client.query<{ id: string; code: string; name: string }>(
      `select id, code, name from basejump.accounts
       where code = $1 and personal_account = false and status = 'active'
       `,
      [accountCode]
    );
    if (account.rows.length !== 1) {
      throw new Error(`Expected exactly one active business account with code ${accountCode}.`);
    }
    const accountId = account.rows[0].id;
    const seedLock = await client.query<{ locked: boolean }>(
      `select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked`,
      [`${accountId}:${ELECTRONICS_DEMO_SOURCE}:seed`]
    );
    if (!seedLock.rows[0]?.locked) {
      throw new Error('Another electronics demo seed is still active for this account.');
    }
    const activeRuns = await client.query<{ count: number }>(
      `select count(*)::int as count from public.planning_run
       where account_id = $1 and status in ('queued', 'running')`,
      [accountId]
    );
    if (activeRuns.rows[0]?.count) {
      throw new Error('Cannot refresh electronics demo master data while a planning run is active.');
    }

    const calendarId = demoId('calendar:workday');
    await upsert(client, 'planning_calendar', {
      id: calendarId,
      account_id: accountId,
      name: 'CAL-EM-WORKDAY 电子制造工作日历',
      description: '周一至周五 08:00-12:00、13:00-17:00；用于电子制造演示资源。',
      category: '生产日历',
      defaultvalue: 0,
      source: ELECTRONICS_DEMO_SOURCE
    });
    await upsert(client, 'planning_calendarbucket', {
      id: demoId('calendarbucket:morning'), account_id: accountId, calendar_id: calendarId,
      startdate: EFFECTIVE_START, enddate: EFFECTIVE_END, value: 1, priority: 10,
      monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
      saturday: false, sunday: false, starttime: '08:00:00', endtime: '11:59:59',
      source: ELECTRONICS_DEMO_SOURCE
    });
    await upsert(client, 'planning_calendarbucket', {
      id: demoId('calendarbucket:afternoon'), account_id: accountId, calendar_id: calendarId,
      startdate: EFFECTIVE_START, enddate: EFFECTIVE_END, value: 1, priority: 20,
      monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
      saturday: false, sunday: false, starttime: '13:00:00', endtime: '16:59:59',
      source: ELECTRONICS_DEMO_SOURCE
    });

    const locations = await seedNamedRows(client, 'planning_location', accountId, [
      ['LOC-EM-FACTORY', '电子制造工厂（计划生产地点）', '工厂'],
      ['LOC-EM-RM-WH', '原材料仓', '仓库'],
      ['LOC-EM-SMT', 'SMT 车间', '车间'],
      ['LOC-EM-ASSY', '总装与测试车间', '车间'],
      ['LOC-EM-FG-WH', '成品仓', '仓库']
    ]);
    const factoryId = locations['LOC-EM-FACTORY'];
    const rawWarehouseId = locations['LOC-EM-RM-WH'];
    const finishedWarehouseId = locations['LOC-EM-FG-WH'];

    const customers = await seedNamedRows(client, 'planning_customer', accountId, [
      ['CUST-EAST-AUTO', '华东自动化设备有限公司', '重点客户'],
      ['CUST-NORTH-EQUIP', '北方智能装备有限公司', '一般客户']
    ]);
    const suppliers = await seedNamedRows(client, 'planning_supplier', accountId, [
      ['SUP-PCB-01', '精工 PCB 科技有限公司', 'PCB与辅料'],
      ['SUP-SEMICON-01', '华芯电子元件有限公司', '半导体与电子料'],
      ['SUP-MECH-01', '联创结构包装有限公司', '结构件与包装']
    ]);

    const itemIds: Record<string, string> = {};
    for (const item of ITEM_DEFINITIONS) {
      const id = demoId(`item:${item.code}`);
      itemIds[item.code] = id;
      await upsert(client, 'planning_item', {
        id, account_id: accountId, name: item.code, display_name: item.displayName,
        description: item.description,
        category: item.category, subcategory: '工业控制器 EC100', cost: item.cost,
        type: item.type ?? 'make to stock', uom: item.uom, source: ELECTRONICS_DEMO_SOURCE
      });
    }

    const setupMatrices: Record<string, string> = {};
    for (const code of ['SMT-CTRL', 'DIP-CTRL', 'TEST-CTRL', 'ASSY-CTRL', 'PACK-CTRL', 'LOGISTICS']) {
      const id = demoId(`setupmatrix:${code}`);
      setupMatrices[code] = id;
      await upsert(client, 'planning_setupmatrix', {
        id, account_id: accountId, name: `SETUP-${code}`,
        source: ELECTRONICS_DEMO_SOURCE
      });
      await upsert(client, 'planning_setuprule', {
        id: demoId(`setuprule:${code}:same`), account_id: accountId,
        setupmatrix_id: id, priority: 10, fromsetup: '.*', tosetup: '.*',
        duration: code === 'LOGISTICS' ? '0 minutes' : '15 minutes', cost: 0,
        source: ELECTRONICS_DEMO_SOURCE
      });
    }

    const skills: Record<string, string> = {};
    for (const [code, label] of [
      ['SKILL-SMT', 'SMT 设备操作'], ['SKILL-SOLDER', 'DIP 与手工焊'],
      ['SKILL-TEST', '烧录与电子测试'], ['SKILL-ASSEMBLY', '结构与总装'],
      ['SKILL-QC', '电子产品质量检验'], ['SKILL-LOGISTICS', '厂内物流']
    ]) {
      const id = demoId(`skill:${code}`);
      skills[code] = id;
      await upsert(client, 'planning_skill', {
        id, account_id: accountId, name: `${code} ${label}`, source: ELECTRONICS_DEMO_SOURCE
      });
    }

    const resourceIds: Record<string, string> = {};
    for (const resource of RESOURCE_DEFINITIONS) {
      const id = demoId(`resource:${resource.code}`);
      resourceIds[resource.code] = id;
      await upsert(client, 'planning_resource', {
        id, account_id: accountId, name: resource.code, description: resource.description,
        category: resource.category, subcategory: resource.subcategory, type: 'default',
        constrained: true, maximum: resource.maximum ?? 1, available_id: calendarId,
        location_id: factoryId, setupmatrix_id: setupMatrices[resource.setupMatrix ?? ''],
        setup: resource.code === 'RES-LOGISTICS-01' ? 'LOGISTICS' : 'CTRL-100',
        efficiency: 100, cost: resource.category.includes('人员') ? 85 : 160,
        source: ELECTRONICS_DEMO_SOURCE
      });
      await upsert(client, 'planning_resourceskill', {
        id: demoId(`resourceskill:${resource.code}:${resource.skill}`), account_id: accountId,
        resource_id: id, skill_id: skills[resource.skill], effective_start: EFFECTIVE_START,
        effective_end: EFFECTIVE_END, priority: 1, source: ELECTRONICS_DEMO_SOURCE
      });
    }

    for (const [itemCode, supplierCode] of Object.entries(SUPPLIER_BY_ITEM)) {
      const leadtime = itemCode.startsWith('RM-PCB-')
        ? '5 days'
        : itemCode.startsWith('RM-MCU') || itemCode.startsWith('RM-FLASH')
          ? '7 days'
          : itemCode.startsWith('PK-')
            ? '2 days'
            : '4 days';
      await upsert(client, 'planning_itemsupplier', {
        id: demoId(`itemsupplier:${itemCode}:${supplierCode}`), account_id: accountId,
        item_id: itemIds[itemCode], location_id: rawWarehouseId,
        supplier_id: suppliers[supplierCode], leadtime, extra_safety_leadtime: '1 day',
        sizeminimum: 1, sizemultiple: itemCode === 'RM-SCREW-M3' ? 100 : 10,
        batchwindow: '1 day', cost: ITEM_DEFINITIONS.find((item) => item.code === itemCode)?.cost,
        priority: 1, effective_start: EFFECTIVE_START, effective_end: EFFECTIVE_END,
        source: ELECTRONICS_DEMO_SOURCE
      });
    }

    for (const itemCode of RAW_ITEM_CODES) {
      await upsert(client, 'planning_itemdistribution', {
        id: demoId(`distribution:${itemCode}:rm-to-factory`), account_id: accountId,
        item_id: itemIds[itemCode], location_id: factoryId, origin_id: rawWarehouseId,
        leadtime: '4 hours', sizeminimum: 1, sizemultiple: 1, batchwindow: '8 hours',
        cost: 0.25, priority: 1, effective_start: EFFECTIVE_START, effective_end: EFFECTIVE_END,
        resource_id: resourceIds['RES-LOGISTICS-01'], resource_qty: 0.05,
        source: ELECTRONICS_DEMO_SOURCE
      });
    }
    for (const itemCode of ['SA-PCBA-100', 'SA-PWR-100', 'SA-CASE-100']) {
      await upsert(client, 'planning_itemdistribution', {
        id: demoId(`distribution:${itemCode}:factory-to-fg`), account_id: accountId,
        item_id: itemIds[itemCode], location_id: finishedWarehouseId, origin_id: factoryId,
        leadtime: '2 hours', sizeminimum: 1, sizemultiple: 1, batchwindow: '4 hours',
        cost: 0.5, priority: 1, effective_start: EFFECTIVE_START, effective_end: EFFECTIVE_END,
        resource_id: resourceIds['RES-LOGISTICS-01'], resource_qty: 0.025,
        source: ELECTRONICS_DEMO_SOURCE
      });
    }
    await upsert(client, 'planning_itemdistribution', {
      id: demoId('distribution:FG-CTRL-100:factory-to-fg'), account_id: accountId,
      item_id: itemIds['FG-CTRL-100'], location_id: finishedWarehouseId, origin_id: factoryId,
      leadtime: '2 hours', sizeminimum: 1, sizemultiple: 1, batchwindow: '4 hours',
      cost: 1, priority: 1, effective_start: EFFECTIVE_START, effective_end: EFFECTIVE_END,
      resource_id: resourceIds['RES-LOGISTICS-01'], resource_qty: 0.05,
      source: ELECTRONICS_DEMO_SOURCE
    });

    for (const itemCode of RAW_ITEM_CODES) {
      await upsert(client, 'planning_buffer', {
        id: demoId(`buffer:${itemCode}:raw`), account_id: accountId,
        description: `${itemCode} 原材料仓库存`, category: '原材料库存', type: 'default',
        location_id: rawWarehouseId, item_id: itemIds[itemCode], batch: '',
        onhand: INITIAL_ONHAND[itemCode] ?? 0, minimum: SAFETY_STOCK[itemCode] ?? 0,
        maximum: 0, source: ELECTRONICS_DEMO_SOURCE
      });
      await upsert(client, 'planning_buffer', {
        id: demoId(`buffer:${itemCode}:factory`), account_id: accountId,
        description: `${itemCode} 工厂线边库存`, category: '线边库存', type: 'default',
        location_id: factoryId, item_id: itemIds[itemCode], batch: '',
        onhand: 0, minimum: 0, maximum: 0, source: ELECTRONICS_DEMO_SOURCE
      });
    }
    for (const itemCode of ['SA-PCBA-100', 'SA-PWR-100', 'SA-CASE-100', 'FG-CTRL-100']) {
      await upsert(client, 'planning_buffer', {
        id: demoId(`buffer:${itemCode}:factory`), account_id: accountId,
        description: `${itemCode} 在制与成品缓冲`, category: '制造库存', type: 'default',
        location_id: factoryId, item_id: itemIds[itemCode], batch: '', onhand: 0,
        minimum: itemCode === 'FG-CTRL-100' ? 5 : 0, maximum: 0,
        source: ELECTRONICS_DEMO_SOURCE
      });
    }
    for (const itemCode of ['SA-PCBA-100', 'SA-PWR-100', 'SA-CASE-100']) {
      await upsert(client, 'planning_buffer', {
        id: demoId(`buffer:${itemCode}:fg`), account_id: accountId,
        description: `${itemCode} 成品仓中间件缓冲`, category: '半成品库存', type: 'default',
        location_id: finishedWarehouseId, item_id: itemIds[itemCode], batch: '', onhand: 0,
        minimum: 0, maximum: 0, source: ELECTRONICS_DEMO_SOURCE
      });
    }
    await upsert(client, 'planning_buffer', {
      id: demoId('buffer:FG-CTRL-100:fg'), account_id: accountId,
      description: 'FG-CTRL-100 成品仓库存与安全库存', category: '成品库存', type: 'default',
      location_id: finishedWarehouseId, item_id: itemIds['FG-CTRL-100'], batch: '',
      onhand: 8, minimum: 5, maximum: 0, source: ELECTRONICS_DEMO_SOURCE
    });

    const operationIds: Record<string, string> = {};
    for (const operation of OPERATION_DEFINITIONS) {
      operationIds[operation.code] = demoId(`operation:${operation.code}`);
    }
    for (const operation of OPERATION_DEFINITIONS) {
      await upsert(client, 'planning_operation', {
        id: operationIds[operation.code], account_id: accountId, name: operation.code,
        type: operation.type, description: operation.description, category: operation.category,
        subcategory: '工业控制器 EC100',
        item_id: operation.item ? itemIds[operation.item] : null,
        location_id: factoryId, owner_id: operation.parent ? operationIds[operation.parent] : null,
        priority: operation.priority, effective_start: EFFECTIVE_START, effective_end: EFFECTIVE_END,
        sizeminimum: 1, sizemultiple: 1, sizemaximum: 200,
        duration: operation.duration ?? null, duration_per: operation.durationPer ?? null,
        available_id: calendarId, batchwindow: '1 day', source: ELECTRONICS_DEMO_SOURCE
      });
    }
    for (const operation of OPERATION_DEFINITIONS) {
      if (operation.parent) {
        await upsert(client, 'planning_suboperation', {
          id: demoId(`suboperation:${operation.parent}:${operation.code}`), account_id: accountId,
          operation_id: operationIds[operation.parent], priority: operation.priority,
          suboperation_id: operationIds[operation.code], effective_start: EFFECTIVE_START,
          effective_end: EFFECTIVE_END, source: ELECTRONICS_DEMO_SOURCE
        });
      }
      for (const [itemCode, quantity, name] of operation.materials ?? []) {
        await upsert(client, 'planning_operationmaterial', {
          id: demoId(`operationmaterial:${operation.code}:${itemCode}`), account_id: accountId,
          operation_id: operationIds[operation.code], item_id: itemIds[itemCode],
          location_id: factoryId, quantity, type: 'start', effective_start: EFFECTIVE_START,
          effective_end: EFFECTIVE_END, name, priority: 1, source: ELECTRONICS_DEMO_SOURCE
        });
      }
      if (operation.resource) {
        await upsert(client, 'planning_operationresource', {
          id: demoId(`operationresource:${operation.code}:${operation.resource}`), account_id: accountId,
          operation_id: operationIds[operation.code], resource_id: resourceIds[operation.resource],
          quantity: 1, effective_start: EFFECTIVE_START, effective_end: EFFECTIVE_END,
          name: `${operation.code} 主资源`, priority: 1, setup: operation.setup ?? null,
          source: ELECTRONICS_DEMO_SOURCE
        });
      }
    }
    for (const [routeCode, output] of Object.entries(ROUTE_OUTPUTS)) {
      await upsert(client, 'planning_operationmaterial', {
        id: demoId(`operationmaterial:${output.step}:${output.item}:output`),
        account_id: accountId,
        operation_id: operationIds[output.step],
        item_id: itemIds[output.item],
        location_id: factoryId,
        quantity: 1,
        type: 'end',
        effective_start: EFFECTIVE_START,
        effective_end: EFFECTIVE_END,
        name: `${routeCode} 完工产出`,
        priority: 1,
        source: ELECTRONICS_DEMO_SOURCE
      });
    }

    const routeChildren = new Map<string, OperationDefinition[]>();
    for (const operation of OPERATION_DEFINITIONS.filter((row) => row.parent)) {
      routeChildren.set(operation.parent!, [
        ...(routeChildren.get(operation.parent!) ?? []),
        operation
      ]);
    }
    for (const children of routeChildren.values()) {
      const ordered = [...children].sort((left, right) => left.priority - right.priority);
      for (let index = 1; index < ordered.length; index += 1) {
        await upsert(client, 'planning_operation_dependency', {
          id: demoId(`dependency:${ordered[index - 1].code}:${ordered[index].code}`),
          account_id: accountId, operation_id: operationIds[ordered[index].code],
          blockedby_id: operationIds[ordered[index - 1].code], quantity: 1,
          safety_leadtime: '0 minutes', hard_safety_leadtime: '0 minutes',
          source: ELECTRONICS_DEMO_SOURCE
        });
      }
    }

    const dayBucketId = demoId('bucket:day');
    await upsert(client, 'planning_bucket', {
      id: dayBucketId, account_id: accountId, name: 'day',
      description: '电子制造演示的日资源负荷时间桶。', level: 1,
      source: ELECTRONICS_DEMO_SOURCE
    });
    for (let day = 0; day < 60; day += 1) {
      const start = new Date(Date.parse('2026-08-09T00:00:00.000Z') + day * 86_400_000);
      const end = new Date(start.getTime() + 86_400_000);
      await upsert(client, 'planning_bucketdetail', {
        id: demoId(`bucketdetail:day:${start.toISOString().slice(0, 10)}`), account_id: accountId,
        bucket_id: dayBucketId, name: start.toISOString().slice(0, 10),
        startdate: start.toISOString(), enddate: end.toISOString(),
        source: ELECTRONICS_DEMO_SOURCE
      });
    }

    const scenarioId = demoId('scenario:electronics');
    await upsert(client, 'planning_scenario', {
      id: scenarioId, account_id: accountId, name: ELECTRONICS_DEMO_SCENARIO_NAME,
      description: '工业智能控制器电子制造案例：真实 frePPLe 求解、计划版本、回写与低代码可视化。',
      status: 'free', info: {
        demo: ELECTRONICS_DEMO_SOURCE,
        product: 'FG-CTRL-100',
        currentDate: ELECTRONICS_DEMO_CURRENT_DATE,
        intendedDiagnostics: ['material shortage', 'late delivery', 'capacity overload']
      },
      source: ELECTRONICS_DEMO_SOURCE
    });

    await seedSourceMappings(client, accountId, {
      customerIds: customers,
      factoryId,
      finishedWarehouseId,
      itemIds,
      operationIds,
      resourceIds
    });

    const salesOrders = [
      {
        code: 'SO-EM-202608-001', customerCode: 'CUST-EAST-AUTO',
        customerName: '华东自动化设备有限公司', quantity: 20,
        due: '2026-08-13', unitPrice: 1680, priority: 1,
        remark: '正常交期订单，用于验证库存、制造和配送协同。'
      },
      {
        code: 'SO-EM-202608-002', customerCode: 'CUST-NORTH-EQUIP',
        customerName: '北方智能装备有限公司', quantity: 30,
        due: '2026-08-18', unitPrice: 1650, priority: 5,
        remark: '常规批量订单，用于形成跨订单资源竞争。'
      },
      {
        code: 'SO-EM-202608-003', customerCode: 'CUST-EAST-AUTO',
        customerName: '华东自动化设备有限公司', quantity: 50,
        due: '2026-08-11', unitPrice: 1700, priority: 10,
        remark: '紧急订单，刻意形成关键芯片短缺和交付延期诊断。'
      }
    ];
    const salesOrderIds: string[] = [];
    for (const order of salesOrders) {
      const orderId = demoId(`sales-order:${order.code}`);
      const lineId = demoId(`sales-order-line:${order.code}:10`);
      salesOrderIds.push(orderId);
      const amount = order.quantity * order.unitPrice;
      await upsert(client, 'sales_orders', {
        id: orderId, account_id: accountId, external_source: ELECTRONICS_DEMO_SOURCE,
        external_id: order.code, external_doc_id: order.code, external_doc_no: order.code,
        doc_no: order.code, doc_type_code: 'STD-SO', doc_type_name: '标准销售订单',
        doc_date: '2026-08-10', business_date: '2026-08-10', status: 'approved',
        org_code: '001', org_name: '默认制造账套', sales_org_code: 'EM-SALES',
        sales_org_name: '电子制造事业部', customer_id: order.customerCode,
        customer_code: order.customerCode, customer_name: order.customerName,
        currency_code: 'CNY', currency_name: '人民币', exchange_rate: 1,
        total_qty: order.quantity, total_amount: amount, tax_exclusive_amount: amount / 1.13,
        tax_amount: amount - amount / 1.13, tax_inclusive_amount: amount,
        local_currency_amount: amount, remark: order.remark,
        metadata: { demo: ELECTRONICS_DEMO_SOURCE, planningCase: 'industrial-controller-EC100' }
      });
      await upsert(client, 'sales_order_lines', {
        id: lineId, account_id: accountId, order_id: orderId,
        external_source: ELECTRONICS_DEMO_SOURCE, external_id: `${order.code}-10`,
        external_line_id: `${order.code}-10`, line_no: 10, row_no: '10', status: 'open',
        item_id: 'FG-CTRL-100', item_code: 'FG-CTRL-100',
        item_name: '工业智能控制器 EC100', item_spec: '24VDC / Ethernet / RS485 / 16DI / 8DO',
        item_model: 'EC100', item_category_code: 'FG-CONTROLLER',
        item_category_name: '工业控制器', uom_code: 'EA', uom_name: '台',
        pricing_uom_code: 'EA', pricing_uom_name: '台', ordered_qty: order.quantity,
        open_qty: order.quantity, delivered_qty: 0, shipped_qty: 0, invoiced_qty: 0,
        returned_qty: 0, unit_price: order.unitPrice,
        tax_inclusive_unit_price: order.unitPrice, discount_rate: 0, discount_amount: 0,
        tax_rate: 13, tax_exclusive_amount: amount / 1.13,
        tax_amount: amount - amount / 1.13, tax_inclusive_amount: amount,
        local_currency_amount: amount, need_date: order.due, promise_date: order.due,
        delivery_date: order.due, warehouse_code: 'FG-WH-EM', warehouse_name: '成品仓',
        project_code: '', project_name: '工业智能控制器演示项目',
        remark: order.remark,
        metadata: { demo: ELECTRONICS_DEMO_SOURCE, priority: order.priority }
      });
    }

    const synchronized = await client.query<{ id: string; source_doc_no: string }>(
      `select id, source_doc_no from public.planning_demand
       where account_id = $1 and source_type = 'sales_order_line'
         and source_doc_no = any($2::text[])
       order by source_doc_no`,
      [accountId, salesOrders.map((order) => order.code)]
    );
    if (synchronized.rows.length !== salesOrders.length) {
      throw new Error(
        `Expected ${salesOrders.length} synchronized demo demands, found ${synchronized.rows.length}.`
      );
    }
    for (const demand of synchronized.rows) {
      const order = salesOrders.find((candidate) => candidate.code === demand.source_doc_no)!;
      await client.query(
        `update public.planning_demand
         set description = $3, priority = $4, maxlateness = interval '30 days',
             category = '电子制造销售订单', subcategory = '工业控制器 EC100',
             updated_at = timezone('utc', now())
         where account_id = $1 and id = $2`,
        [accountId, demand.id, order.remark, order.priority]
      );
    }

    const baselineOperationPlanIds: string[] = [];
    for (const suffix of ['A', 'B']) {
      const planId = demoId(`baseline-capacity-load:${suffix}`);
      baselineOperationPlanIds.push(planId);
      await upsert(client, 'planning_operationplan', {
        id: planId, account_id: accountId, reference: `WO-EM-AOI-CAPACITY-${suffix}`,
        status: 'confirmed', type: 'WO', quantity: 20,
        startdate: '2026-08-10T08:00:00.000Z', enddate: '2026-08-10T12:00:00.000Z',
        remark: '演示用已确认 AOI 占用，用于验证资源超载诊断。',
        operation_id: operationIds['OP-PCBA-040-AOI'], location_id: factoryId,
        name: `AOI 已确认占用 ${suffix}`, plan_version_id: null,
        source: ELECTRONICS_DEMO_SOURCE
      });
      await upsert(client, 'planning_operationplanresource', {
        id: demoId(`baseline-capacity-resource:${suffix}`), account_id: accountId,
        resource_id: resourceIds['RES-AOI-01'], operationplan_id: planId,
        plan_version_id: null, quantity: 1, setup: 'CTRL-100', status: 'confirmed',
        source: ELECTRONICS_DEMO_SOURCE
      });
    }

    const counts = await readSeedCounts(client, accountId);
    await client.query('commit');
    return {
      accountId,
      accountCode,
      baselineOperationPlanIds,
      counts,
      demandIds: synchronized.rows.map((row) => row.id),
      itemIds,
      operationIds,
      resourceIds,
      salesOrderIds,
      scenarioId,
      source: ELECTRONICS_DEMO_SOURCE
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function retryTransientSeed<T>(operation: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }
  throw lastError;
}

function isTransientDatabaseError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const message = error instanceof Error ? error.message : String(error);
  return [
    'ECONNRESET', 'ETIMEDOUT', 'EPIPE', '08000', '08003', '08006',
    '57P01', '57P02', '57P03'
  ].includes(code) || /connection (?:ended|terminated)|read ECONNRESET|socket hang up/i.test(message);
}

async function seedNamedRows(
  client: PoolClient,
  table: 'planning_customer' | 'planning_location' | 'planning_supplier',
  accountId: string,
  rows: Array<[string, string, string]>
) {
  const result: Record<string, string> = {};
  for (const [code, label, category] of rows) {
    const id = demoId(`${table}:${code}`);
    result[code] = id;
    await upsert(client, table, {
      id, account_id: accountId, name: code, description: label, category,
      subcategory: '电子制造演示', source: ELECTRONICS_DEMO_SOURCE
    });
  }
  return result;
}

async function seedSourceMappings(
  client: PoolClient,
  accountId: string,
  values: {
    customerIds: Record<string, string>;
    factoryId: string;
    finishedWarehouseId: string;
    itemIds: Record<string, string>;
    operationIds: Record<string, string>;
    resourceIds: Record<string, string>;
  }
) {
  const mappings: Array<Row> = [
    {
      entity_type: 'item', source_key: 'FG-CTRL-100', source_name: '工业智能控制器 EC100',
      item_id: values.itemIds['FG-CTRL-100']
    },
    {
      entity_type: 'customer', source_key: 'CUST-EAST-AUTO',
      source_name: '华东自动化设备有限公司', customer_id: values.customerIds['CUST-EAST-AUTO']
    },
    {
      entity_type: 'customer', source_key: 'CUST-NORTH-EQUIP',
      source_name: '北方智能装备有限公司', customer_id: values.customerIds['CUST-NORTH-EQUIP']
    },
    {
      entity_type: 'location', source_key: 'FG-WH-EM', source_name: '成品仓',
      location_id: values.finishedWarehouseId
    },
    {
      entity_type: 'location', source_key: 'FACTORY-EM', source_name: '电子制造工厂',
      location_id: values.factoryId
    },
    {
      entity_type: 'resource', source_key: 'SMT-LINE-01', source_name: 'SMT 主线',
      resource_id: values.resourceIds['RES-SMT-HS-01']
    },
    {
      entity_type: 'operation', source_key: 'ROUTE-EC100', source_name: 'EC100 成品工艺路线',
      operation_id: values.operationIds['RT-FG-CTRL-100']
    }
  ];
  for (const mapping of mappings) {
    const key = `${mapping.entity_type}:${mapping.source_key}`;
    await upsert(client, 'planning_source_mapping', {
      id: demoId(`source-mapping:${key}`), account_id: accountId,
      source_system: 'enlearn', ...mapping, status: 'active',
      metadata: { demo: ELECTRONICS_DEMO_SOURCE }, source: ELECTRONICS_DEMO_SOURCE
    });
  }
}

async function readSeedCounts(client: PoolClient, accountId: string) {
  const result = await client.query<Record<string, number>>(
    `select
       (select count(*)::int from public.planning_item where account_id = $1 and source = $2) as items,
       (select count(*)::int from public.planning_location where account_id = $1 and source = $2) as locations,
       (select count(*)::int from public.planning_resource where account_id = $1 and source = $2) as resources,
       (select count(*)::int from public.planning_skill where account_id = $1 and source = $2) as skills,
       (select count(*)::int from public.planning_operation where account_id = $1 and source = $2) as operations,
       (select count(*)::int from public.planning_operationmaterial where account_id = $1 and source = $2) as operation_materials,
       (select count(*)::int from public.planning_operationresource where account_id = $1 and source = $2) as operation_resources,
       (select count(*)::int from public.planning_suboperation where account_id = $1 and source = $2) as route_steps,
       (select count(*)::int from public.planning_buffer where account_id = $1 and source = $2) as buffers,
       (select count(*)::int from public.planning_itemsupplier where account_id = $1 and source = $2) as item_suppliers,
       (select count(*)::int from public.planning_itemdistribution where account_id = $1 and source = $2) as distributions,
       (select count(*)::int from public.sales_orders where account_id = $1 and external_source = $2) as sales_orders,
       (select count(*)::int from public.sales_order_lines where account_id = $1 and external_source = $2) as sales_order_lines,
       (select count(*)::int from public.planning_demand where account_id = $1 and source_doc_no like 'SO-EM-%') as demands`,
    [accountId, ELECTRONICS_DEMO_SOURCE]
  );
  return result.rows[0] ?? {};
}

async function upsert(client: PoolClient, table: string, row: Row) {
  assertIdentifier(table);
  const columns = Object.keys(row);
  for (const column of columns) assertIdentifier(column);
  if (!columns.includes('id') || !columns.includes('account_id')) {
    throw new Error(`Demo upsert for ${table} requires id and account_id.`);
  }
  const values = columns.map((column) => row[column]);
  const updates = columns
    .filter((column) => column !== 'id' && column !== 'account_id')
    .map((column) => `${quote(column)} = excluded.${quote(column)}`);
  await client.query(
    `insert into public.${quote(table)} (${columns.map(quote).join(', ')})
     values (${columns.map((_, index) => `$${index + 1}`).join(', ')})
     on conflict (${quote('id')}) do update set ${updates.join(', ')}`,
    values
  );
}

function demoId(key: string) {
  const bytes = createHash('sha256')
    .update(`enlearn:${ELECTRONICS_DEMO_SOURCE}:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function quote(value: string) {
  assertIdentifier(value);
  return `"${value}"`;
}

function assertIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
}
