import type {
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
  setSource(sourceKey: string, value: unknown): void;
  syncGridStates(): void;
  beginSourceRequest(sourceKey: string): number;
  isCurrentSourceRequest(sourceKey: string, version: number): boolean;
  finishSourceRequest(sourceKey: string, version: number): void;
  setLoadingGrid(blockId: string, loading: boolean): void;
};

export type LowCodeNodeActionRuntimeHandler = (
  context: LowCodeNodeActionRuntimeContext,
) => Promise<unknown> | unknown;
