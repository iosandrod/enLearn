import type { LowCodePageBlock, LowCodePageDataSource, LowCodePageSearchFormBlock } from '../types/lowcode';
import { readString } from './renderer-value-utils';

/** Recover legacy targets only when the page has one unambiguous list grid. */
export function resolveSearchSourceKeys(
  block: LowCodePageSearchFormBlock,
  blocks: LowCodePageBlock[],
  dataSources: Record<string, LowCodePageDataSource> = {},
) {
  const targets = [...new Set([
    block.targetSourceKey,
    ...(Array.isArray(block.targetSourceKeys) ? block.targetSourceKeys : []),
  ].map((key) => readString(key)).filter(Boolean))];
  const knownKeys = new Set([
    ...Object.keys(dataSources),
    ...blocks.flatMap((node) => 'sourceKey' in node && node.sourceKey ? [node.sourceKey] : []),
    ...blocks.filter((node) => node.kind === 'form' && node.dataSource).map((node) => node.id),
  ]);
  if (!targets.length || targets.some((key) => knownKeys.has(key))) return targets;
  const listKeys = [...new Set(blocks.flatMap((node) =>
    node.kind === 'grid' && node.tableType !== 'detail' && node.sourceKey ? [node.sourceKey] : [],
  ))];
  return listKeys.length === 1 ? listKeys : targets;
}
