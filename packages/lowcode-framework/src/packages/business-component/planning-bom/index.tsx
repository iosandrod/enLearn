import PlanningBom from '../../../lowcode/block-materials/planning-bom/index.vue';
import {
  createEditorInputProp,
  createEditorJsonProp,
} from '../../../visual-editor/visual-editor.props';
import { createPlanningVisualDesigner } from '../planning-visual-designer';

export default createPlanningVisualDesigner({
  key: 'planning-bom',
  kind: 'planningBom',
  label: '工艺 BOM',
  description: '按产成品、工序和组件递归展开物料结构',
  icon: 'ri-node-tree',
  component: PlanningBom,
  sourceKey: 'bom',
  dataset: 'bom',
  sampleData: [{
    id: 'product',
    entityId: 'product',
    title: '智能终端',
    type: 'product',
    children: [{
      id: 'operation',
      entityId: 'operation',
      title: '终检包装',
      type: 'operation',
      children: [
        { id: 'component-1', entityId: 'component-1', title: '装配半成品', type: 'item', quantity: 1, uom: '件' },
        { id: 'component-2', entityId: 'component-2', title: '包装辅料', type: 'item', quantity: 1, uom: '套' },
      ],
    }],
  }],
  props: {
    keyField: createEditorInputProp({ label: '主键字段', defaultValue: 'id' }),
    titleField: createEditorInputProp({ label: '标题字段', defaultValue: 'title' }),
    childrenField: createEditorInputProp({ label: '子节点字段', defaultValue: 'children' }),
    rowsJson: createEditorJsonProp({
      label: '静态节点 JSON',
      defaultValue: '',
      rootType: 'array',
      valueMode: 'string',
    }),
  },
  createRuntimeProps: (props) => ({
    keyField: props.keyField || 'id',
    titleField: props.titleField || 'title',
    childrenField: props.childrenField || 'children',
  }),
});
