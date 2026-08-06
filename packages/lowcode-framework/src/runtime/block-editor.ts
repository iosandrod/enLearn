import type { InjectionKey } from 'vue';
import type { LowCodePageBlock, LowCodePageDataSource } from '../types/lowcode';

export type LowCodeRuntimeBlockUpdate = {
  blockId: string;
  changes: Record<string, unknown>;
  dataSources?: Record<string, LowCodePageDataSource>;
};

export type LowCodeRuntimeBlockEditor = {
  updateBlock(update: LowCodeRuntimeBlockUpdate): Promise<LowCodePageBlock>;
  getDataSource?(sourceKey: string): LowCodePageDataSource | undefined;
};

export const lowCodeRuntimeBlockEditorKey: InjectionKey<LowCodeRuntimeBlockEditor> =
  Symbol('lowCodeRuntimeBlockEditor');
