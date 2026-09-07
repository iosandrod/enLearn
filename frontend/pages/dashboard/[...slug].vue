<template>
  <section class="stack">
    <div v-if="loading" class="content-panel">
      <p class="page-description">Loading page...</p>
    </div>

    <div v-else-if="errorMessage" class="content-panel">
      <h2 class="page-title">Page not available</h2>
      <p class="page-description">{{ errorMessage }}</p>
    </div>

    <LowCodePageRenderer
      v-else-if="page"
      ref="rendererRef"
      :page="page"
      :service-api="serviceApi"
      :router="router"
      :route="pageRoute"
      :on-runtime-event="handleRuntimeEvent"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  getBuiltinLowCodePageByRoute,
  type LowCodeHostRoute,
} from '@enlearn/lowcode-framework/runtime';
import type {
  LowCodePageDataSource,
  LowCodePageRecord,
  LowCodeRuntimeEvent,
} from '@enlearn/lowcode-framework/types/lowcode';
import { getLowCodePage } from '../../utils/lowCodePages';
import { notifySystemSettingsChanged } from '../../composables/useSystemSettings';
import {
  clearAiPageContext,
  setAiPageContext,
} from '../../composables/useAiPageContext';

const props = defineProps<{
  routePath: string;
}>();

const serviceApi = useServiceApi();
const router = useRouter();
const currentRoute = useRoute();
const pageRoute = ref<LowCodeHostRoute>(createPageRoute());
const page = ref<LowCodePageRecord & { resolvedData?: Record<string, unknown> } | null>(
  null
);
const loading = ref(true);
const errorMessage = ref('');
const rendererRef = ref<{ getSnapshot?: () => unknown } | null>(null);
let loadSequence = 0;

function createPageRoute(): LowCodeHostRoute {
  return {
    query: { ...currentRoute.query },
    params: { ...currentRoute.params },
    path: currentRoute.path,
    fullPath: currentRoute.fullPath,
  };
}

function isMissingLowCodePageError(error: unknown) {
  const fetchError = error as {
    status?: number;
    statusCode?: number;
    statusMessage?: string;
    message?: string;
    data?: { message?: string; statusMessage?: string };
  };
  const statusCode = fetchError.statusCode ?? fetchError.status;
  const message = [
    fetchError.statusMessage,
    fetchError.message,
    fetchError.data?.message,
    fetchError.data?.statusMessage,
  ]
    .filter(Boolean)
    .join(' ');

  return statusCode === 404 || message.includes('Low-code page not found');
}

function handleRuntimeEvent(event: LowCodeRuntimeEvent) {
  if (
    event.name === 'form.saved' &&
    page.value &&
    ['system-settings', 'system-settings-edit'].includes(page.value.code)
  ) {
    notifySystemSettingsChanged();
  }
}

const sourceReferenceKeys = new Set([
  'sourceKey',
  'sourceKeys',
  'parentSourceKey',
  'targetSourceKey',
  'targetSourceKeys',
  'submitSourceKey',
  'deleteSourceKey',
  'refreshSourceKeys',
]);
const stringifiedSourceReferenceKeys = new Set([
  'directivesJson',
  'postDataJson',
  'queryJson',
  'requestJson',
  'filtersJson',
]);

type SourceKeyMap = Map<string, string[]>;

function readSourceKey(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function visitBlocks(value: unknown, visitor: (block: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitBlocks(item, visitor));
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value.id === 'string' && typeof value.kind === 'string') {
    visitor(value);
  }

  if (Array.isArray(value.blocks)) visitBlocks(value.blocks, visitor);
  if (Array.isArray(value.tabs)) {
    value.tabs.forEach((tab) => {
      if (isRecord(tab)) visitBlocks(tab.blocks, visitor);
    });
  }
  if (Array.isArray(value.overlays)) visitBlocks(value.overlays, visitor);
}

function rewriteSourceReference(value: unknown, sourceKeyMap: SourceKeyMap) {
  const sourceKey = readSourceKey(value);
  const blockIds = sourceKeyMap.get(sourceKey);
  return blockIds?.[0] ?? value;
}

function rewriteSourceReferences(value: unknown, sourceKeyMap: SourceKeyMap): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteSourceReferences(item, sourceKeyMap));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (stringifiedSourceReferenceKeys.has(key) && typeof item === 'string') {
        try {
          return [key, JSON.stringify(rewriteSourceReferences(JSON.parse(item), sourceKeyMap))];
        } catch {
          return [key, item];
        }
      }
      if (sourceReferenceKeys.has(key) && typeof item === 'string') {
        return [key, rewriteSourceReference(item, sourceKeyMap)];
      }
      if (sourceReferenceKeys.has(key) && Array.isArray(item)) {
        return [
          key,
          item.flatMap((source) => {
            const sourceKey = readSourceKey(source);
            return sourceKeyMap.get(sourceKey) ?? [source];
          }),
        ];
      }
      return [key, rewriteSourceReferences(item, sourceKeyMap)];
    }),
  );
}

function rewriteBlockSourceKeys(value: unknown, sourceKeyMap: SourceKeyMap): unknown {
  const rewritten = rewriteSourceReferences(value, sourceKeyMap);

  const forceBlockIds = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map((item) => forceBlockIds(item));
    if (!isRecord(current)) return current;

    const result = Object.fromEntries(
      Object.entries(current).map(([key, item]) => [key, forceBlockIds(item)]),
    ) as Record<string, unknown>;
    const isBlock = typeof result.id === 'string' && typeof result.kind === 'string';
    if (isBlock && 'sourceKey' in result) result.sourceKey = result.id;
    if (isBlock && isRecord(result.dataSource)) {
      result.dataSource = { ...result.dataSource, key: result.id };
    }
    return result;
  };

  return forceBlockIds(rewritten);
}

function rewritePageSourceKeys(nextPage: LowCodePageRecord) {
  const originalDataSources = isRecord(nextPage.schema.dataSources)
    ? nextPage.schema.dataSources
    : {};
  const sourceKeyMap: SourceKeyMap = new Map();
  const rebuiltDataSources: Record<string, LowCodePageDataSource> = {};

  visitBlocks(
    [nextPage.schema.blocks ?? [], nextPage.schema.overlays ?? []],
    (block) => {
      const blockId = readSourceKey(block.id);
      if (!blockId) return;

      const sourceKey = readSourceKey(block.sourceKey);
      if (sourceKey) {
        sourceKeyMap.set(sourceKey, [...(sourceKeyMap.get(sourceKey) ?? []), blockId]);
      }

      const embeddedSource = isRecord(block.dataSource) ? block.dataSource : undefined;
      const configuredSource = embeddedSource ?? (
        sourceKey && isRecord(originalDataSources[sourceKey])
          ? originalDataSources[sourceKey]
          : isRecord(originalDataSources[blockId])
            ? originalDataSources[blockId]
            : undefined
      );
      if (configuredSource) {
        rebuiltDataSources[blockId] = {
          ...configuredSource,
          key: blockId,
        } as LowCodePageDataSource;
      }
    },
  );

  const rewrittenSchema = rewriteBlockSourceKeys(nextPage.schema, sourceKeyMap) as LowCodePageRecord['schema'];
  rewrittenSchema.dataSources = rebuiltDataSources;

  const originalResolvedData = (nextPage as LowCodePageRecord & {
    resolvedData?: Record<string, unknown>;
  }).resolvedData;
  const resolvedData = isRecord(originalResolvedData)
    ? Object.fromEntries(
        Object.entries(originalResolvedData).flatMap(([sourceKey, data]) => {
          const blockIds = sourceKeyMap.get(sourceKey) ?? (
            rebuiltDataSources[sourceKey] ? [sourceKey] : []
          );
          return blockIds.map((blockId) => [blockId, data]);
        }),
      )
    : originalResolvedData;

  return {
    ...nextPage,
    schema: rewrittenSchema,
    ...(resolvedData ? { resolvedData } : {}),
  };
}

async function loadPage() {
  const currentLoad = ++loadSequence;
  loading.value = true;
  errorMessage.value = '';

  try {
    const nextPage = await getLowCodePage(serviceApi, {
      route: props.routePath,
      includeData: true
    });
    if (currentLoad !== loadSequence) return;
    page.value = rewritePageSourceKeys(nextPage);
    await nextTick();
    if (page.value) {
      setAiPageContext(page.value, () => rendererRef.value?.getSnapshot?.());
    }
  } catch (error) {
    if (currentLoad !== loadSequence) return;
    const builtinPage = getBuiltinLowCodePageByRoute(props.routePath);
    if (builtinPage && isMissingLowCodePageError(error)) {
      page.value = rewritePageSourceKeys(builtinPage);
      await nextTick();
      setAiPageContext(page.value, () => rendererRef.value?.getSnapshot?.());
      loading.value = false;
      return;
    }

    page.value = null;
    clearAiPageContext();
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load the page.';
  } finally {
    if (currentLoad === loadSequence) {
      loading.value = false;
    }
  }
}

watch(() => props.routePath, () => {
  pageRoute.value = createPageRoute();
  loadPage();
});

watch(() => currentRoute.fullPath, () => {
  if (currentRoute.path === props.routePath) {
    pageRoute.value = createPageRoute();
  }
});

onMounted(async () => {
  await loadPage();
});

function handleAiPageApplied(event: Event) {
  const detail = (event as CustomEvent<Record<string, unknown> | undefined>).detail;
  const appliedId = typeof detail?.id === 'string' ? detail.id : '';
  const appliedRoute = typeof detail?.route === 'string' ? detail.route : '';
  if (
    (appliedId && appliedId === page.value?.id) ||
    (appliedRoute && appliedRoute === props.routePath)
  ) {
    void loadPage();
  }
}

onMounted(() => window.addEventListener('enlearn:ai-page-applied', handleAiPageApplied));

onBeforeUnmount(() => {
  window.removeEventListener('enlearn:ai-page-applied', handleAiPageApplied);
  clearAiPageContext(page.value?.id);
});
</script>
