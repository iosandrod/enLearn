import type {
  LowCodeEditPageMode,
  LowCodePageBlock,
  LowCodePageDataSource,
} from '../types/lowcode';
import type { LowCodePageRuntimeGridState } from './page-runtime';

export type LowCodeNodeActionDataSourceRequest = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
};

export type LowCodeNodeActionRuntimeContext = {
  block: LowCodePageBlock;
  options: Record<string, unknown>;
  blocks: LowCodePageBlock[];
  searchFilters: Record<string, Record<string, unknown>>;
  grids: Record<string, LowCodePageRuntimeGridState>;
  editPageMode?: LowCodeEditPageMode;
  getDataSource(sourceKey?: string): LowCodePageDataSource | undefined;
  resolveDataSourceRequest(
    sourceKey: string,
    source: LowCodePageDataSource,
    postData: Record<string, unknown>,
  ): LowCodeNodeActionDataSourceRequest;
  resolveRuntimePostData(postData: Record<string, unknown>): Record<string, unknown>;
  invokeDataSourceRequest(
    request: LowCodeNodeActionDataSourceRequest,
    source: LowCodePageDataSource,
  ): Promise<unknown>;
  getSourceValue(sourceKey: string): unknown;
  setSource(sourceKey: string, value: unknown): void;
  syncGridStates(): void;
  beginSourceRequest(sourceKey: string): number;
  isCurrentSourceRequest(sourceKey: string, version: number): boolean;
  finishSourceRequest(sourceKey: string, version: number): void;
  setLoadingGrid(blockId: string, loading: boolean): void;
  getFormValues(blockId: string): Record<string, unknown>;
  getFormBaseline(blockId: string): Record<string, unknown>;
  patchFormValues(blockId: string, values: Record<string, unknown>): void;
  replaceFormValues(blockId: string, values: Record<string, unknown>): void;
  validateForm(blockId: string): Promise<boolean>;
  clearFormValidation(blockId: string): Promise<void> | void;
  refreshFormOptions(
    blockId: string,
    options?: { codes?: string[]; sourceKeys?: string[] },
  ): Promise<{ codes: string[]; sourceKeys: string[] }>;
  setGridRows(
    blockId: string,
    rows: Record<string, unknown>[],
    options?: { sourceKey?: string; rowKey?: string },
  ): void;
  setGridCurrentRow(
    blockId: string,
    row: Record<string, unknown> | null,
  ): Promise<void> | void;
  validateGrid(blockId: string): Promise<boolean>;
};

export type LowCodeNodeActionRuntimeHandler = (
  context: LowCodeNodeActionRuntimeContext,
) => Promise<unknown> | unknown;
