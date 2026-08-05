import type { InjectionKey } from 'vue';
import type { LowCodePageBlock } from '../types/lowcode';

export type LowCodeRuntimeBlockUpdate = {
  blockId: string;
  changes: Record<string, unknown>;
};

export type LowCodeRuntimeBlockEditor = {
  updateBlock(update: LowCodeRuntimeBlockUpdate): Promise<LowCodePageBlock>;
};

export const lowCodeRuntimeBlockEditorKey: InjectionKey<LowCodeRuntimeBlockEditor> =
  Symbol('lowCodeRuntimeBlockEditor');
