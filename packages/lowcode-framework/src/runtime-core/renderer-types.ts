import type {
  LowCodeMessages,
  LowCodeHostRoute,
  LowCodeHostRouter,
  LowCodeHostServiceApi,
  LowCodeTheme,
} from '../core/host';
import type { LowCodePageRecord, LowCodeRuntimeEvent } from '../types/lowcode';

export type LowCodePageRendererProps = {
  page: LowCodePageRecord & { resolvedData?: Record<string, unknown> };
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  route?: LowCodeHostRoute;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  onRuntimeEvent?: (event: LowCodeRuntimeEvent) => Promise<void> | void;
  showGlobalDialogHost?: boolean;
};
