import type {
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageSchema,
} from '../types/lowcode';

type LowCodePageDataSourceContainer = Pick<
  LowCodePageSchema,
  'dataSources' | 'blocks' | 'overlays'
>;

function childBlocks(block: LowCodePageBlock): LowCodePageBlock[] {
  const children: LowCodePageBlock[] = [];

  if ('blocks' in block && Array.isArray(block.blocks)) {
    children.push(...block.blocks);
  }
  if (block.kind === 'tabs' && Array.isArray(block.tabs)) {
    children.push(...block.tabs.flatMap((tab) => Array.isArray(tab.blocks) ? tab.blocks : []));
  }
  if (
    (block.kind === 'modal' || block.kind === 'drawer') &&
    Array.isArray(block.overlays)
  ) {
    children.push(...block.overlays);
  }

  return children;
}

export function collectLowCodePageDataSources(
  page: LowCodePageDataSourceContainer,
): Record<string, LowCodePageDataSource> {
  const dataSources = { ...(page.dataSources ?? {}) };

  const visit = (blocks: readonly LowCodePageBlock[]) => {
    blocks.forEach((block) => {
      if (block.kind === 'form' && block.dataSource) {
        dataSources[block.id] = {
          ...block.dataSource,
          key: block.id,
        };
      }
      visit(childBlocks(block));
    });
  };

  visit([...(page.blocks ?? []), ...(page.overlays ?? [])]);
  return dataSources;
}
