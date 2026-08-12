import type { LowCodePageRuntimeContext } from '../page-runtime.ts';

export type LowCodeButtonDisabledAction = {
  code?: string;
  disabled?: unknown;
};

export type LowCodeButtonDisabledFunction = (
  context: LowCodePageRuntimeContext,
) => boolean;

export type LowCodeButtonDisabledOptions = {
  enabled?: boolean;
};
