import type { LowCodePageBlock } from '../types/lowcode';
import {
  buttonGroupNodeActionDefinition,
  formNodeActionDefinition,
  gridNodeActionDefinition,
  searchFormNodeActionDefinition,
  type LowCodeNodeKind,
  type LowCodeNodeTypeDefinition,
} from './node-action';

export type {
  LowCodeNodeActionExecutor,
  LowCodeNodeActionMethodDefinition,
  LowCodeNodeActionParameter,
  LowCodeNodeKind,
  LowCodeNodeTypeDefinition,
} from './node-action';

function nodeType(
  kind: LowCodeNodeKind,
  label: string,
  icon: string,
): LowCodeNodeTypeDefinition {
  return {
    kind,
    label,
    icon,
    methods: {},
  };
}

function createOpenInsertText(nodeId: string) {
  return `const result = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "open",\n  data: {},\n});`;
}

// Modal and drawer actions remain here until those node modules are migrated.
const overlayOpenNodeAction = {
  method: 'open',
  label: '打开',
  description: '打开节点，并在确认后返回结果表单数据。',
  executor: 'overlay.open',
  parameters: [
    {
      name: 'data',
      type: 'object',
      description: '传给弹框或抽屉结果表单的初始数据。',
    },
    {
      name: 'resultNode',
      type: 'string',
      description: '可选的结果表单节点 ID，默认使用节点配置。',
    },
  ],
  returns: '确认时返回表单对象，取消时返回 null。',
  createInsertText: createOpenInsertText,
} satisfies import('./node-action').LowCodeNodeActionMethodDefinition;

function overlayNodeType(
  kind: Extract<LowCodeNodeKind, 'modal' | 'drawer'>,
  label: string,
  icon: string,
): LowCodeNodeTypeDefinition {
  return {
    kind,
    label,
    icon,
    methods: { open: overlayOpenNodeAction },
  };
}

/**
 * Aggregate node metadata here. Callable methods live with their node type in
 * runtime/node-action so each node owns its definitions and executors.
 */
export const lowCodeNodeActionRegistry: Record<
  LowCodeNodeKind,
  LowCodeNodeTypeDefinition
> = {
  text: nodeType('text', '文本', 'ri-text'),
  container: nodeType('container', '容器', 'ri-layout-line'),
  section: nodeType('section', '分区', 'ri-layout-row-line'),
  tabs: nodeType('tabs', '标签页', 'ri-folder-2-line'),
  toolbar: nodeType('toolbar', '工具栏', 'ri-tools-line'),
  buttonGroup: buttonGroupNodeActionDefinition,
  form: formNodeActionDefinition,
  searchForm: searchFormNodeActionDefinition,
  grid: gridNodeActionDefinition,
  detail: nodeType('detail', '详情', 'ri-file-list-3-line'),
  modal: overlayNodeType('modal', '弹框', 'ri-window-line'),
  drawer: overlayNodeType('drawer', '抽屉', 'ri-layout-right-line'),
  statCard: nodeType('statCard', '指标卡', 'ri-dashboard-3-line'),
  tree: nodeType('tree', '树', 'ri-node-tree'),
  planningFlow: nodeType('planningFlow', '工艺路线', 'ri-route-line'),
  planningGantt: nodeType('planningGantt', '排产甘特图', 'ri-calendar-schedule-line'),
  planningBom: nodeType('planningBom', '工艺 BOM', 'ri-node-tree'),
};

export function getLowCodeNodeTypeDefinition(kind: string) {
  return lowCodeNodeActionRegistry[kind as LowCodeNodeKind];
}

export function getLowCodeNodeActionMethods(
  kind: string,
  block?: LowCodePageBlock,
) {
  const definition = getLowCodeNodeTypeDefinition(kind);
  const methods = definition ? Object.values(definition.methods) : [];
  return methods.filter((method) => (
    method.executor !== 'form.loadData' ||
    (block?.kind === 'form' && block.formType === 'edit')
  ));
}

export function resolveLowCodeNodeAction(
  kind: string,
  method: string,
  block?: LowCodePageBlock,
) {
  const action = getLowCodeNodeTypeDefinition(kind)?.methods[method];//
  if (!action) return undefined;//
  return action;
}

export function resolveLowCodeDataSourceNodeAction(
  blocks: LowCodePageBlock[],
  sourceKey: string,
) {
  for (const block of blocks) {
    const blockSourceKey = block.kind === 'form'
      ? block.sourceKey ?? block.submitSourceKey
      : 'sourceKey' in block
        ? block.sourceKey
        : undefined;
    if (blockSourceKey !== sourceKey) continue;
    const action = getLowCodeNodeActionMethods(block.kind, block).find(
      (candidate) => candidate.dataSourceLoader,
    );
    if (action) return { block, action };
  }

  return undefined;
}
