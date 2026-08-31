import type {
  LowCodeNodeActionDefinition,
  LowCodePageBlock,
} from '../types/lowcode';

export type {
  LowCodeNodeActionDefinition,
  LowCodeNodeActionParameter,
} from '../types/lowcode';

function readBlockValue(block: LowCodePageBlock, key: string) {
  return (block as unknown as Record<string, unknown>)[key];
}

function matchesApplicability(
  action: LowCodeNodeActionDefinition,
  block?: LowCodePageBlock,
) {
  if (!block) return true;
  return Object.entries(action.applicable_when ?? {}).every(([key, expected]) => {
    const actual = readBlockValue(block, key);
    return Array.isArray(expected) ? expected.includes(actual) : Object.is(expected, actual);
  });
}

function createInsertText(template: string, nodeId: string) {
  return template.replaceAll('{{nodeId}}', JSON.stringify(nodeId));
}

export function getLowCodeNodeTypeDefinition(
  kind: string,
  actions: LowCodeNodeActionDefinition[] = [],
) {
  const action = actions.find((candidate) => candidate.node_type === kind);
  if (!action) return undefined;
  return {
    kind,
    label: action.node_label || kind,
    icon: action.node_icon || 'ri-box-3-line',
  };
}

export function getLowCodeNodeActionMethods(
  kind: string,
  block?: LowCodePageBlock,
  actions: LowCodeNodeActionDefinition[] = [],
) {
  return actions
    .filter((action) => action.enabled && action.node_type === kind)
    .filter((action) => matchesApplicability(action, block))
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((action) => ({
      ...action,
      method: action.action_code,
      dataSourceLoader: action.is_data_source_loader,
      createInsertText: (nodeId: string) =>
        createInsertText(action.insert_text_template, nodeId),
    }));
}

export function resolveLowCodeNodeAction(
  kind: string,
  method: string,
  block: LowCodePageBlock | undefined,
  actions: LowCodeNodeActionDefinition[] = [],
) {
  return getLowCodeNodeActionMethods(kind, block, actions).find(
    (action) => action.action_code === method,
  );
}

export function resolveLowCodeDataSourceNodeAction(
  blocks: LowCodePageBlock[],
  sourceKey: string,
  actions: LowCodeNodeActionDefinition[] = [],
) {
  for (const block of blocks) {
    const blockSourceKey = block.kind === 'form'
      ? block.id
      : 'sourceKey' in block
        ? block.sourceKey
        : undefined;
    if (blockSourceKey !== sourceKey) continue;
    const action = getLowCodeNodeActionMethods(block.kind, block, actions).find(
      (candidate) => candidate.is_data_source_loader,
    );
    if (action) return { block, action };
  }

  return undefined;
}
