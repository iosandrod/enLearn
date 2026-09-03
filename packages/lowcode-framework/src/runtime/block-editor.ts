import type { InjectionKey } from 'vue';
import type {
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageRecord,
  LowCodePageSchema,
} from '../types/lowcode';
import type { LowCodeHostServiceApi } from '../core/host';

export type LowCodeRuntimeBlockUpdate = {
  blockId: string;
  changes: Record<string, unknown>;
  dataSources?: Record<string, LowCodePageDataSource>;
};

export type LowCodeRuntimeBlockEditor = {
  updateBlock(update: LowCodeRuntimeBlockUpdate): Promise<LowCodePageBlock>;
  getDataSource?(sourceKey: string): LowCodePageDataSource | undefined;
  getPageSchema?(): LowCodePageSchema;
  getPageRecord?(): LowCodePageRecord;
  getServiceApi?(): LowCodeHostServiceApi;
  getScriptContextSource?(): import('./lowcode-context').LowCodeContextSource;
  executeFieldScript?(
    script: string,
    event: import('../types/lowcode').LowCodeRuntimeEvent,
  ): Promise<unknown>;
  executeButtonScript?(
    script: string,
    event: import('../types/lowcode').LowCodeRuntimeEvent,
  ): Promise<unknown>;
  reportRuntimeError?(error: unknown): void;
};

export const lowCodeRuntimeBlockEditorKey: InjectionKey<LowCodeRuntimeBlockEditor> =
  Symbol('lowCodeRuntimeBlockEditor');
