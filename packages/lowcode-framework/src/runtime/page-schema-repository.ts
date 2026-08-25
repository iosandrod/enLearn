import type {
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageOverlayBlock,
  LowCodePageRecord,
  LowCodePageSearchFormBlock,
} from '../types/lowcode';
import { isRecord, readString } from './renderer-value-utils';

/** Centralizes schema traversal so every runtime service resolves nodes identically. */
export class PageSchemaRepository {
  constructor(private readonly getPage: () => LowCodePageRecord) {}

  readonly isRuntimeBlock = (value: unknown): value is LowCodePageBlock =>
    isRecord(value) && readString(value.id) !== '' && readString(value.kind) !== '';

  readonly validBlocks = (value: unknown): LowCodePageBlock[] =>
    Array.isArray(value) ? value.filter(this.isRuntimeBlock) : [];

  readonly isOverlayBlock = (
    block: LowCodePageBlock,
  ): block is LowCodePageOverlayBlock => block.kind === 'modal' || block.kind === 'drawer';

  readonly markLastBlockFill = <T extends LowCodePageBlock>(blocks: T[]) => {
    const lastIndex = blocks.length - 1;
    return blocks.map((block, index) => index === lastIndex
      ? {
          ...block,
          layout: { ...(block.layout ?? {}), fillRemaining: true },
        }
      : block);
  };

  readonly getChildBlocks = (block: LowCodePageBlock): LowCodePageBlock[] => {
    const children: LowCodePageBlock[] = [];
    if ('blocks' in block && Array.isArray(block.blocks)) {
      children.push(...this.validBlocks(block.blocks));
    }
    if (block.kind === 'tabs' && Array.isArray(block.tabs)) {
      children.push(...block.tabs.flatMap((tab) => this.validBlocks(tab?.blocks)));
    }
    if (this.isOverlayBlock(block) && Array.isArray(block.overlays)) {
      children.push(...this.validBlocks(block.overlays));
    }
    return children;
  };

  readonly flattenBlocks = (blocks: LowCodePageBlock[]): LowCodePageBlock[] =>
    this.validBlocks(blocks).flatMap((block) => [
      block,
      ...this.flattenBlocks(this.getChildBlocks(block)),
    ]);

  readonly flattenPageBlocks = (
    schema: LowCodePageRecord['schema'] = this.getPage().schema,
  ) => this.flattenBlocks([
    ...this.validBlocks(schema.blocks),
    ...this.validBlocks(schema.overlays),
  ]);

  readonly findBlock = (blockId: string) =>
    this.flattenPageBlocks().find((block) => block.id === blockId);

  readonly getFormTarget = (block: LowCodePageGridBlock) => {
    const blocks = this.flattenPageBlocks();
    const configured = block.editorBlockId
      ? blocks.find((candidate) => candidate.kind === 'form' && candidate.id === block.editorBlockId)
      : undefined;
    if (configured?.kind === 'form') return configured;
    return blocks.find(
      (candidate): candidate is LowCodePageFormBlock => candidate.kind === 'form',
    );
  };

  readonly searchTargetSourceKeys = (block: LowCodePageSearchFormBlock) => [
    ...new Set([
      block.targetSourceKey,
      ...(Array.isArray(block.targetSourceKeys) ? block.targetSourceKeys : []),
    ].map((key) => readString(key)).filter(Boolean)),
  ];

  readonly getDataSource = (key?: string): LowCodePageDataSource | undefined =>
    key ? this.getPage().schema.dataSources?.[key] : undefined;

  readonly getGridRowKey = (block: LowCodePageGridBlock) => {
    const rowConfig = block.schema.grid.rowConfig;
    return isRecord(rowConfig) ? readString(rowConfig.keyField, 'id') : 'id';
  };
}
