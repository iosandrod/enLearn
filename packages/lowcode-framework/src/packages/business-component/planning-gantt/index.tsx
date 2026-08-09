import PlanningGantt from '../../../lowcode/block-materials/planning-gantt/index.vue';
import { createEditorInputProp } from '../../../visual-editor/visual-editor.props';
import { createPlanningVisualDesigner } from '../planning-visual-designer';

export default createPlanningVisualDesigner({
  key: 'planning-gantt',
  kind: 'planningGantt',
  label: '排产甘特图',
  description: '按资源查看计划单时间占用、状态与延期',
  icon: 'ri-calendar-schedule-line',
  component: PlanningGantt,
  sourceKey: 'operationPlans',
  dataset: 'operationPlans',
  sampleData: [
    { id: 'op-1', reference: 'MO-1001', resource_name: '切割线', startdate: '2026-08-09T08:00:00Z', enddate: '2026-08-09T11:00:00Z', status: 'approved', quantity: 24 },
    { id: 'op-2', reference: 'MO-1002', resource_name: '装配线', startdate: '2026-08-09T10:00:00Z', enddate: '2026-08-09T16:00:00Z', status: 'confirmed', quantity: 24 },
    { id: 'op-3', reference: 'MO-1003', resource_name: '包装线', startdate: '2026-08-09T15:00:00Z', enddate: '2026-08-09T19:00:00Z', status: 'proposed', delay_hours: 2, quantity: 24 },
  ],
  props: {
    rowLabelField: createEditorInputProp({ label: '资源字段', defaultValue: 'resource_name' }),
    startField: createEditorInputProp({ label: '开始字段', defaultValue: 'startdate' }),
    endField: createEditorInputProp({ label: '结束字段', defaultValue: 'enddate' }),
    labelField: createEditorInputProp({ label: '任务名称字段', defaultValue: 'reference' }),
    statusField: createEditorInputProp({ label: '状态字段', defaultValue: 'status' }),
    colorField: createEditorInputProp({ label: '颜色字段', defaultValue: 'gantt_color' }),
  },
  createRuntimeProps: (props) => ({
    rowLabelField: props.rowLabelField || 'resource_name',
    startField: props.startField || 'startdate',
    endField: props.endField || 'enddate',
    labelField: props.labelField || 'reference',
    statusField: props.statusField || 'status',
    colorField: props.colorField || 'gantt_color',
  }),
});

