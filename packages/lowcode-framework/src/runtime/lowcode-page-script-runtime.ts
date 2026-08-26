import type { LowCodeHostRuntime } from '../core/host';
import type {
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageOverlayBlock,
  LowCodeRuntimeEvent
} from '../types/lowcode';
import { openGlobalDialog as openLowCodeGlobalDialog, type GlobalDialogConfig } from './global-dialog';
import {
  DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES,
  compactLowCodeScriptContext,
  executeLowCodeScript,
  invokeRegisteredLowCodeScriptApi,
  type LowCodeScriptCapabilityRequest,
  type LowCodeScriptContextSnapshot,
  type LowCodeScriptExecutionMode
} from './scripts';
import {
  hasBuiltinLowCodePageFunctions,
  resolveBuiltinLowCodePageFunction,
  type BuiltinLowCodePageFunctionContext,
  type BuiltinLowCodePageFunctionMode
} from './page-function';
import { isLowCodeEditPageReadonly } from './edit-page-mode';
import { resolveLowCodeNodeAction } from './node-action-registry';
import type { LowCodePageRuntimeContext } from './page-runtime';
import type { LowCodePageRendererProps } from './renderer-types';
import {
  HttpExecutor,
  NodeActionExecutor,
  PageFunctionExecutor,
  ScriptCapabilityRegistry,
  ScriptExecutorRegistry
} from './script-executors';
import { appendRouteQuery, cloneRuntimeValue, isRecord, readPath, readString } from './renderer-value-utils';

type ValueRef<T> = { value: T };
type DataSourceRequest = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
};
type SubmissionGroups = Map<string, LowCodePageFormBlock[]>;
const MAX_PAGE_FUNCTION_CALL_DEPTH = 16;

export type LowCodePageScriptRuntimeDependencies = {
  props: LowCodePageRendererProps;
  host: LowCodeHostRuntime;
  runtime: LowCodePageRuntimeContext;
  resolvedData: ValueRef<Record<string, unknown>>;
  formModels: ValueRef<Record<string, Record<string, unknown>>>;
  searchFilters: ValueRef<Record<string, Record<string, unknown>>>;
  gridStates: ValueRef<Record<string, unknown>>;
  loadingGridId: ValueRef<string>;
  message: ValueRef<string>;
  messageClass: ValueRef<string>;
  builtinPageFunctionMode: ValueRef<BuiltinLowCodePageFunctionMode>;
  formBaselines: Record<string, Record<string, unknown>>;
  sourceRequestVersions: Map<string, number>;
  hasSchemaPageFunctions(): boolean;
  hasRuntimePageFunctions(): boolean;
  getChildBlocks(block: LowCodePageBlock): LowCodePageBlock[];
  flattenBlocks(blocks: LowCodePageBlock[]): LowCodePageBlock[];
  flattenPageBlocks(schema?: LowCodePageRendererProps['page']['schema']): LowCodePageBlock[];
  findRuntimeBlock(blockId: string): LowCodePageBlock | undefined;
  isOverlayBlock(block: LowCodePageBlock): block is LowCodePageOverlayBlock;
  getDataSource(key?: string): LowCodePageDataSource | undefined;
  getGridRowKey(block: LowCodePageGridBlock): string;
  resolveDataSourceRequest(
    key: string,
    source: LowCodePageDataSource,
    postData?: Record<string, unknown>,
    mergeSearchFilters?: boolean
  ): DataSourceRequest;
  resolveRuntimePostData(postData?: Record<string, unknown>): Record<string, unknown>;
  shouldReturnEmptyForUnavailableList(error: unknown, serviceMethod: string): boolean;
  syncPageGridStates(): void;
  beginSourceRequest(key: string): number;
  isCurrentSourceRequest(key: string, version: number): boolean;
  finishSourceRequest(key: string, version: number): void;
  refreshFormNodeOptions(blockId: string, options?: Record<string, unknown>): Promise<any>;
  refreshDataSources(sourceKeys?: string[]): Promise<string[]>;
  cloneScriptValue<T>(value: T, fallback: T): T;
  isListItemsRequest(serviceName: string, serviceMethod: string): boolean;
  mergeFormModelValues(
    initialValues: Record<string, unknown>,
    values: Record<string, unknown>
  ): Record<string, unknown>;
  refreshGridChangeSets(): void;
  deriveNewFormModel(
    block: LowCodePageFormBlock,
    mode: 'create' | 'copy',
    current: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  collectFormSubmissionGroups(): SubmissionGroups;
  submitForms(options?: { reload?: boolean }): Promise<boolean>;
  captureFormBaselines(): void;
  loadPageData(page: LowCodePageRendererProps['page']): Promise<string[]>;
  resolveEditPageRoute(row?: Record<string, unknown>, rowKey?: string): Promise<string>;
  findLowCodePage(filters: Record<string, unknown>): Promise<LowCodePageRendererProps['page'] | undefined>;
  readRouteQueryWithoutRecordId(): Record<string, unknown>;
  readSavedRecordId(record: Record<string, unknown> | undefined, groups: SubmissionGroups): unknown;
  getLastSavedFormRecord(): Record<string, unknown> | undefined;
  publishRuntimeEvent(event: LowCodeRuntimeEvent): Promise<void>;
};

/** Executes isolated page scripts through action, function, and HTTP strategies. */
export class LowCodePageScriptRuntime {
  readonly executeIsolatedScript = (
    script: string,
    event: LowCodeRuntimeEvent,
    executionMode?: LowCodeScriptExecutionMode
  ): ReturnType<typeof executeLowCodeScript> => this.runIsolatedScript(script, event, executionMode);

  readonly executeButtonScript = (script: string, event: LowCodeRuntimeEvent): Promise<unknown> =>
    this.runButtonScript(script, event);

  readonly executeNodeAction = (options: Record<string, unknown>): Promise<unknown> =>
    this.executeScriptNodeAction(options);

  private readonly primaryScriptExecutors: ScriptExecutorRegistry;
  private readonly compatibilityScriptCapabilities: ScriptCapabilityRegistry;

  constructor(private readonly dependencies: LowCodePageScriptRuntimeDependencies) {
    this.primaryScriptExecutors = this.createPrimaryScriptExecutors();
    this.compatibilityScriptCapabilities = this.createCompatibilityScriptCapabilities();
  }

  private readScriptStringArg(args: unknown[], index: number, label: string) {
    const value = readString(args[index]);
    if (!value) throw new Error(`脚本 API 参数 ${label} 不能为空。`);
    return value;
  }

  private readScriptRecordArg(args: unknown[], index: number) {
    return isRecord(args[index]) ? cloneRuntimeValue(args[index]) : {};
  }

  private readScriptRowsArg(args: unknown[], index: number) {
    return Array.isArray(args[index]) ? args[index].filter(isRecord).map((row) => cloneRuntimeValue(row)) : [];
  }

  private findNestedRuntimeBlock(block: LowCodePageBlock, blockId: string) {
    const { flattenBlocks, getChildBlocks } = this.dependencies;
    return flattenBlocks(getChildBlocks(block)).find((child) => child.id === blockId);
  }

  private createNodeDialogConfig(block: LowCodePageOverlayBlock, options: Record<string, unknown>): GlobalDialogConfig {
    const { flattenBlocks, getChildBlocks, mergeFormModelValues, runtime } = this.dependencies;
    const resultNodeId = readString(options.resultNode ?? block.resultNode);
    const resultNode = resultNodeId
      ? this.findNestedRuntimeBlock(block, resultNodeId)
      : flattenBlocks(getChildBlocks(block)).find((child): child is LowCodePageFormBlock => child.kind === 'form');
    if (!resultNode || resultNode.kind !== 'form') {
      throw new Error(`弹框 "${block.id}" 未配置结果表单。`);
    }

    const suppliedData = isRecord(options.data) ? options.data : {};
    const model = mergeFormModelValues(
      resultNode.initialValues ?? {},
      mergeFormModelValues(
        isRecord(runtime.state.forms[resultNode.id]) ? runtime.state.forms[resultNode.id] : {},
        suppliedData
      )
    );
    return {
      id: block.id,
      title: readString(block.title, block.id),
      width: block.width,
      showFooter: true,
      model,
      form: { schema: cloneRuntimeValue(resultNode.schema) },
      actions: [
        {
          code: 'cancel',
          label: readString(block.cancelLabel, '取消'),
          role: 'cancel'
        },
        {
          code: 'confirm',
          label: readString(block.confirmLabel, '确定'),
          role: 'confirm',
          status: 'primary'
        }
      ]
    };
  }

  private async executeScriptNodeAction(options: Record<string, unknown>) {
    const {
      beginSourceRequest,
      builtinPageFunctionMode,
      cloneScriptValue,
      findRuntimeBlock,
      finishSourceRequest,
      flattenPageBlocks,
      formBaselines,
      getDataSource,
      host,
      isCurrentSourceRequest,
      isOverlayBlock,
      loadingGridId,
      props,
      refreshFormNodeOptions,
      resolveDataSourceRequest,
      resolveRuntimePostData,
      runtime,
      searchFilters,
      shouldReturnEmptyForUnavailableList,
      syncPageGridStates
    } = this.dependencies;
    const node = readString(options.node);
    const method = readString(options.method);
    if (!node) throw new Error('executeAction 参数 node 不能为空。');
    if (!method) throw new Error('executeAction 参数 method 不能为空。');

    const block = findRuntimeBlock(node);
    if (!block) throw new Error(`页面节点 "${node}" 不存在。`);
    if (block.kind == 'form') {
    }
    const action = resolveLowCodeNodeAction(block.kind, method);
    if (!action) throw new Error(`节点 "${node}${block.kind}" 不支持动作 "${method}"。`);
    this.assertEditPageNodeActionWritable(block.kind, method);

    if (action.execute) {
      return action.execute({
        block,
        options,
        blocks: flattenPageBlocks(props.page.schema),
        searchFilters: searchFilters.value,
        grids: runtime.state.grids,
        editPageMode: props.page.page_type === 'edit' ? builtinPageFunctionMode.value : undefined,
        getDataSource,
        resolveDataSourceRequest: (sourceKey, source, postData) =>
          resolveDataSourceRequest(sourceKey, source, postData, false),
        resolveRuntimePostData,
        invokeDataSourceRequest: async (request, source) => {
          //
          try {
            if (Object.keys(request.postData).length === 0) {
              return []//
            }
            return await host.getServiceApi().invoke(request.serviceName, request.serviceMethod, request.postData);
          } catch (error) {
            if (shouldReturnEmptyForUnavailableList(error, source.serviceMethod ?? request.serviceMethod)) {
              return [];
            }
            throw error;
          }
        },
        getSourceValue: (sourceKey) => runtime.state.sources[sourceKey],
        setSource: (sourceKey, value, sourceOptions) => runtime.setSource(sourceKey, value, sourceOptions),
        syncGridStates: () => syncPageGridStates(),
        beginSourceRequest,
        isCurrentSourceRequest,
        finishSourceRequest,
        setLoadingGrid: (blockId, loading) => {
          if (loading) {
            loadingGridId.value = blockId;
          } else if (loadingGridId.value === blockId) {
            loadingGridId.value = '';
          }
        },
        getFormValues: (blockId) => runtime.state.forms[blockId] ?? {},
        getFormBaseline: (blockId) => formBaselines[blockId] ?? {},
        patchFormValues: (blockId, values) => runtime.patchForm(blockId, values),
        replaceFormValues: (blockId, values) => runtime.replaceForm(blockId, values),
        validateForm: (blockId) =>
          runtime.getFormController(blockId)?.validate() ??
          Promise.reject(new Error(`表单节点 "${blockId}" 当前未挂载，无法校验。`)),
        clearFormValidation: (blockId) => runtime.getFormController(blockId)?.clearValidation(),
        refreshFormOptions: (blockId, refreshOptions) => refreshFormNodeOptions(blockId, refreshOptions),
        setGridRows: (blockId, rows, actionOptions) => runtime.setGridRows(blockId, rows, actionOptions),
        getGridChanges: (blockId) => runtime.getGridChanges(blockId),
        setGridCurrentRow: async (blockId, row) => {
          runtime.setGridCurrentRow(blockId, row);
          await runtime.getGridController(blockId)?.setCurrentRow(runtime.state.grids[blockId]?.currentRow ?? null);
        },
        validateGrid: (blockId) =>
          runtime.getGridController(blockId)?.validate() ??
          Promise.reject(new Error(`表格节点 "${blockId}" 当前未挂载，无法校验。`))
      });
    }

    if (action.executor === 'overlay.open' && isOverlayBlock(block)) {
      const result = await openLowCodeGlobalDialog(this.createNodeDialogConfig(block, options));
      if (result.action !== 'confirm') return null;
      return cloneScriptValue(result.values, {});
    }

    throw new Error(`节点动作执行器 "${action.executor}" 与节点 "${node}" 不匹配。`);
  }

  private assertEditPageNodeActionWritable(kind: string, method: string) {
    const { builtinPageFunctionMode, props } = this.dependencies;
    if (props.page.page_type !== 'edit' || !isLowCodeEditPageReadonly(builtinPageFunctionMode.value)) return;

    const writeMethods: Record<string, Set<string>> = {
      form: new Set(['setData', 'resetData']),
      grid: new Set(['addRow', 'deleteCurrentRow'])
    };
    if (!writeMethods[kind]?.has(method)) return;
    throw new Error('当前页面为只读状态，请先点击修改。');
  }

  private resolveScriptPageApi(options: Record<string, unknown>) {
    const { props } = this.dependencies;
    const apiName = readString(options.api);
    if (!apiName) throw new Error('executeHttp 参数 api 不能为空。');
    const api = props.page.schema.apis?.[apiName];
    if (!api) throw new Error(`页面 API "${apiName}" 未声明。`);
    return { apiName, api };
  }

  private async executeScriptHttp(options: Record<string, unknown>) {
    const { cloneScriptValue, host } = this.dependencies;
    const { apiName, api } = this.resolveScriptPageApi(options);
    const configuredMethod = readString(api.method, 'POST').toUpperCase();
    const method = readString(options.method, configuredMethod).toUpperCase();
    if (method !== configuredMethod) {
      throw new Error(`页面 API "${apiName}" 只允许使用 ${configuredMethod}。`);
    }
    if (!isRecord(options.body) && typeof options.body !== 'undefined') {
      throw new Error('executeHttp 参数 body 必须是对象。');
    }

    const result = await host.getServiceApi().invoke(api.serviceName, api.serviceMethod, {
      ...(api.postData ?? {}),
      ...(isRecord(options.body) ? cloneRuntimeValue(options.body) : {})
    });
    return api.resultPath ? cloneScriptValue(readPath(result, api.resultPath), null) : result;
  }

  private sanitizeScriptDialogConfig(value: Record<string, unknown>): GlobalDialogConfig {
    const { cloneScriptValue } = this.dependencies;
    const allowedKeys = new Set([
      'id',
      'title',
      'width',
      'height',
      'className',
      'props',
      'showFooter',
      'model',
      'form',
      'grid',
      'content',
      'actions'
    ]);
    const config = Object.fromEntries(
      Object.entries(cloneRuntimeValue(value)).filter(([key]) => allowedKeys.has(key))
    ) as GlobalDialogConfig;

    if (isRecord(config.props)) {
      config.props = Object.fromEntries(Object.entries(config.props).filter(([, item]) => typeof item !== 'function'));
    }

    return config;
  }

  private sanitizeScriptAction(value: unknown) {
    const { cloneScriptValue } = this.dependencies;
    if (!isRecord(value)) return undefined;

    const { script: _script, directives: _directives, children: _children, ...action } = value;
    return cloneScriptValue(action, {});
  }

  private sanitizeScriptEventPayload(value: unknown) {
    const { cloneScriptValue } = this.dependencies;
    const payload = isRecord(value) ? cloneScriptValue(value, {}) : {};
    const safeAction = this.sanitizeScriptAction(payload.action);
    delete payload.script;
    delete payload.directives;
    if (safeAction) payload.action = safeAction;
    else delete payload.action;
    return payload;
  }

  private createScriptContext(event: LowCodeRuntimeEvent): LowCodeScriptContextSnapshot {
    const {
      builtinPageFunctionMode,
      cloneScriptValue,
      formModels,
      gridStates,
      hasRuntimePageFunctions,
      hasSchemaPageFunctions,
      host,
      props,
      refreshGridChangeSets,
      resolvedData,
      searchFilters
    } = this.dependencies;
    refreshGridChangeSets();
    const route = host.getRoute();
    const eventPayload = cloneScriptValue(event.payload ?? {}, {});
    const safeAction = this.sanitizeScriptAction(eventPayload.action);
    const contextPolicy = props.page.schema.scriptPolicy?.context;
    const selectContextEntries = <T>(source: Record<string, T>, keys: string[] | undefined) =>
      Array.isArray(keys)
        ? Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]))
        : source;
    delete eventPayload.script;
    delete eventPayload.directives;
    if (safeAction) eventPayload.action = safeAction;
    else delete eventPayload.action;

    const context = cloneScriptValue(
      {
        page: {
          id: props.page.id,
          code: props.page.code,
          route: props.page.route,
          title: props.page.title,
          pageType: props.page.page_type,
          mode: props.page.page_type === 'edit' ? builtinPageFunctionMode.value : undefined,
          version: props.page.version
        },
        route: {
          query: route.query ?? {},
          params: route.params ?? {},
          path: route.path ?? '',
          fullPath: route.fullPath ?? ''
        },
        data: selectContextEntries(resolvedData.value, contextPolicy?.dataSourceKeys),
        forms: selectContextEntries(formModels.value, contextPolicy?.formBlockIds),
        searches: selectContextEntries(searchFilters.value, contextPolicy?.searchSourceKeys),
        grids: selectContextEntries(gridStates.value, contextPolicy?.gridBlockIds),
        event: {
          ...eventPayload,
          name: event.name,
          blockId: event.blockId,
          blockKind: event.blockKind,
          timestamp: event.timestamp
        },
        policy: {
          apiNames: Array.isArray(props.page.schema.scriptPolicy?.apiNames)
            ? props.page.schema.scriptPolicy.apiNames.filter(
              (name): name is string => typeof name === 'string' && Boolean(name.trim())
            )
            : [],
          capabilities: Array.isArray(props.page.schema.scriptPolicy?.capabilities)
            ? [
              ...props.page.schema.scriptPolicy.capabilities,
              ...(hasSchemaPageFunctions() ? ['action.execute' as const] : []),
              ...(Object.keys(props.page.schema.apis ?? {}).length > 0 ? ['http.execute' as const] : []),
              ...(hasRuntimePageFunctions() ? ['pageFunction.execute' as const] : [])
            ].filter((capability, index, capabilities) => capabilities.indexOf(capability) === index)
            : [
              ...(hasSchemaPageFunctions() ? ['action.execute' as const] : []),
              ...(Object.keys(props.page.schema.apis ?? {}).length > 0 ? ['http.execute' as const] : []),
              ...(hasRuntimePageFunctions() ? ['pageFunction.execute' as const] : [])
            ]
        }
      },
      {
        page: {},
        route: {},
        data: {},
        forms: {},
        searches: {},
        grids: {},
        event: {},
        policy: { apiNames: [] }
      }
    );
    return compactLowCodeScriptContext(
      context,
      props.page.schema.scriptPolicy?.limits?.maxPayloadBytes ?? DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES
    );
  }

  private resolvePageFunction(options: Record<string, unknown>) {
    const { props } = this.dependencies;
    const name = readString(options.name);
    if (!name) throw new Error('executeFunction 参数 name 不能为空。');
    const pageFunction = props.page.schema.functions?.find((item) => item.name === name && item.enabled !== false);
    if (pageFunction) return { kind: 'schema' as const, pageFunction };

    const builtinFunction = resolveBuiltinLowCodePageFunction(props.page.page_type, name);
    if (builtinFunction) return { kind: 'builtin' as const, pageFunction: builtinFunction };

    throw new Error(`页面函数 "${name}" 不存在、未启用或不适用于当前页面类型。`);
  }

  private getBuiltinSelectedRows() {
    const { runtime } = this.dependencies;
    const grids = Object.values(runtime.state.grids);
    for (const grid of grids) {
      if (!grid) continue;
      if (grid.selectedRows.length) return cloneRuntimeValue(grid.selectedRows);
      if (grid.currentRow) return [cloneRuntimeValue(grid.currentRow)];
      if (grid.contextRow) return [cloneRuntimeValue(grid.contextRow)];
    }
    return [];
  }

  private getBuiltinFormRecords() {
    const { formModels } = this.dependencies;
    return Object.values(formModels.value)
      .filter(isRecord)
      .map((values) => cloneRuntimeValue(values));
  }

  private resolveBuiltinSourceForRows(rows: Record<string, unknown>[]) {
    const { getDataSource, props, runtime } = this.dependencies;
    const matchingGrid = Object.values(runtime.state.grids).find((grid) => {
      if (!grid.sourceKey) return false;
      return rows.some((row) => grid.rows.some((candidate) => Object.is(candidate[grid.rowKey], row[grid.rowKey])));
    });
    if (matchingGrid?.sourceKey) return getDataSource(matchingGrid.sourceKey);

    const sourceKey = readString(isRecord(rows[0]) ? rows[0].sourceKey : undefined);
    if (sourceKey) return getDataSource(sourceKey);

    return Object.values(props.page.schema.dataSources ?? {}).find((source) => Boolean(source.saveMethod));
  }

  private resolveBuiltinDeleteSourceForRows(rows: Record<string, unknown>[]) {
    const { flattenPageBlocks, getDataSource, props, runtime } = this.dependencies;
    const matchingGridEntry = Object.entries(runtime.state.grids).find(([, grid]) => {
      if (!grid) return false;
      return rows.some((row) => grid.rows.some((candidate) => Object.is(candidate[grid.rowKey], row[grid.rowKey])));
    });
    const matchingGridBlock = matchingGridEntry
      ? flattenPageBlocks(props.page.schema).find(
        (block): block is LowCodePageGridBlock => block.kind === 'grid' && block.id === matchingGridEntry[0]
      )
      : undefined;
    const sourceKey = readString(
      matchingGridBlock?.deleteSourceKey ??
      matchingGridBlock?.sourceKey ??
      matchingGridEntry?.[1]?.sourceKey ??
      rows[0]?.sourceKey
    );
    return sourceKey ? getDataSource(sourceKey) : undefined;
  }

  private async updateBuiltinRecords(rows: Record<string, unknown>[], values: Record<string, unknown>) {
    const { host, resolveDataSourceRequest, resolveRuntimePostData, runtime } = this.dependencies;
    const source = this.resolveBuiltinSourceForRows(rows);
    if (!source) throw new Error('当前页面没有可保存的数据源。');
    const request = resolveDataSourceRequest(source.key, source);
    const serviceName = request.serviceName;
    const serviceMethod =
      source.saveMethod ??
      (request.serviceMethod === 'listItems' &&
        (readString(request.postData.resource) || readString(request.postData.tableName))
        ? 'saveItem'
        : request.serviceMethod);
    if (!serviceName || !serviceMethod) {
      throw new Error(`数据源 ${source.key} 未配置保存方法。`);
    }

    const rowKey = Object.values(runtime.state.grids).find((grid) => grid.sourceKey === source.key)?.rowKey ?? 'id';
    return Promise.all(
      rows.map((row) => {
        const id = row[rowKey];
        if (typeof id === 'undefined' || id === null || id === '') {
          throw new Error('选中数据缺少主键，无法保存。');
        }
        return host.getServiceApi().invoke(serviceName, serviceMethod, {
          ...resolveRuntimePostData(source.postData),
          resource: readString(source.postData?.resource, readString(source.tableName ?? source.table_name)),
          [rowKey]: id,
          data: values
        });
      })
    );
  }

  private async deleteBuiltinRecords(rows: Record<string, unknown>[]) {
    const { host, isListItemsRequest, resolveDataSourceRequest, resolveRuntimePostData, runtime } = this.dependencies;
    const source = this.resolveBuiltinDeleteSourceForRows(rows);
    if (!source) throw new Error('当前页面没有可删除的数据源。');

    const request = resolveDataSourceRequest(source.key, source);
    const serviceName = request.serviceName;
    const serviceMethod = source.deleteMethod ?? request.serviceMethod;
    if (!serviceName || !serviceMethod || (!source.deleteMethod && isListItemsRequest(serviceName, serviceMethod))) {
      throw new Error(`数据源 ${source.key} 未配置删除方法。`);
    }

    const matchingGrid = Object.values(runtime.state.grids).find((grid) =>
      rows.some((row) => grid.rows.some((candidate) => Object.is(candidate[grid.rowKey], row[grid.rowKey])))
    );
    const rowKey = matchingGrid?.rowKey ?? 'id';
    const postData = {
      ...resolveRuntimePostData(source.postData),
      resource: readString(source.postData?.resource, readString(source.tableName ?? source.table_name))
    };

    return Promise.all(
      rows.map((row) => {
        const id = row[rowKey];
        if (typeof id === 'undefined' || id === null || id === '') {
          throw new Error('选中数据缺少主键，无法删除。');
        }
        return host.getServiceApi().invoke(serviceName, serviceMethod, {
          ...postData,
          [rowKey]: id
        });
      })
    );
  }

  private async resetBuiltinForms(mode: 'create' | 'copy') {
    const { deriveNewFormModel, flattenPageBlocks, formModels, props, runtime } = this.dependencies;
    const formRecords: Record<string, Record<string, unknown>> = {};

    for (const block of flattenPageBlocks(props.page.schema)) {
      if (block.kind !== 'form') continue;
      const current = formModels.value[block.id] ?? {};
      const values = await deriveNewFormModel(block, mode, current);
      runtime.replaceForm(block.id, values);
      formRecords[block.id] = cloneRuntimeValue(values);
    }

    return formRecords;
  }

  private async clearBuiltinDetailGrids() {
    const { flattenPageBlocks, getGridRowKey, loadingGridId, props, resolvedData, runtime, sourceRequestVersions } =
      this.dependencies;
    const clearedSourceKeys = new Set<string>();

    for (const block of flattenPageBlocks(props.page.schema)) {
      if (block.kind !== 'grid' || block.tableType !== 'detail') continue;

      if (block.sourceKey) {
        if (!clearedSourceKeys.has(block.sourceKey)) {
          clearedSourceKeys.add(block.sourceKey);
          sourceRequestVersions.delete(block.sourceKey);
          runtime.setSourceLoading(block.sourceKey, false);
          const sourceValue = resolvedData.value[block.sourceKey];
          runtime.setSource(
            block.sourceKey,
            isRecord(sourceValue) && Array.isArray(sourceValue.rows) ? { ...sourceValue, rows: [] } : []
          );
        }
      } else {
        runtime.setGridRows(block.id, [], { rowKey: getGridRowKey(block) });
      }
      if (loadingGridId.value === block.id) loadingGridId.value = '';
      await runtime.getGridController(block.id)?.clearValidation();
    }
  }

  private patchBuiltinForms(values: Record<string, unknown>) {
    const { flattenPageBlocks, formModels, props, runtime } = this.dependencies;
    let patched = false;
    for (const block of flattenPageBlocks(props.page.schema)) {
      if (block.kind !== 'form') continue;
      const model = formModels.value[block.id] ?? {};
      const applicableValues = Object.fromEntries(
        Object.entries(values).filter(
          ([field]) => field in model || block.schema.fields.some((item) => item.field === field)
        )
      );
      if (!Object.keys(applicableValues).length) continue;
      runtime.patchForm(block.id, applicableValues);
      patched = true;
    }
    if (!patched) throw new Error('当前页面没有与操作状态匹配的表单字段。');
    return cloneRuntimeValue(formModels.value);
  }

  private async resolveBuiltinExitRoute(args: Record<string, unknown>) {
    const { findLowCodePage, host, props } = this.dependencies;
    const explicitRoute = readString(args.route);
    if (explicitRoute) return explicitRoute;

    const fromPage = readString(host.getRoute().query?.fromPage);
    if (fromPage) {
      const page = await findLowCodePage({ code: fromPage });
      if (readString(page?.route)) return page!.route;
    }

    if (props.page.page_type === 'edit') {
      const parent = await findLowCodePage({ edit_page_id: props.page.id });
      if (readString(parent?.route)) return parent!.route;
      if (props.page.route.endsWith('/edit')) return props.page.route.slice(0, -5);
    }

    return '/dashboard';
  }

  private createBuiltinPageFunctionContext(
    args: Record<string, unknown>,
    event: LowCodeRuntimeEvent
  ): BuiltinLowCodePageFunctionContext {
    const {
      builtinPageFunctionMode,
      captureFormBaselines,
      collectFormSubmissionGroups,
      getLastSavedFormRecord,
      host,
      loadPageData,
      message,
      messageClass,
      props,
      publishRuntimeEvent,
      readRouteQueryWithoutRecordId,
      readSavedRecordId,
      resolvedData,
      resolveEditPageRoute,
      submitForms
    } = this.dependencies;
    const pageType = props.page.page_type;
    if (pageType !== 'list' && pageType !== 'edit') {
      throw new Error(`页面类型 "${pageType}" 不支持内置页面函数。`);
    }

    return {
      pageType,
      args,
      getSelectedRows: () => {
        const payloadRows = Array.isArray(event.payload?.rows) ? event.payload.rows.filter(isRecord) : [];
        const payloadRow = isRecord(event.payload?.row) ? [event.payload.row] : [];
        return cloneRuntimeValue(
          payloadRows.length ? payloadRows : payloadRow.length ? payloadRow : this.getBuiltinSelectedRows()
        );
      },
      getFormRecords: () => this.getBuiltinFormRecords(),
      navigateToEdit: async (row = {}) => {
        const route = readString(args.route) || (await resolveEditPageRoute(row, readString(args.rowKey, 'id')));
        if (!route) throw new Error('当前列表页没有关联编辑页。');
        return host.getRouter().push(route);
      },
      updateRecords: (rows, values) => this.updateBuiltinRecords(rows, values),
      deleteRecords: (rows) => this.deleteBuiltinRecords(rows),
      invokeService: (serviceName, serviceMethod, postData) =>
        host.getServiceApi().invoke(serviceName, serviceMethod, postData),
      prepareForms: async (mode) => {
        builtinPageFunctionMode.value = 'add';
        if (mode === 'create') await this.clearBuiltinDetailGrids();
        const result = await this.resetBuiltinForms(mode);
        return result;
      },
      patchForms: async (values) => this.patchBuiltinForms(values),
      getMode: () => builtinPageFunctionMode.value,
      submitForms: async (options = {}) => {
        if (isLowCodeEditPageReadonly(builtinPageFunctionMode.value) && options.allowScan !== true) return false;
        const navigateAfterCreate = builtinPageFunctionMode.value === 'add';
        const groups = collectFormSubmissionGroups();
        if (!groups.size) throw new Error('当前编辑页没有配置可保存的表单数据源。');
        const preserveMode = options.allowScan === true;
        const saved = await submitForms({
          reload: preserveMode || !navigateAfterCreate
        });
        if (!saved) return false;

        if (preserveMode) return true;

        if (!navigateAfterCreate) {
          builtinPageFunctionMode.value = 'scan';
          captureFormBaselines();
          return true;
        }

        const savedId = readSavedRecordId(getLastSavedFormRecord(), groups);
        builtinPageFunctionMode.value = 'scan';
        captureFormBaselines();
        if (!savedId) return saved;
        await host.getRouter().push(
          appendRouteQuery(props.page.route, {
            ...readRouteQueryWithoutRecordId(),
            id: savedId
          })
        );
        return saved;
      },
      setMode: async (mode) => {
        builtinPageFunctionMode.value = mode;
        await publishRuntimeEvent({
          name: 'page.modeChange',
          blockId: event.blockId,
          blockKind: event.blockKind,
          timestamp: Date.now(),
          payload: { mode }
        });
      },
      refresh: async () => {
        const errors = await loadPageData(props.page);
        if (errors.length) throw new Error(errors[0]);
        return cloneRuntimeValue(resolvedData.value);
      },
      print: async () => {
        if (typeof globalThis.print !== 'function') throw new Error('当前环境不支持打印。');
        globalThis.print();
        return true;
      },
      exit: async () => host.getRouter().push(await this.resolveBuiltinExitRoute(args)),
      notify: (nextMessage, status = 'info') => {
        message.value = nextMessage;
        messageClass.value = status === 'error' ? 'lc-error' : 'lc-help';
      }
    };
  }

  private async executePageFunction(options: Record<string, unknown>, event: LowCodeRuntimeEvent) {
    const resolvedFunction = this.resolvePageFunction(options);
    if (typeof options.args !== 'undefined' && !isRecord(options.args)) {
      throw new Error('executeFunction 参数 args 必须是对象。');
    }
    const args = isRecord(options.args) ? cloneRuntimeValue(options.args) : {};
    if (resolvedFunction.kind === 'builtin') {
      return resolvedFunction.pageFunction.execute(this.createBuiltinPageFunctionContext(args, event));
    }
    const pageFunction = resolvedFunction.pageFunction;
    const callStack = Array.isArray(event.payload?.pageFunctionStack)
      ? event.payload.pageFunctionStack.filter((item): item is string => typeof item === 'string' && Boolean(item))
      : [];
    if (callStack.length >= MAX_PAGE_FUNCTION_CALL_DEPTH) {
      throw new Error(`页面函数调用深度不能超过 ${MAX_PAGE_FUNCTION_CALL_DEPTH} 层。`);
    }
    if (callStack.includes(pageFunction.name)) {
      throw new Error(`页面函数 "${pageFunction.name}" 不允许递归调用。`);
    }
    const functionEvent: LowCodeRuntimeEvent = {
      name: `pageFunction.${pageFunction.name}`,
      blockId: event.blockId,
      blockKind: event.blockKind,
      timestamp: Date.now(),
      payload: {
        args,
        callerEvent: this.sanitizeScriptEventPayload(event.payload),
        pageFunctionStack: [...callStack, pageFunction.name]
      }
    };
    const result = await this.executeIsolatedScript(pageFunction.script, functionEvent);
    return result.value;
  }

  private createPrimaryScriptExecutors() {
    return new ScriptExecutorRegistry([
      new NodeActionExecutor((options) => this.executeScriptNodeAction(options)),
      new PageFunctionExecutor((options, context) => this.executePageFunction(options, context.event)),
      new HttpExecutor((options) => this.executeScriptHttp(options))
    ]);
  }

  private createCompatibilityScriptCapabilities() {
    const {
      cloneScriptValue,
      findRuntimeBlock,
      getDataSource,
      getGridRowKey,
      host,
      loadPageData,
      message,
      messageClass,
      props,
      publishRuntimeEvent,
      refreshDataSources,
      resolvedData,
      runtime,
      syncPageGridStates
    } = this.dependencies;

    return new ScriptCapabilityRegistry()
      .register('api.invoke', (request, { scriptContext }) => {
        const apiName = this.readScriptStringArg(request.args, 0, 'name');
        return invokeRegisteredLowCodeScriptApi(apiName, this.readScriptRecordArg(request.args, 1), scriptContext);
      })
      .register('source.refresh', async (request) => {
        const sourceKey = this.readScriptStringArg(request.args, 0, 'sourceKey');
        if (!getDataSource(sourceKey)) throw new Error(`数据源 "${sourceKey}" 不存在。`);
        const errors = await refreshDataSources([sourceKey]);
        if (errors.length) throw new Error(errors[0]);
        return cloneScriptValue(resolvedData.value[sourceKey], null);
      })
      .register('source.refreshAll', async () => {
        const errors = await refreshDataSources();
        if (errors.length) throw new Error(errors[0]);
        return cloneScriptValue(resolvedData.value, {});
      })
      .register('source.set', (request) => {
        this.assertEditPageCapabilityWritable('source.set');
        const sourceKey = this.readScriptStringArg(request.args, 0, 'sourceKey');
        if (!getDataSource(sourceKey)) throw new Error(`数据源 "${sourceKey}" 不存在。`);
        runtime.setSource(sourceKey, cloneRuntimeValue(request.args[1]));
        syncPageGridStates();
        return true;
      })
      .register(['form.patch', 'form.replace'], async (request) => {
        const blockId = this.readScriptStringArg(request.args, 0, 'blockId');
        const block = findRuntimeBlock(blockId);
        if (!block || (block.kind !== 'form' && block.kind !== 'searchForm')) {
          throw new Error(`表单 "${blockId}" 不存在。`);
        }
        if (block.kind === 'form') this.assertEditPageCapabilityWritable(request.name);
        const values = this.readScriptRecordArg(request.args, 1);
        if (request.name === 'form.patch') runtime.patchForm(blockId, values);
        else runtime.replaceForm(blockId, values);
        await runtime.getFormController(blockId)?.setValues?.(runtime.state.forms[blockId] ?? {});
        return cloneScriptValue(runtime.state.forms[blockId], {});
      })
      .register('grid.setRows', (request) => {
        const blockId = this.readScriptStringArg(request.args, 0, 'blockId');
        const block = findRuntimeBlock(blockId);
        if (!block || block.kind !== 'grid') throw new Error(`表格 "${blockId}" 不存在。`);
        const rows = this.readScriptRowsArg(request.args, 1);
        if (block.sourceKey) runtime.setSource(block.sourceKey, rows);
        else runtime.setGridRows(blockId, rows, { rowKey: getGridRowKey(block) });
        syncPageGridStates();
        return rows;
      })
      .register(['search.patch', 'search.replace'], (request) => {
        const sourceKey = this.readScriptStringArg(request.args, 0, 'sourceKey');
        if (!getDataSource(sourceKey)) throw new Error(`数据源 "${sourceKey}" 不存在。`);
        const values = this.readScriptRecordArg(request.args, 1);
        if (request.name === 'search.patch') runtime.patchSearch(sourceKey, values);
        else runtime.replaceSearch(sourceKey, values);
        return cloneScriptValue(runtime.state.searches[sourceKey], {});
      })
      .register('page.refresh', async () => {
        const errors = await loadPageData(props.page);
        if (errors.length) throw new Error(errors[0]);
        return true;
      })
      .register('router.push', async (request) => {
        const target = request.args[0];
        if (typeof target !== 'string' && !isRecord(target)) {
          throw new Error('路由参数必须是字符串或对象。');
        }
        await host.getRouter().push(cloneRuntimeValue(target));
        return true;
      })
      .register(['message.success', 'message.info', 'message.warning', 'message.error'], (request) => {
        message.value = this.readScriptStringArg(request.args, 0, 'message');
        messageClass.value = request.name === 'message.error' ? 'lc-error' : 'lc-help';
        return true;
      })
      .register('dialog.open', async (request) => {
        if (!isRecord(request.args[0])) throw new Error('弹框配置必须是对象。');
        const config = this.sanitizeScriptDialogConfig(request.args[0]);
        if (!readString(config.title)) throw new Error('弹框标题不能为空。');
        const result = await openLowCodeGlobalDialog(config);
        return cloneScriptValue<Record<string, unknown>>(result as unknown as Record<string, unknown>, {
          action: 'close',
          values: {}
        });
      })
      .register('event.emit', async (request, { event }) => {
        const name = this.readScriptStringArg(request.args, 0, 'eventName');
        await publishRuntimeEvent({
          name,
          blockId: event.blockId,
          blockKind: event.blockKind,
          timestamp: Date.now(),
          payload: this.sanitizeScriptEventPayload(request.args[1])
        });
        return true;
      });
  }

  private async handleScriptCapability(
    request: LowCodeScriptCapabilityRequest,
    context: LowCodeScriptContextSnapshot,
    event: LowCodeRuntimeEvent
  ) {
    const allowedCapabilities = context.policy?.capabilities;
    if (!Array.isArray(allowedCapabilities) || !allowedCapabilities.includes(request.name)) {
      // throw new Error(`脚本能力 "${request.name}" 未经当前页面授权。`);
    }

    if (this.primaryScriptExecutors.has(request.name)) {
      return this.primaryScriptExecutors.execute(request, {
        event,
        scriptContext: context
      });
    }

    return this.compatibilityScriptCapabilities.execute(request, {
      event,
      scriptContext: context
    });
  }

  private assertEditPageCapabilityWritable(capability: string) {
    const { builtinPageFunctionMode, props } = this.dependencies;
    if (props.page.page_type !== 'edit' || !isLowCodeEditPageReadonly(builtinPageFunctionMode.value)) return;
    throw new Error(`当前页面为只读状态，不能执行 ${capability}。`);
  }

  private async runIsolatedScript(
    script: string,
    event: LowCodeRuntimeEvent,
    executionMode: LowCodeScriptExecutionMode = 'script'
  ) {
    const { props } = this.dependencies;
    const context = this.createScriptContext(event);
    return executeLowCodeScript(
      {
        script,
        context,
        executionMode,
        limits: props.page.schema.scriptPolicy?.limits
      },
      (request) => this.handleScriptCapability(request, context, event)
    );
  }

  private async runButtonScript(script: string, event: LowCodeRuntimeEvent) {
    const result = await this.executeIsolatedScript(script, event);
    return result.value;
  }
}
