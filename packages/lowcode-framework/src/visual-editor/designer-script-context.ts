import type {
  LowCodePageDataSource,
  LowCodePageRecord,
} from '../types/lowcode';
import type { LowCodeContextSource } from '../runtime/lowcode-context';
import type {
  VisualEditorModelValue,
  VisualEditorPage,
} from './visual-editor.utils';

export type CreateDesignerScriptContextOptions = {
  pageRecord?: LowCodePageRecord | null;
  model: VisualEditorModelValue;
  currentPage: VisualEditorPage;
  converted: {
    dataSources: Record<string, LowCodePageDataSource>;
    blocks: LowCodePageRecord['schema']['blocks'];
    overlays: NonNullable<LowCodePageRecord['schema']['overlays']>;
  };
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (item): item is string => typeof item === 'string' && Boolean(item.trim()),
  ).map((item) => item.trim()))];
}

export function createDesignerScriptContextSource({
  pageRecord,
  model,
  currentPage,
  converted,
}: CreateDesignerScriptContextOptions): LowCodeContextSource {
  const pageSchema = pageRecord?.schema;
  const code = readString(pageRecord?.code, readString(pageSchema?.code, currentPage.path));
  const route = readString(pageRecord?.route, readString(pageSchema?.route, currentPage.path));
  const title = readString(pageRecord?.title, readString(pageSchema?.title, currentPage.title));
  const dataSources = {
    ...(pageSchema?.dataSources ?? {}),
    ...converted.dataSources,
  };

  return {
    page: {
      id: pageRecord?.id ?? '',
      code,
      route,
      title,
      schema: {
        ...(pageSchema ?? {}),
        code,
        route,
        title,
        keepAlive: currentPage.config.keepAlive,
        config: currentPage.config,
        visualEditor: cloneJson(model),
        dataSources,
        blocks: converted.blocks,
        overlays: converted.overlays,
      },
    },
    data: Object.fromEntries(
      Object.keys(dataSources).map((sourceKey) => [sourceKey, null]),
    ),
    apiNames: uniqueStrings(pageSchema?.scriptPolicy?.apiNames),
    capabilities: Array.isArray(pageSchema?.scriptPolicy?.capabilities)
      ? [
          ...new Set([
            ...pageSchema.scriptPolicy.capabilities,
            ...((pageSchema.functions?.length ?? 0) > 0
              ? ['action.execute' as const]
              : []),
            ...(Object.keys(pageSchema.apis ?? {}).length > 0
              ? ['http.execute' as const]
              : []),
            ...((pageSchema.functions?.length ?? 0) > 0
              ? ['pageFunction.execute' as const]
              : []),
          ]),
        ]
      : [
          ...((pageSchema?.functions?.length ?? 0) > 0
            ? ['action.execute' as const]
            : []),
          ...(Object.keys(pageSchema?.apis ?? {}).length > 0
            ? ['http.execute' as const]
            : []),
          ...((pageSchema?.functions?.length ?? 0) > 0
            ? ['pageFunction.execute' as const]
            : []),
        ],
  };
}
