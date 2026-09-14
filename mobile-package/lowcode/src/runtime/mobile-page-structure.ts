import type { MobilePageRecord, MobileRuntimeBlock } from './types';

export function isMobileOverlayBlock(block: MobileRuntimeBlock) {
  return block.kind === 'modal' || block.kind === 'drawer';
}

function uniqueBlocks(blocks: MobileRuntimeBlock[]) {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (!block.id || seen.has(block.id)) return false;
    seen.add(block.id);
    return true;
  });
}

export function mobileLayoutBlocks(page: MobilePageRecord) {
  return page.schema.blocks.filter((block) => !isMobileOverlayBlock(block));
}

export function mobileOverlayBlocks(page: MobilePageRecord) {
  return uniqueBlocks([
    ...page.schema.blocks.filter(isMobileOverlayBlock),
    ...(page.schema.overlays ?? []),
    ...(page.overlays ?? []),
  ]);
}

export function collectMobileBlocks(blocks: MobileRuntimeBlock[]): MobileRuntimeBlock[] {
  return blocks.flatMap((block) => {
    const nested = Array.isArray(block.blocks) ? collectMobileBlocks(block.blocks) : [];
    const tabBlocks = Array.isArray(block.tabs)
      ? block.tabs.flatMap((tab) => collectMobileBlocks(tab.blocks ?? []))
      : [];
    const overlays = Array.isArray(block.overlays)
      ? collectMobileBlocks(block.overlays)
      : [];
    return [block, ...nested, ...tabBlocks, ...overlays];
  });
}

export function allMobilePageBlocks(page: MobilePageRecord) {
  return collectMobileBlocks([
    ...mobileLayoutBlocks(page),
    ...mobileOverlayBlocks(page),
  ]);
}
