<template>
  <div class="platform-demo">
    <div class="platform-demo__tabs" role="tablist" aria-label="产品能力体验">
      <button
        v-for="demo in demos"
        :key="demo.id"
        type="button"
        role="tab"
        :aria-selected="activeDemo === demo.id"
        :aria-controls="`demo-panel-${demo.id}`"
        :class="{ 'is-active': activeDemo === demo.id }"
        @click="activeDemo = demo.id"
      >
        <i :class="demo.icon" aria-hidden="true" />
        <span>{{ demo.label }}</span>
        <small>{{ demo.short }}</small>
      </button>
    </div>

    <div class="platform-demo__stage">
      <header class="demo-toolbar">
        <div class="demo-toolbar__identity">
          <span class="demo-toolbar__status"><i></i> 真实组件</span>
          <strong>{{ currentDemo.title }}</strong>
          <span class="demo-toolbar__note">演示数据 · 仅在当前页面生效</span>
        </div>
        <button class="demo-toolbar__reset" type="button" @click="resetCurrentDemo">
          <i class="ri-refresh-line" aria-hidden="true" />
          重置演示
        </button>
      </header>

      <div class="demo-viewport">
        <section
          v-if="activeDemo === 'schedule'"
          id="demo-panel-schedule"
          class="real-demo real-demo--gantt"
          role="tabpanel"
        >
          <Willow :key="demoKeys.schedule">
            <div class="gantt-demo-shell">
              <div class="gantt-demo-toolbar">
                <div>
                  <strong>装配中心 · 周排产计划</strong>
                  <span>可拖动任务、调整工期、创建依赖并编辑任务</span>
                </div>
                <span class="gantt-demo-live"><i></i> 实时编辑</span>
              </div>
              <div class="gantt-demo-canvas">
                <Gantt
                  :tasks="scheduleTasks"
                  :links="scheduleLinks"
                  :scales="scheduleScales"
                  :columns="scheduleColumns"
                  :cell-width="76"
                  :cell-height="42"
                  :grid-width="390"
                  :undo="true"
                  :init="handleGanttInit"
                />
              </div>
            </div>
          </Willow>
        </section>

        <section
          v-else-if="activeDemo === 'lowcode'"
          id="demo-panel-lowcode"
          class="real-demo real-demo--lowcode"
          role="tabpanel"
        >
          <LowCodeVisualDesigner
            :key="demoKeys.lowcode"
            embedded
            locale="zh-CN"
            :service-api="demoServiceApi"
            :router="demoRouter"
          />
        </section>

        <section
          v-else-if="activeDemo === 'workflow'"
          id="demo-panel-workflow"
          class="real-demo real-demo--workflow"
          role="tabpanel"
        >
          <ApprovalDesigner
            :key="demoKeys.workflow"
            v-model="workflowModel"
            :show-header="false"
          />
        </section>

        <section
          v-else-if="activeDemo === 'print'"
          id="demo-panel-print"
          class="real-demo real-demo--print"
          role="tabpanel"
        >
          <TldrawVue :key="demoKeys.print" :show-template-controls="false" />
        </section>

        <section
          v-else
          id="demo-panel-routing"
          class="real-demo real-demo--routing"
          role="tabpanel"
        >
          <PlanningBom
            :key="demoKeys.routing"
            :block="routingBlock"
            :resolved-data="routingResolvedData"
            :form-models="{}"
            :search-filters="{}"
            @runtime-event="handleRoutingEvent"
          />
          <div class="routing-event" aria-live="polite">
            <i class="ri-information-line" aria-hidden="true" />
            <span>{{ routingMessage }}</span>
          </div>
        </section>
      </div>

      <footer class="demo-footnote">
        <span><i class="ri-mouse-line" aria-hidden="true" />{{ currentDemo.hint }}</span>
        <span><i class="ri-shield-check-line" aria-hidden="true" />无需登录，只读加载公开配置</span>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Gantt, Willow } from '@svar-ui/vue-gantt';
import { LowCodeVisualDesigner } from '@enlearn/lowcode-framework/designer';
import {
  ApprovalDesigner,
  createOrderApprovalWorkflow,
  type WorkflowModel,
} from '@enlearn/approval-workflow';
import TldrawVue from 'tldraw-vue-phase-one';
import PlanningBom from '../../packages/lowcode-framework/src/lowcode/block-materials/planning-bom/index.vue';
import type {
  LowCodePagePlanningBomBlock,
  LowCodeRuntimeEvent,
} from '../../packages/lowcode-framework/src/types/lowcode';
import '../../packages/gantt-main/vue/src/full-css';

type DemoId = 'schedule' | 'lowcode' | 'workflow' | 'print' | 'routing';

const demos = [
  { id: 'schedule' as const, label: '智能排程', short: '真实甘特图', title: '有限产能排程控制台', icon: 'ri-calendar-schedule-line', hint: '双击任务打开编辑器，拖动任务条可调整计划。' },
  { id: 'lowcode' as const, label: '低代码', short: '真实设计器', title: '低代码页面设计器', icon: 'ri-layout-masonry-line', hint: '从左侧选择物料添加到画布，并配置属性、动画与事件。' },
  { id: 'workflow' as const, label: '流程编排', short: '真实节点画布', title: '审批流程编排器', icon: 'ri-node-tree', hint: '拖入节点、连接分支，并在右侧编辑节点规则。' },
  { id: 'print' as const, label: '打印设计', short: '真实绘图引擎', title: '单据与标签设计器', icon: 'ri-printer-line', hint: '使用底部工具栏添加文本、图形、表格和业务组件。' },
  { id: 'routing' as const, label: '工艺路线', short: '真实业务物料', title: '工艺 BOM 与路线选择器', icon: 'ri-route-line', hint: '选择物料并打开“查看路线”，可体验真实路线事件。' },
];

const activeDemo = ref<DemoId>('schedule');
const currentDemo = computed(() => demos.find((demo) => demo.id === activeDemo.value) ?? demos[0]);
const demoKeys = reactive<Record<DemoId, number>>({ schedule: 0, lowcode: 0, workflow: 0, print: 0, routing: 0 });

const initialScheduleTasks = () => [
  { id: 1, text: 'EC-CTRL-100 智能控制器', type: 'summary', open: true, parent: 0, start: new Date(2026, 8, 17), end: new Date(2026, 8, 24), progress: 38 },
  { id: 2, text: 'SMT 贴片 · SMT-01', type: 'task', parent: 1, start: new Date(2026, 8, 17), end: new Date(2026, 8, 19), progress: 82 },
  { id: 3, text: 'AOI 检测 · AOI-02', type: 'task', parent: 1, start: new Date(2026, 8, 19), end: new Date(2026, 8, 20), progress: 35 },
  { id: 4, text: '程序烧录 · PROG-01', type: 'task', parent: 1, start: new Date(2026, 8, 20), end: new Date(2026, 8, 22), progress: 0 },
  { id: 5, text: '整机装配 · ASSY-01', type: 'task', parent: 1, start: new Date(2026, 8, 22), end: new Date(2026, 8, 24), progress: 0 },
  { id: 6, text: 'GW-200 工业网关', type: 'summary', open: true, parent: 0, start: new Date(2026, 8, 18), end: new Date(2026, 8, 26), progress: 24 },
  { id: 7, text: '机箱加工 · CNC-02', type: 'task', parent: 6, start: new Date(2026, 8, 18), end: new Date(2026, 8, 21), progress: 60 },
  { id: 8, text: '总装测试 · TEST-03', type: 'task', parent: 6, start: new Date(2026, 8, 22), end: new Date(2026, 8, 26), progress: 0 },
];

const scheduleTasks = ref(initialScheduleTasks());
const scheduleLinks = ref([
  { id: 1, source: 2, target: 3, type: 'e2s' },
  { id: 2, source: 3, target: 4, type: 'e2s' },
  { id: 3, source: 4, target: 5, type: 'e2s' },
  { id: 4, source: 7, target: 8, type: 'e2s' },
]);
const scheduleScales = [
  { unit: 'month', step: 1, format: '%F %Y' },
  { unit: 'day', step: 1, format: '%d' },
];
const scheduleColumns = [
  { id: 'text', header: '生产任务', width: 235, flexgrow: 1 },
  { id: 'start', header: '开始日期', width: 96, align: 'center' },
  { id: 'duration', header: '工期', width: 58, align: 'center' },
  { id: 'add-task', header: '', width: 42 },
];
const ganttApi = ref<unknown>(null);

function handleGanttInit(api: unknown) {
  ganttApi.value = api;
}

const workflowModel = ref<WorkflowModel>(createOrderApprovalWorkflow({ code: 'visitor_order_approval', name: '订单审批演示流程' }));

type PublicFormDefinition = Record<string, unknown> & {
  code?: string;
  enabled?: boolean;
};

type PublicLowCodeCatalog = {
  materials: unknown[];
  formDefinitions: PublicFormDefinition[];
};

const publicServiceApi = useServiceApi();
let publicCatalogPromise: Promise<PublicLowCodeCatalog> | undefined;

function loadPublicLowCodeCatalog() {
  publicCatalogPromise ??= publicServiceApi.getPublicLowCodeCatalog<unknown, PublicFormDefinition>();
  return publicCatalogPromise;
}

function matchesPublicFormFilters(
  definition: PublicFormDefinition,
  filters: Record<string, unknown>
) {
  return Object.entries(filters).every(([field, expected]) => {
    const actual = definition[field];
    return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  });
}

const demoServiceApi = {
  async invoke<T = unknown>(serviceName: string, serviceMethod: string, payload?: Record<string, unknown>) {
    if (serviceName === 'lowcode' && serviceMethod === 'saveItem') {
      const data = (payload?.data ?? {}) as Record<string, unknown>;
      return { id: 'visitor-lowcode-page', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...data } as T;
    }
    if (
      serviceName === 'lowcode' &&
      serviceMethod === 'listItems' &&
      payload?.resource === 'lowcode_form_definitions'
    ) {
      const catalog = await loadPublicLowCodeCatalog();
      const filters = payload.filters && typeof payload.filters === 'object'
        ? payload.filters as Record<string, unknown>
        : {};
      const offset = Math.max(0, Number(payload.offset) || 0);
      const requestedLimit = Number(payload.limit);
      const limit = Number.isFinite(requestedLimit) && requestedLimit >= 0
        ? requestedLimit
        : catalog.formDefinitions.length;
      return catalog.formDefinitions
        .filter((definition) => matchesPublicFormFilters(definition, filters))
        .slice(offset, offset + limit) as T;
    }
    if (serviceMethod === 'listItems') return [] as T;
    return null as T;
  },
  async listPublishedLowCodeMaterials<T = unknown>() {
    const catalog = await loadPublicLowCodeCatalog();
    return catalog.materials as T[];
  },
};

const demoRouter = { push: () => Promise.resolve() };

const routingRows = [
  {
    id: 'product-controller', entityId: 'MAT-EC-CTRL-100', title: 'EC-CTRL-100 智能控制器总成', type: 'product', quantity: 1, uom: '套',
    producerRoutes: [
      { id: 'route-standard', code: 'RT-CTRL-A', name: '标准装配路线', type: 'routing', typeLabel: '主路线', statusLabel: '已发布' },
      { id: 'route-urgent', code: 'RT-CTRL-B', name: '加急装配路线', type: 'routing', typeLabel: '替代路线', statusLabel: '试运行' },
    ],
    children: [
      {
        id: 'pcba-main', entityId: 'MAT-PCBA-100', title: 'PCBA 主控板', type: 'item', quantity: 1, uom: 'PCS',
        producerRoutes: [{ id: 'route-smt', code: 'RT-PCBA-01', name: 'SMT 贴装与 AOI 路线', type: 'routing', typeLabel: '电子装联', statusLabel: '已发布' }],
        children: [
          { id: 'mcu', entityId: 'MAT-MCU-32', title: '32 位控制芯片', type: 'item', quantity: 1, uom: 'PCS' },
          { id: 'pcb', entityId: 'MAT-PCB-100', title: '六层控制板', type: 'item', quantity: 1, uom: 'PCS' },
        ],
      },
      {
        id: 'case', entityId: 'MAT-CASE-100', title: '铝合金机箱组件', type: 'item', quantity: 1, uom: 'SET',
        producerRoutes: [{ id: 'route-cnc', code: 'RT-CASE-02', name: 'CNC 加工与表面处理', type: 'routing', typeLabel: '机加工', statusLabel: '已发布' }],
      },
      { id: 'power', entityId: 'MAT-POWER-24', title: '24V 电源模块', type: 'item', quantity: 1, uom: 'PCS' },
      { id: 'harness', entityId: 'MAT-WIRE-100', title: '内部线束', type: 'item', quantity: 2, uom: 'PCS' },
    ],
  },
];

const routingBlock: LowCodePagePlanningBomBlock = {
  id: 'visitor-routing-bom',
  kind: 'planningBom',
  title: '产品 BOM 与可选工艺路线',
  description: '选择物料，查看能够产出该物料的已发布路线',
  sourceKey: 'routing',
  height: 610,
  keyField: 'id',
  titleField: 'title',
  childrenField: 'children',
};
const routingResolvedData = { routing: routingRows };
const routingMessage = ref('请选择一行，或点击“查看路线”体验路线选择事件。');

function handleRoutingEvent(event: LowCodeRuntimeEvent) {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (event.name === 'planningBom.routeSelect') {
    const route = (payload.route ?? {}) as Record<string, unknown>;
    routingMessage.value = `已选择路线：${String(route.name ?? route.code ?? payload.value ?? '')}`;
  } else if (event.name === 'planningBom.createRoute') {
    routingMessage.value = '已触发“新增工艺路线”事件；访客模式不会写入正式环境。';
  } else if (event.name === 'planningBom.nodeSelect') {
    const row = (payload.row ?? {}) as Record<string, unknown>;
    routingMessage.value = `当前物料：${String(row.title ?? row.name ?? payload.value ?? '')}`;
  }
}

function resetCurrentDemo() {
  if (activeDemo.value === 'schedule') {
    scheduleTasks.value = initialScheduleTasks();
    ganttApi.value = null;
  } else if (activeDemo.value === 'workflow') {
    workflowModel.value = createOrderApprovalWorkflow({ code: 'visitor_order_approval', name: '订单审批演示流程' });
  } else if (activeDemo.value === 'routing') {
    routingMessage.value = '请选择一行，或点击“查看路线”体验路线选择事件。';
  }
  demoKeys[activeDemo.value] += 1;
}
</script>

<style scoped>
.platform-demo { overflow: hidden; border: 1px solid #cbd8d4; border-radius: 7px; background: #fff; box-shadow: 0 28px 70px rgb(5 24 21 / 24%); }
.platform-demo__tabs { display: grid; grid-template-columns: repeat(5, minmax(132px, 1fr)); overflow-x: auto; border-bottom: 1px solid #d7e0de; background: #edf3f1; }
.platform-demo__tabs button { display: grid; min-width: 0; min-height: 76px; grid-template-columns: 28px 1fr; grid-template-rows: auto auto; align-content: center; column-gap: 8px; border: 0; border-right: 1px solid #d7e0de; background: transparent; color: #71817d; cursor: pointer; padding: 12px 15px; text-align: left; }
.platform-demo__tabs button:last-child { border-right: 0; }
.platform-demo__tabs button i { grid-row: 1 / 3; align-self: center; font-size: 21px; }
.platform-demo__tabs button span { color: #2d423d; font-size: 13px; font-weight: 750; }
.platform-demo__tabs button small { margin-top: 3px; font-size: 10px; }
.platform-demo__tabs button:hover { background: #f7faf9; }
.platform-demo__tabs button.is-active { background: #fff; box-shadow: inset 0 3px #397661; color: #397661; }
.platform-demo__stage { background: #fff; }
.demo-toolbar { display: flex; min-height: 52px; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 1px solid #e0e7e5; padding: 8px 14px; }
.demo-toolbar__identity { display: flex; min-width: 0; align-items: center; gap: 12px; }
.demo-toolbar__identity strong { color: #253935; font-size: 12px; white-space: nowrap; }
.demo-toolbar__status { display: inline-flex; flex: none; align-items: center; gap: 6px; border-right: 1px solid #dce4e2; color: #60736e; padding-right: 12px; font-size: 10px; }
.demo-toolbar__status i { width: 6px; height: 6px; border-radius: 50%; background: #58a96b; box-shadow: 0 0 0 4px rgb(88 169 107 / 12%); }
.demo-toolbar__note { overflow: hidden; color: #85938f; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.demo-toolbar__reset { display: inline-flex; min-height: 30px; flex: none; align-items: center; gap: 5px; border: 1px solid #d5dfdc; border-radius: 4px; background: #f7faf9; color: #526660; cursor: pointer; padding: 0 10px; font-size: 10px; }
.demo-toolbar__reset:hover { border-color: #8eb7aa; color: #2e6855; }
.demo-viewport { width: 100%; min-height: 680px; overflow: auto; background: #eef2f2; }
.real-demo { width: 100%; min-width: 980px; height: 680px; background: #fff; }
.real-demo--gantt :deep(.wx-willow) { display: block; width: 100%; height: 100%; }
.gantt-demo-shell { display: flex; width: 100%; height: 100%; flex-direction: column; background: var(--wx-background); }
.gantt-demo-toolbar { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 16px; border-bottom: var(--wx-border); padding: 8px 14px; }
.gantt-demo-toolbar > div:first-child { display: grid; gap: 3px; }
.gantt-demo-toolbar strong { color: var(--wx-color-font); font-size: 13px; }
.gantt-demo-toolbar span { color: #7b8897; font-size: 10px; }
.gantt-demo-live { display: inline-flex; align-items: center; gap: 6px; }
.gantt-demo-live i { width: 6px; height: 6px; border-radius: 50%; background: #42a46d; }
.gantt-demo-canvas { min-height: 0; flex: 1 1 auto; }
.gantt-demo-canvas :deep(.wx-gantt) { height: 100%; }
.real-demo--lowcode :deep(.visual-designer-page), .real-demo--lowcode :deep(.visual-designer-frame), .real-demo--lowcode :deep(.visual-designer-layout), .real-demo--lowcode :deep(.visual-designer-workbench) { width: 100%; height: 100%; min-height: 0; }
.real-demo--lowcode :deep(.visual-designer-page) { padding: 0; }
.real-demo--lowcode :deep(.visual-designer-frame) { margin: 0; }
.real-demo--workflow { overflow: hidden; }
.real-demo--workflow :deep(.approval-designer) { height: 100%; min-height: 0; border: 0; border-radius: 0; }
.real-demo--workflow :deep(.approval-designer__body) { height: 100%; min-height: 0; }
.real-demo--print { position: relative; overflow: hidden; }
.real-demo--print :deep(.tldraw-vue), .real-demo--print :deep(.vue-editor), .real-demo--print :deep(.vue-editor-host) { width: 100%; height: 100%; }
.real-demo--routing { position: relative; padding-bottom: 42px; }
.real-demo--routing :deep(.lc-planning-bom) { height: 638px; border: 0; border-radius: 0; background: #fff; }
.routing-event { position: absolute; right: 0; bottom: 0; left: 0; display: flex; min-height: 42px; align-items: center; gap: 7px; border-top: 1px solid #dbe4e1; background: #f4f8f7; color: #536a64; padding: 0 14px; font-size: 10px; }
.routing-event i { color: #3d7c67; font-size: 15px; }
.demo-footnote { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce5e2; background: #f7faf9; color: #667a74; padding: 8px 14px; font-size: 10px; }
.demo-footnote span { display: inline-flex; align-items: center; gap: 6px; }
.demo-footnote i { color: #3d7965; font-size: 14px; }

@media (max-width: 820px) {
  .platform-demo__tabs { grid-template-columns: repeat(5, minmax(104px, 1fr)); }
  .platform-demo__tabs button { min-height: 66px; grid-template-columns: 22px 1fr; padding: 10px; }
  .platform-demo__tabs button small, .demo-toolbar__note { display: none; }
  .demo-viewport { min-height: 620px; }
  .real-demo { height: 620px; }
  .real-demo--routing :deep(.lc-planning-bom) { height: 578px; }
}

@media (max-width: 560px) {
  .platform-demo { border-right: 0; border-left: 0; border-radius: 0; }
  .platform-demo__tabs button { display: flex; min-width: 104px; align-items: center; gap: 7px; }
  .platform-demo__tabs button i { grid-row: auto; }
  .demo-toolbar__identity strong { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
  .demo-toolbar__reset { width: 30px; justify-content: center; padding: 0; font-size: 0; }
  .demo-toolbar__reset i { font-size: 14px; }
  .demo-footnote { align-items: flex-start; flex-direction: column; gap: 4px; }
}
</style>
