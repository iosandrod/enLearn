import PlanningFlow from '../../../lowcode/block-materials/planning-flow/index.vue';
import { createPlanningVisualDesigner } from '../planning-visual-designer';

export default createPlanningVisualDesigner({
  key: 'planning-flow',
  kind: 'planningFlow',
  label: '工艺路线图',
  description: '展示工序顺序、依赖、资源与物料关系',
  icon: 'ri-route-line',
  component: PlanningFlow,
  sourceKey: 'flow',
  dataset: 'flow',
  sampleData: {
    nodes: [
      { id: 'route', label: '成品主路线', type: 'routing', itemName: '成品', position: { x: 16, y: 16 } },
      { id: 'cut', label: '下料切割', type: 'fixed_time', parentOperationPath: '成品主路线', itemName: '切割件', resourceSummary: '切割线', position: { x: 48, y: 72 } },
      { id: 'assembly', label: '组件装配', type: 'fixed_time', parentOperationPath: '成品主路线', itemName: '装配件', resourceSummary: '装配线', position: { x: 408, y: 72 } },
      { id: 'pack', label: '终检包装', type: 'fixed_time', parentOperationPath: '成品主路线', itemName: '产成品', resourceSummary: '包装线', position: { x: 768, y: 72 } },
    ],
    containers: [
      { id: 'container:route', operationId: 'route', type: 'routing', label: '成品主路线', itemName: '成品', x: 20, y: 28, width: 1028, height: 196, nodeIds: ['cut', 'assembly', 'pack'] },
    ],
    edges: [
      { id: 'cut-assembly', source: 'cut', target: 'assembly', relation: 'dependency', label: '前置约束' },
      { id: 'assembly-pack', source: 'assembly', target: 'pack', relation: 'dependency', label: '前置约束' },
    ],
  },
  createRuntimeProps: (props) => ({ fitViewOnInit: props.fitViewOnInit !== false }),
});
