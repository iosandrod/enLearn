import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import type {
  LowCodeAction,
  LowCodeButtonGroupAction,
  LowCodePageBlock,
  LowCodePageRecord,
  LowCodePageGridBlock,
  LowCodePageOverlayBlock,
  LowCodePageSearchFormBlock,
  LowCodeRuntimeEvent
} from '../types/lowcode';
import type { LowCodeRuntimeBlock } from '../lowcode/block-materials';
import {
  createLowCodeEventBus,
  normalizeLowCodeDirectives,
  resolveEventDirectives
} from '../lowcode/event-system';
import { useLowCodeHost } from '../core/host';
import { preloadLowCodeScriptRuntime } from './scripts';
import {
  type BuiltinLowCodePageFunctionMode,
} from './page-function';
import {
  lowCodeRuntimeBlockEditorKey,
  type LowCodeRuntimeBlockUpdate,
} from './block-editor';
import {
  createLowCodePageRuntime,
  lowCodeEditPageModeScopeKey,
  lowCodePageRuntimeKey,
} from './page-runtime';
import {
  isLowCodeEditPageReadonly,
  resolveLowCodeEditPageMode,
} from './edit-page-mode';
import {
  isLowCodeEditPageModifyAction,
  isLowCodeEditPageSaveAction,
} from './button-disabled';
import { lowCodeScriptContextProviderKey } from './script-context-provider';
import type { LowCodeContextSource } from './lowcode-context';
import { PageSchemaRepository } from './page-schema-repository';
import { RuntimeBlockMapper } from './runtime-block-mapper';
import type { LowCodePageRendererProps } from './renderer-types';
export type { LowCodePageRendererProps } from './renderer-types';
import {
  RuntimeDirectiveController,
  type RuntimeDirectiveExecutionContext,
} from './runtime-directive-controller';
import { LowCodePageScriptRuntime } from './lowcode-page-script-runtime';
import { PageDataController } from './page-data-controller';
import {
  DataSourceRequestResolver,
} from './data-source-request-resolver';
import {
  cloneRuntimeValue,
  cloneRuntimeValueWithFunctions,
  isRecord,
  readString,
} from './renderer-value-utils';

/** Vue composition root; domain behavior lives in the controller classes below. */
export function useLowCodePageRenderer(props: LowCodePageRendererProps) {
  const schemaRepository = new PageSchemaRepository(() => props.page);
  const runtimeBlockMapper = new RuntimeBlockMapper(() => props.page);
  const updateVisualButtonGroupBlocks = runtimeBlockMapper.updateVisualBlocks;
  const {
    validBlocks,
    isOverlayBlock,
    markLastBlockFill,
    getChildBlocks,
    flattenBlocks,
    flattenPageBlocks,
    findBlock: findRuntimeBlock,
    getFormTarget: getFormBlockTarget,
    searchTargetSourceKeys,
    getDataSource,
    getGridRowKey,
  } = schemaRepository;


  function hasSchemaPageFunctions() {
    return (props.page.schema.functions?.length ?? 0) > 0;
  }

  function hasRuntimePageFunctions() {
    return hasSchemaPageFunctions() ||
      (props.page.runtime_functions?.some((item) =>
        item.function_type === 'page_function' && item.enabled !== false,
      ) ?? false);
  }

  const host = useLowCodeHost(() => ({
    serviceApi: props.serviceApi,
    router: props.router,
    route: props.route,
    locale: props.locale,
    messages: props.messages,
    theme: props.theme,
  }));
  const runtime = createLowCodePageRuntime();
  runtime.pageType = props.page.page_type;
  runtime.runtimeFunctions = props.page.runtime_functions ?? [];
  watch(
    () => props.page.runtime_functions,
    (runtimeFunctions) => {
      runtime.runtimeFunctions = runtimeFunctions ?? [];
    },
    { deep: true },
  );
  watch(
    () => props.page.page_type,
    (pageType) => {
      runtime.pageType = pageType;
    },
  );
  runtime.state.status.formMode =
    props.page.page_type === 'edit'
      ? resolveLowCodeEditPageMode(host.getRoute().query?.id)
      : 'scan';
  provide(lowCodePageRuntimeKey, runtime);
  provide(lowCodeEditPageModeScopeKey, true);

  const resolvedData = computed(() => runtime.state.sources);
  const formModels = computed(() => runtime.state.forms);
  const searchFilters = computed(() => runtime.state.searches);
  const gridStates = computed(() => runtime.state.grids);
  const loadingBlockId = computed({
    get: () => runtime.state.status.loadingBlockId,
    set: (value: string) => {
      runtime.state.status.loadingBlockId = value;
    },
  });
  const loadingGridId = computed({
    get: () => runtime.state.status.loadingGridId,
    set: (value: string) => {
      runtime.state.status.loadingGridId = value;
    },
  });
  const message = computed({
    get: () => runtime.state.status.message,
    set: (value: string) => {
      runtime.state.status.message = value;
    },
  });
  const messageClass = computed({
    get: () => runtime.state.status.messageClass,
    set: (value: string) => {
      runtime.state.status.messageClass = value;
    },
  });
  const dataLoading = computed({
    get: () => runtime.state.status.dataLoading,
    set: (value: boolean) => {
      runtime.state.status.dataLoading = value;
    },
  });
  const runtimeEventBus = createLowCodeEventBus();
  const pendingActionEvents = new WeakMap<object, Promise<void>>();
  const formBaselines: Record<string, Record<string, unknown>> = {};
  const selectedCategoryId = ref('');
  const runtimeBlockRenderRevision = ref(0);
  let runtimeBlockReloadSuppression: {
    pageId: string;
    version: number;
    fullPath: string;
  } | undefined;
  let loadSequence = 0;
  const sourceRequestVersions = new Map<string, number>();
  const builtinPageFunctionMode = computed<BuiltinLowCodePageFunctionMode>({
    get: () => runtime.state.status.formMode,
    set: (mode) => {
      runtime.state.status.formMode = mode;
    },
  });

  const dataSourceRequestResolver = new DataSourceRequestResolver({
    props,
    host,
    runtime,
    resolvedData,
    formModels,
    searchFilters,
    gridStates,
    selectedCategoryId,
    flattenPageBlocks: () => flattenPageBlocks(props.page.schema),
  });
  const {
    resolveRuntimeValue,
    resolveRuntimePostData,
    normalizeLegacyRequest: normalizeLegacyAdminListRequest,
    shouldReturnEmptyForUnavailableList,
    isListItemsRequest,
    resolveRequest: resolveDataSourceRequest,
    resolvePostData: resolveDataSourcePostData,
    resolveRoute: resolveRuntimeRoute,
  } = dataSourceRequestResolver;

  let scriptRuntime!: LowCodePageScriptRuntime;
  const pageDataController = new PageDataController({
    props,
    host,
    runtime,
    resolvedData,
    formModels,
    searchFilters,
    loadingBlockId,
    message,
    messageClass,
    builtinPageFunctionMode,
    formBaselines,
    sourceRequestVersions,
    getDataSource,
    getGridRowKey,
    flattenPageBlocks,
    findRuntimeBlock,
    resolveDataSourceRequest,
    resolveDataSourcePostData,
    resolveRuntimeRoute,
    shouldReturnEmptyForUnavailableList,
    isListItemsRequest,
    executeNodeAction: (options) => scriptRuntime.executeNodeAction(options),
    executeIsolatedScript: (script, event, mode) =>
      scriptRuntime.executeIsolatedScript(script, event, mode),
    reportRuntimeDirectiveError,
    publishRuntimeEvent,
  });
  const {
    findLowCodePage,
    resolveEditPageRoute,
    resolveLinkedEditPageRoute,
    beginSourceRequest,
    isCurrentSourceRequest,
    finishSourceRequest,
    refreshDataSources,
    refreshFormNodeOptions,
    cloneScriptValue,
    syncPageGridStates,
    refreshGridChangeSets,
    deriveFormModel,
    deriveNewFormModel,
    mergeFormModelValues,
    captureFormBaselines,
    collectFormSubmissionGroups,
    saveFormSource,
    readRouteQueryWithoutRecordId,
    readSavedRecordId,
    submitForms,
    commitPendingFormValues,
    loadPageData,
  } = pageDataController;

  scriptRuntime = new LowCodePageScriptRuntime({
    props,
    host,
    runtime,
    resolvedData,
    formModels,
    searchFilters,
    gridStates,
    loadingGridId,
    message,
    messageClass,
    builtinPageFunctionMode,
    formBaselines,
    sourceRequestVersions,
    hasSchemaPageFunctions,
    hasRuntimePageFunctions,
    getChildBlocks,
    flattenBlocks,
    flattenPageBlocks: () => flattenPageBlocks(props.page.schema),
    findRuntimeBlock,
    isOverlayBlock,
    getDataSource,
    getGridRowKey,
    resolveDataSourceRequest,
    resolveRuntimePostData,
    shouldReturnEmptyForUnavailableList,
    syncPageGridStates,
    beginSourceRequest,
    isCurrentSourceRequest,
    finishSourceRequest,
    refreshFormNodeOptions,
    refreshDataSources,
    cloneScriptValue,
    isListItemsRequest,
    mergeFormModelValues,
    refreshGridChangeSets,
    deriveNewFormModel,
    collectFormSubmissionGroups,
    submitForms,
    captureFormBaselines,
    loadPageData,
    resolveEditPageRoute,
    findLowCodePage,
    readRouteQueryWithoutRecordId,
    readSavedRecordId,
    getLastSavedFormRecord: pageDataController.getLastSavedFormRecord,
    publishRuntimeEvent,
  });
  const executeIsolatedScript = scriptRuntime.executeIsolatedScript;
  const executeButtonScript = scriptRuntime.executeButtonScript;
  const executeScriptNodeAction = scriptRuntime.executeNodeAction;
  onMounted(() => {
    void preloadLowCodeScriptRuntime().catch(() => undefined);
  });

  provide(lowCodeRuntimeBlockEditorKey, {
    updateBlock: persistRuntimeBlockUpdate,
    getDataSource,
    getPageSchema: () => props.page.schema,
    getPageRecord: () => props.page,
    getServiceApi: () => host.getServiceApi(),
    getScriptContextSource: createScriptContextSource,
    executeFieldScript: async (script, event) => (
      await executeIsolatedScript(script, event)
    ).value,
  });
  provide(lowCodeScriptContextProviderKey, {
    getSource: createScriptContextSource,
  });

  const exposed = {
    getSnapshot: () => ({
      page: props.page,
      runtime: runtime.snapshot(),
      resolvedData: cloneRuntimeValue(resolvedData.value),
      formModels: cloneRuntimeValue(formModels.value),
      searchFilters: cloneRuntimeValue(searchFilters.value),
      gridStates: cloneRuntimeValue(gridStates.value),
    }),
    submitForms,
  };

  const page = computed(() => props.page);
  const showGlobalDialogHost = computed(() => props.showGlobalDialogHost !== false);


  const themeClass = computed(() => host.getTheme().className);
  const themeStyle = computed(() =>
    Object.fromEntries(
      Object.entries(host.getTheme().variables ?? {}).map(([key, value]) => [key, String(value)])
    )
  );
  const hasCategoryRelation = computed(() => readString(props.page.relate_config?.category) !== '');
  const categoryServiceApi = computed(() => props.serviceApi ?? host.getServiceApi());
  const layoutBlocks = computed(() => {
    runtimeBlockRenderRevision.value;
    return markLastBlockFill(
      validBlocks(props.page.schema.blocks).filter((block) => !isOverlayBlock(block))
    );
  });

  async function handleCategorySelect(node: { id: unknown; label: string }) {
    await publishRuntimeEvent({
      name: 'category.selected',
      blockId: 'page-category-drawer',
      blockKind: 'tree',
      timestamp: Date.now(),
      payload: {
        id: node.id,
        label: node.label,
        category: readString(props.page.relate_config?.category),
      },
    });
  }
  const pageOverlays = computed<LowCodePageOverlayBlock[]>(() => {
    runtimeBlockRenderRevision.value;
    return [
      ...validBlocks(props.page.schema.blocks).filter(isOverlayBlock),
      ...validBlocks(props.page.schema.overlays).filter(isOverlayBlock),
    ];
  });


  function createScriptContextSource(): LowCodeContextSource {
    refreshGridChangeSets();
    return cloneScriptValue({
      page: {
        id: props.page.id,
        code: props.page.code,
        route: props.page.route,
        title: props.page.title,
        page_type: props.page.page_type,
        node_actions: props.page.node_actions,
        runtime_functions: props.page.runtime_functions,
        mode: props.page.page_type === 'edit'
          ? builtinPageFunctionMode.value
          : undefined,
        schema: props.page.schema,
      },
      data: resolvedData.value,
      forms: formModels.value,
      searches: searchFilters.value,
      grids: gridStates.value,
      apiNames: Array.isArray(props.page.schema.scriptPolicy?.apiNames)
        ? props.page.schema.scriptPolicy.apiNames
        : [],
      capabilities: Array.isArray(props.page.schema.scriptPolicy?.capabilities)
        ? [
          ...props.page.schema.scriptPolicy.capabilities,
          ...(hasSchemaPageFunctions()
            ? ['action.execute' as const]
            : []),
          ...(Object.keys(props.page.schema.apis ?? {}).length > 0
            ? ['http.execute' as const]
            : []),
          ...(hasRuntimePageFunctions()
            ? ['pageFunction.execute' as const]
            : []),
        ].filter((capability, index, capabilities) =>
          capabilities.indexOf(capability) === index,
        )
        : [
          ...(hasSchemaPageFunctions()
            ? ['action.execute' as const]
            : []),
          ...(Object.keys(props.page.schema.apis ?? {}).length > 0
            ? ['http.execute' as const]
            : []),
          ...(hasRuntimePageFunctions()
            ? ['pageFunction.execute' as const]
            : []),
        ],
    }, {});
  }

  async function persistRuntimeBlockUpdate(update: LowCodeRuntimeBlockUpdate) {
    const nextSchema = cloneRuntimeValueWithFunctions(props.page.schema);
    if (isRecord(props.page.schema.visualEditor)) {
      nextSchema.visualEditor = cloneRuntimeValueWithFunctions(props.page.schema.visualEditor);
    }
    const targetBlock = flattenPageBlocks(nextSchema).find(
      (block) => block.id === update.blockId
    );

    if (!targetBlock) {
      throw new Error(`未找到页面区块 ${update.blockId}`);
    }

    Object.assign(targetBlock, cloneRuntimeValue(update.changes));

    if (update.dataSources) {
      nextSchema.dataSources = {
        ...(nextSchema.dataSources ?? {}),
        ...cloneRuntimeValue(update.dataSources),
      };
    }

    if (isRecord(nextSchema.visualEditor)) {
      const visualPages = isRecord(nextSchema.visualEditor.pages)
        ? nextSchema.visualEditor.pages
        : {};

      Object.values(visualPages).forEach((visualPage) => {
        if (!isRecord(visualPage)) return;
        updateVisualButtonGroupBlocks(visualPage.blocks, targetBlock, update);
        updateVisualButtonGroupBlocks(visualPage.overlays, targetBlock, update);
      });
    }

    const nextVersion = (props.page.version ?? 0) + 1;
    const publishedAt = (nextSchema.status ?? props.page.status) === 'published'
      ? new Date().toISOString()
      : props.page.published_at;

    try {
      const saved = await host.getServiceApi().invoke<LowCodePageRecord>(
        'lowcode',
        'saveItem',
        {
          resource: 'lowcode_pages',
          id: props.page.id,
          data: {
            schema: nextSchema,
            version: nextVersion,
            published_at: publishedAt,
          },
        }
      );

      const reloadSuppression = {
        pageId: readString(saved.id, props.page.id),
        version: Number(saved.version ?? nextVersion),
        fullPath: readString(props.route?.fullPath ?? host.getRoute().fullPath),
      };
      runtimeBlockReloadSuppression = reloadSuppression;
      Object.assign(props.page, saved);
      Object.assign(props.page.schema, cloneRuntimeValue(update.changes.schema ? nextSchema : saved.schema));
      void nextTick(() => {
        if (runtimeBlockReloadSuppression === reloadSuppression) {
          runtimeBlockReloadSuppression = undefined;
        }
      });
      const renderedBlockId = readString(update.changes.id, update.blockId);
      let renderedBlock = flattenPageBlocks(props.page.schema).find(
        (block) => block.id === renderedBlockId,
      );
      if (renderedBlock) {
        Object.assign(renderedBlock, cloneRuntimeValue(update.changes));
      } else {
        const savedSchema = isRecord(saved.schema) ? saved.schema : nextSchema;
        renderedBlock = flattenPageBlocks(savedSchema).find(
          (block) => block.id === renderedBlockId,
        );
      }
      runtimeBlockRenderRevision.value += 1;
      message.value = targetBlock.kind === 'form' || targetBlock.kind === 'searchForm'
        ? '表单配置已保存。'
        : targetBlock.kind === 'grid'
          ? '表格配置已保存。'
          : '按钮配置已保存。';
      messageClass.value = 'lc-help';

      return renderedBlock ?? targetBlock;
    } catch (error) {
      reportRuntimeError('页面区块配置保存失败', error);
      message.value = error instanceof Error ? error.message : '页面配置保存失败。';
      messageClass.value = 'lc-error';
      throw error;
    }
  }

  const loadingText = computed(() =>
    dataLoading.value ? host.t('runtime.loadingDataSources') : ''
  );

  const directiveController = new RuntimeDirectiveController({
    props,
    host,
    runtime,
    resolvedData,
    message,
    messageClass,
    resolveRuntimeValue,
    getDataSource,
    findRuntimeBlock,
    isOverlayBlock,
    syncPageGridStates,
    refreshDataSources,
    loadPageData,
    resolveDataSourceRequest,
    normalizeLegacyAdminListRequest,
    publishRuntimeEvent,
  });
  const executeRuntimeDirective = directiveController.execute;

  watch(
    [() => props.page.id, () => props.page.version, () => props.route?.fullPath ?? host.getRoute().fullPath],
    async ([nextPage, nextVersion, nextFullPath]) => {
      if (
        runtimeBlockReloadSuppression?.pageId === nextPage &&
        runtimeBlockReloadSuppression.version === nextVersion &&
        runtimeBlockReloadSuppression.fullPath === readString(nextFullPath)
      ) {
        runtimeBlockReloadSuppression = undefined;
        return;
      }

      const currentLoad = ++loadSequence;
      message.value = '';
      dataLoading.value = true;

      try {
        const errors = await loadPageData(props.page);

        if (currentLoad !== loadSequence) {
          return;
        }//
        if (errors?.length) {
          reportRuntimeError('页面数据源加载返回错误', errors);
          message.value = errors[0];
          messageClass.value = 'lc-error';
        }
      } catch (error) {
        if (currentLoad !== loadSequence) {
          return;
        }

        reportRuntimeError('页面数据加载失败', error);
        message.value =
          error instanceof Error ? error.message : host.t('runtime.errors.loadPage');
        messageClass.value = 'lc-error';
      } finally {
        if (currentLoad === loadSequence) {
          dataLoading.value = false;
        }
      }
    },
    { immediate: true }
  );

  watch(
    () => flattenPageBlocks(props.page.schema)
      .filter((block): block is LowCodePageGridBlock => block.kind === 'grid')
      .map((block) => [block.id, block.sourceKey ?? '', getGridRowKey(block)]),
    () => syncPageGridStates(),
    { deep: true },
  );

  const unsubscribeRuntimeEvents = runtimeEventBus.subscribe(handlePublishedRuntimeEvent);
  onBeforeUnmount(unsubscribeRuntimeEvents);

  async function publishRuntimeEvent(event: LowCodeRuntimeEvent) {
    const action = isRecord(event.payload?.action) ? event.payload.action : undefined;
    const actionEvent = Boolean(action || readString(event.payload?.actionCode));
    if (actionEvent && runtime.state.status.mesCommandExecuting) {
      message.value = '当前操作仍在处理中，请稍候。';
      messageClass.value = 'lc-help';
      return;
    }
    const execution = publishRuntimeEventNow(event);
    if (action) pendingActionEvents.set(action, execution);

    try {
      await execution;
    } finally {
      if (action && pendingActionEvents.get(action) === execution) {
        pendingActionEvents.delete(action);
      }
    }
  }

  async function publishRuntimeEventNow(event: LowCodeRuntimeEvent) {
    try {
      await runtimeEventBus.publish(event);
      await props.onRuntimeEvent?.(event);
    } catch (error) {
      reportRuntimeDirectiveError(error);
      throw error;
    }
  }

  async function waitForActionEvent(action?: LowCodeAction | LowCodeButtonGroupAction) {
    if (!action) return;
    await pendingActionEvents.get(action as object);
  }

  async function handlePublishedRuntimeEvent(event: LowCodeRuntimeEvent) {
    if (isRuntimeEditPageModifyEvent(event)) {
      const modeChanged = builtinPageFunctionMode.value !== 'edit';
      builtinPageFunctionMode.value = 'edit';
      if (modeChanged) {
        await publishRuntimeEvent({
          name: 'page.modeChange',
          blockId: event.blockId,
          blockKind: event.blockKind,
          timestamp: Date.now(),
          payload: { mode: 'edit' },
        });
      }
      return;
    }
    const allBlocks = flattenPageBlocks(props.page.schema);
    let targetBlock = allBlocks.find((block) => block.id === event.blockId);
    if (event.name === 'tabs.activeChange' && targetBlock?.kind === 'tabs') {
      const tabKey = readString(event.payload?.tabKey);
      const activeTab = targetBlock.tabs.find((tab) => tab.key === tabKey);
      const detailGrids = activeTab
        ? flattenBlocks(activeTab.blocks).filter(
            (block): block is LowCodePageGridBlock =>
              block.kind === 'grid' && block.tableType === 'detail',
          )
        : [];

      await Promise.all(
        detailGrids.map((grid) => scriptRuntime.executeNodeAction({
          node: grid.id,
          method: 'loadData',
        })),
      );
    }
    if (targetBlock?.kind == 'grid') {//
      if (targetBlock.tableType == 'main') {
        let allDetailBlock = allBlocks.filter((block) => block.kind === 'grid' && block.tableType == 'detail');
        allDetailBlock.forEach((block) => {
          scriptRuntime.executeNodeAction({
            node:block.id,
            method: 'loadData',
          });
        })//
      }
    }
    if (isBlockedEditPageSaveEvent(event)) return;

    let eventSucceeded = true;
    const directives = resolveEventDirectives(event, props.page.schema.eventHandlers);
    const executionContext: RuntimeDirectiveExecutionContext = {
      mesCommandStarted: false,
      mesCommandCompleted: false,
      mesCommandRefreshCompleted: false,
      mesCommandRefreshFailed: false,
    };

    try {
      for (const directive of directives) {
        try {
          await executeRuntimeDirective(directive, event, executionContext);
        } catch (error) {
          eventSucceeded = false;
          reportRuntimeDirectiveError(error);
          if (event.payload?.action === 'confirm') throw error;
          break;
        }
      }

      const eventAction = isRecord(event.payload?.action) ? event.payload.action : undefined;
      const actionScript = readString(event.payload?.script ?? eventAction?.script);
      if (actionScript) {
        try {
          const result = await executeButtonScript(actionScript, event);
          if (result === false) eventSucceeded = false;
        } catch (error) {
          eventSucceeded = false;
          reportRuntimeDirectiveError(error);
        }
      }

      if (
        eventSucceeded &&
        (directives.length > 0 || Boolean(actionScript)) &&
        isSuccessfulEditPageSaveEvent(event)
      ) {
        await enterScanModeAfterSave(event);
      }
    } finally {
      if (executionContext.mesCommandStarted) {
        runtime.state.status.mesCommandExecuting = false;
        runtime.state.status.mesCommandActionKey = '';
      }
    }
  }

  function isBlockedEditPageSaveEvent(event: LowCodeRuntimeEvent) {
    return props.page.page_type === 'edit' &&
      isLowCodeEditPageReadonly(builtinPageFunctionMode.value) &&
      isSuccessfulEditPageSaveEvent(event);
  }

  function isRuntimeEditPageModifyEvent(event: LowCodeRuntimeEvent) {
    if (props.page.page_type !== 'edit') return false;
    const action = isRecord(event.payload?.action) ? event.payload.action : {};
    return isLowCodeEditPageModifyAction({
      code: readString(event.payload?.actionCode ?? action.code),
    });
  }

  function isSuccessfulEditPageSaveEvent(event: LowCodeRuntimeEvent) {
    if (props.page.page_type !== 'edit') return false;
    const action = isRecord(event.payload?.action) ? event.payload.action : {};
    return isLowCodeEditPageSaveAction({
      code: readString(event.payload?.actionCode ?? action.code),
    });
  }

  async function enterScanModeAfterSave(event: LowCodeRuntimeEvent) {
    const modeChanged = builtinPageFunctionMode.value !== 'scan';
    builtinPageFunctionMode.value = 'scan';
    captureFormBaselines();
    if (!modeChanged) return;

    await publishRuntimeEvent({
      name: 'page.modeChange',
      blockId: event.blockId,
      blockKind: event.blockKind,
      timestamp: Date.now(),
      payload: { mode: 'scan' },
    });
  }

  function reportRuntimeDirectiveError(error: unknown) {
    reportRuntimeError('运行时指令执行失败', error);
    message.value =
      error instanceof Error ? error.message : host.t('runtime.errors.directive');
    messageClass.value = 'lc-error';
  }

  function reportRuntimeError(scope: string, error: unknown) {
    console.error(`[LowCode Runtime] ${scope}`, error, {
      pageId: props.page.id,
      pageCode: props.page.code,
      route: readString(props.route?.fullPath),
    });
  }

  async function handleFormSubmit(
    block: LowCodeRuntimeBlock,
    values: Record<string, unknown>,
    action?: LowCodeAction,
  ) {
    await waitForActionEvent(action);
    if (block.kind !== 'form') return;
    if (
      props.page.page_type === 'edit' &&
      isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
    ) return;
    const source = getDataSource(block.id);

    if (!source) {
      return;
    }

    loadingBlockId.value = block.id;
    message.value = '';

    try {
      await saveFormSource(source.key, values);
      message.value = host.t('runtime.form.saved');
      messageClass.value = 'lc-help';
      await loadPageData(props.page);
      await publishRuntimeEvent({
        name: 'form.saved',
        blockId: block.id,
        blockKind: block.kind,
        timestamp: Date.now(),
        payload: {
          sourceKey: source.key,
          values,
        },
      });
    } catch (error) {
      reportRuntimeError('表单提交失败', error);
      message.value =
        error instanceof Error ? error.message : host.t('runtime.form.submitFailed');
      messageClass.value = 'lc-error';
    } finally {
      loadingBlockId.value = '';
    }
  }

  async function handleFormAction(
    block: LowCodeRuntimeBlock,
    action: LowCodeAction,
    values: Record<string, unknown>
  ) {
    await waitForActionEvent(action);
    if (action.route) {
      await host.getRouter().push(resolveRuntimeRoute(action.route, values));
      return;
    }

    if (action.code === 'submit') {
      await handleFormSubmit(block, values);
    }
  }

  function hasEnabledRefreshDirective(action: LowCodeAction | LowCodeButtonGroupAction) {
    return normalizeLowCodeDirectives(action.directives).some((directive) =>
      !directive.disabled && [
        'refreshDataSource',
        'refreshDataSources',
        'refreshPage',
      ].includes(directive.type.trim())
    );
  }

  async function handleToolbarAction(action: LowCodeAction | LowCodeButtonGroupAction) {
    await waitForActionEvent(action);
    if (action.route) {
      await host.getRouter().push(resolveRuntimeRoute(action.route));
      return;
    }

    if (action.code === 'refresh') {
      if (readString(action.script) || hasEnabledRefreshDirective(action)) return;
      await loadPageData(props.page);
    }
  }

  async function handleSearchSubmit(
    block: LowCodePageSearchFormBlock,
    values: Record<string, unknown>,
    action?: LowCodeAction,
  ) {
    await waitForActionEvent(action);
    const sourceKeys = searchTargetSourceKeys(block);
    if (!sourceKeys.length) return;
    sourceKeys.forEach((sourceKey) => runtime.replaceSearch(sourceKey, values));
    await refreshDataSources(sourceKeys);
  }

  async function handleSearchAction(
    block: LowCodePageSearchFormBlock,
    action: LowCodeAction,
    values: Record<string, unknown>
  ) {
    await waitForActionEvent(action);
    const sourceKeys = searchTargetSourceKeys(block);
    if (action.type === 'reset' && sourceKeys.length) {
      sourceKeys.forEach((sourceKey) => runtime.replaceSearch(sourceKey, {}));
      await refreshDataSources(sourceKeys);
      return;
    }

    if (action.code === 'submit') {
      await handleSearchSubmit(block, values);
    }
  }

  async function handleGridEdit(
    block: LowCodePageGridBlock,
    row: Record<string, unknown>
  ) {
    if (
      props.page.page_type === 'edit' &&
      isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
    ) return;
    try {
      const linkedEditRoute = await resolveLinkedEditPageRoute(block, row);

      if (linkedEditRoute) {
        await host.getRouter().push(linkedEditRoute);
        return;
      }

      const editRoute = block.editRoute ?? block.schema.rowActions?.editRoute;

      if (editRoute) {
        await host.getRouter().push(resolveRuntimeRoute(editRoute, row));
        return;
      }

      const formBlock = getFormBlockTarget(block);

      if (!formBlock) {
        message.value = '当前表格没有可用的编辑页面。';
        messageClass.value = 'lc-error';
        return;
      }

      runtime.replaceForm(formBlock.id, await deriveFormModel(formBlock, row));
      message.value = '';
    } catch (error) {
      message.value = error instanceof Error ? error.message : '编辑当前行失败。';
      messageClass.value = 'lc-error';
      console.error('[LowCode Runtime] 编辑当前行失败', error);
    }
  }

  async function handleGridDelete(
    block: LowCodePageGridBlock,
    row: Record<string, unknown>
  ) {
    if (
      props.page.page_type === 'edit' &&
      isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
    ) return;
    const source = getDataSource(block.deleteSourceKey ?? block.sourceKey);

    if (!source) {
      return;
    }

    loadingGridId.value = block.id;
    message.value = '';

    try {
      const request = resolveDataSourceRequest(source.key, source);
      const serviceName = request.serviceName;
      const serviceMethod = source.deleteMethod ?? request.serviceMethod;

      if (!serviceName || !serviceMethod || (!source.deleteMethod && isListItemsRequest(serviceName, serviceMethod))) {
        throw new Error(`Data source ${source.key} is missing delete service.`);
      }

      const viewName = readString(source.viewName);
      const writeTableName = source.sourceType === 'view'
        ? readString(source.tableName ?? source.table_name) === viewName
          ? ''
          : readString(source.tableName ?? source.table_name)
        : '';
      await host.getServiceApi().invoke(serviceName, serviceMethod, {
        ...(source.postData ?? {}),
        ...row,
        ...(writeTableName ? { tableName: writeTableName } : {}),
      });
      message.value = host.t('runtime.grid.deleted');
      messageClass.value = 'lc-help';
      await loadPageData(props.page);
    } catch (error) {
      reportRuntimeError('表格删除失败', error);
      message.value =
        error instanceof Error ? error.message : host.t('runtime.grid.deleteFailed');
      messageClass.value = 'lc-error';
    } finally {
      loadingGridId.value = '';
    }
  }
  return {
    page,
    showGlobalDialogHost,
    runtime,
    themeClass,
    themeStyle,
    hasCategoryRelation,
    categoryServiceApi,
    handleCategorySelect,
    layoutBlocks,
    pageOverlays,
    resolvedData,
    formModels,
    searchFilters,
    loadingBlockId,
    loadingGridId,
    dataLoading,
    loadingText,
    message,
    messageClass,
    handleFormSubmit,
    handleFormAction,
    handleGridEdit,
    handleGridDelete,
    handleToolbarAction,
    handleSearchSubmit,
    handleSearchAction,
    publishRuntimeEvent,
    exposed,
  };
}
