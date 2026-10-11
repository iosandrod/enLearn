import { computed, reactive, watch } from 'vue';
import type { VxePagerDefines } from 'vxe-pc-ui';
import { resolveSystemTableConfig, useSystemSettings } from '../core/system-settings';
import type { LowCodePageBlock, LowCodePageGridBlock, LowCodePageRecord } from '../types/lowcode';
import type { LowCodePageRuntimeContext } from './page-runtime';
import { isRecord } from './renderer-value-utils';

type PaginationDependencies = {
  getPage(): LowCodePageRecord;
  getBlocks(): LowCodePageBlock[];
  runtime: LowCodePageRuntimeContext;
  refreshDataSources(sourceKeys: string[]): Promise<string[]>;
};

function positiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback;
}

/** Shares the list page's main source pagination between requests and the footer. */
export function useLowCodePagePagination(dependencies: PaginationDependencies) {
  const { getPage, getBlocks, runtime, refreshDataSources } = dependencies;
  const systemSettings = useSystemSettings();
  // let p=getPage()
  // //
  // debugger//
  //@ts-ignore
  const isListPage = computed(() => getPage().page_type === 'main'|| getPage().page_type === 'list' || getPage().page_type === 'custom');//
  const pagerSourceKey = computed(() => {
    if (!isListPage.value) return '';
    const grids = getBlocks().filter((block): block is LowCodePageGridBlock =>
      block.kind === 'grid' && block.tableType !== 'detail' &&
      Boolean(block.sourceKey && getPage().schema.dataSources?.[block.sourceKey]),
    );
    return (grids.find((block) => block.tableType === 'main') ?? grids[0])?.sourceKey ?? '';
  });
  const defaultPageSize=5//
  const pageVO = reactive({ currentPage: 1, pageSize: defaultPageSize, total: 0 });//
  const pagerLoading = computed(() => runtime.state.status.dataLoading ||
    runtime.state.status.mesCommandExecuting ||
    runtime.state.status.loadingSourceKeys.includes(pagerSourceKey.value),
  );
  let filterSignature: string | undefined;

  watch(
    () => [getPage().id, pagerSourceKey.value],
    () => {
      //
      const postData = getPage().schema.dataSources?.[pagerSourceKey.value]?.postData;
      const defaultSize = positiveInteger(resolveSystemTableConfig(systemSettings).pageSize, defaultPageSize);
      pageVO.currentPage = positiveInteger(postData?.page, 1);
      pageVO.pageSize = Math.min(1000, positiveInteger(postData?.pageSize ?? postData?.page_size, defaultSize));
      pageVO.total = 0;
      filterSignature = undefined;
    },
    { immediate: true, flush: 'sync' },
  );

  watch(
    () => runtime.state.sources[pagerSourceKey.value],
    (value) => {
      const total = isRecord(value) ? Number(value.total) : NaN;
      pageVO.total = Number.isFinite(total) && total >= 0
        ? Math.floor(total)
        : Array.isArray(value) ? value.length
          : isRecord(value) && Array.isArray(value.rows) ? value.rows.length : 0;
    },
    { immediate: true },
  );

  function applyPagination(key: string, postData: Record<string, unknown>) {
    if (!pagerSourceKey.value || key !== pagerSourceKey.value) return postData;
    const nextSignature = JSON.stringify(postData.filters ?? {});
    if (filterSignature !== undefined && filterSignature !== nextSignature) {
      pageVO.currentPage = 1;
    }
    filterSignature = nextSignature;
    // Explicit offsets take precedence over page in listItems, so replace them too.
    return {
      ...postData,
      responseMode: 'page',
      page: pageVO.currentPage,
      pageSize: pageVO.pageSize,
      offset: (pageVO.currentPage - 1) * pageVO.pageSize,
    };
  }

  async function pageChangeEvent(params: VxePagerDefines.PageChangeParams) {
    const sourceKey = pagerSourceKey.value;
    if (!sourceKey || pagerLoading.value) return;
    pageVO.pageSize = Math.min(1000, positiveInteger(params.pageSize, pageVO.pageSize));
    pageVO.currentPage = params.type === 'size' ? 1 : positiveInteger(params.currentPage, 1);
    const errors = await refreshDataSources([sourceKey]);
    if (errors.length) {
      runtime.state.status.message = errors.join('\n');
      runtime.state.status.messageClass = 'lc-error';
    }
  }

  return { isListPage, pagerSourceKey, pageVO, pagerLoading, applyPagination, pageChangeEvent };
}
