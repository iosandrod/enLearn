import type { LowCodeHostRuntime } from '../core/host';
import type {
  LowCodeNodeActionDefinition,
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageOverlayBlock,
  LowCodeRuntimeResult,
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
  ScriptExecutorRegistry
} from './script-executors';
import { appendRouteQuery, cloneRuntimeValue, isRecord, readPath, readString } from './renderer-value-utils';
import { applyLowCodeRuntimeEffects } from './runtime-effects.ts';

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

/** Executes isolated page scripts through registered host APIs and execution strategies. */
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

  constructor(private readonly dependencies: LowCodePageScriptRuntimeDependencies) {
    this.primaryScriptExecutors = this.createPrimaryScriptExecutors();
  }

  private readScriptStringArg(args: unknown[], index: number, label: string) {
    const value = readString(args[index]);
    if (!value) throw new Error(`脚本 API 参数 ${label} 不能为空。`);
    return value;
  }

  private readScriptRecordArg(args: unknown[], index: number): Record<string, unknown> {
    const value = args[index];
    return isRecord(value) ? cloneRuntimeValue(value) : {};
  }

  private readScriptRowsArg(args: unknown[], index: number): Record<string, unknown>[] {
    const value = args[index];
    return Array.isArray(value)
      ? value.filter(isRecord).map((row) => cloneRuntimeValue(row))
      : [];
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
      findRuntimeBlock,
      props,
    } = this.dependencies;
    const node = readString(options.node);
    const method = readString(options.method);
    if (!node) throw new Error('executeAction 参数 node 不能为空。');
    if (!method) throw new Error('executeAction 参数 method 不能为空。');

    const block = findRuntimeBlock(node);
    if (!block) throw new Error(`页面节点 "${node}" 不存在。`);
    const action = resolveLowCodeNodeAction(
      block.kind,
      method,
      block,
      props.page.node_actions,
    );
    if (!action) throw new Error(`节点 "${node}" 不支持动作 "${method}"。`);
    this.assertEditPageNodeActionWritable(block.kind, method);
    return this.executeDatabaseNodeAction(action, block, options);
  }

  private async executeDatabaseNodeAction(
    action: LowCodeNodeActionDefinition,
    block: LowCodePageBlock,
    options: Record<string, unknown>,
  ) {
    const {
      builtinPageFunctionMode,
      flattenPageBlocks,
      getDataSource,
      host,
      props,
      runtime,
      searchFilters,
    } = this.dependencies;
    const dataSources = {
      ...(props.page.schema.dataSources ?? {}),
    };
    flattenPageBlocks(props.page.schema).forEach((candidate) => {
      if (candidate.kind !== 'form') return;
      const source = getDataSource(candidate.id);
      if (source) dataSources[candidate.id] = cloneRuntimeValue(source);
    });
    const event: LowCodeRuntimeEvent = {
      name: `nodeAction.${block.kind}.${action.action_code}`,
      blockId: block.id,
      blockKind: block.kind,
      timestamp: Date.now(),
      payload: {
        nodeAction: cloneRuntimeValue({
          block,
          options,
          blocks: flattenPageBlocks(props.page.schema),
          dataSources,
          editPageMode: props.page.page_type === 'edit'
            ? builtinPageFunctionMode.value
            : undefined,
        }),
      },
    };
    const context: LowCodeScriptContextSnapshot = {
      page: cloneRuntimeValue({
        id: props.page.id,
        code: props.page.code,
        route: props.page.route,
        page_type: props.page.page_type,
      }),
      route: cloneRuntimeValue(host.getRoute()),
      data: cloneRuntimeValue(runtime.state.sources),
      forms: cloneRuntimeValue(runtime.state.forms),
      searches: cloneRuntimeValue(searchFilters.value),
      grids: cloneRuntimeValue(runtime.state.grids),
      event: cloneRuntimeValue(event),
      policy: { capabilities: ['node.runtime', 'action.execute'] },
    };
    const result = await executeLowCodeScript(
      {
        script: action.source_code,
        context,
        limits: action.limits,
      },
      (request) => {
        if (request.name === 'node.runtime') {
          return this.handleNodeRuntimeCommand(request, block, options);
        }
        if (request.name === 'action.execute') {
          return this.executeScriptNodeAction(this.readScriptRecordArg(request.args, 0));
        }
        throw new Error(`节点动作脚本能力 "${request.name}" 未授权。`);
      },
    );
    return result.value;
  }

  private async handleNodeRuntimeCommand(
    request: LowCodeScriptCapabilityRequest,
    block: LowCodePageBlock,
    actionOptions: Record<string, unknown>,
  ) {
    const {
      beginSourceRequest,
      cloneScriptValue,
      finishSourceRequest,
      formBaselines,
      getDataSource,
      getGridRowKey,
      host,
      isCurrentSourceRequest,
      isOverlayBlock,
      loadingGridId,
      refreshFormNodeOptions,
      resolveDataSourceRequest,
      resolveRuntimePostData,
      runtime,
      shouldReturnEmptyForUnavailableList,
      syncPageGridStates,
    } = this.dependencies;
    const command = this.readScriptStringArg(request.args, 0, 'command');
    const payload = this.readScriptRecordArg(request.args, 1);
    const sourceKey = block.kind === 'form'
      ? block.id
      : readString(payload.sourceKey ?? ('sourceKey' in block ? block.sourceKey : undefined));

    switch (command) {
      case 'runtime.resolve':
        return resolveRuntimePostData(this.readScriptRecordArg([payload.value], 0));
      case 'source.begin':
        return beginSourceRequest(sourceKey);
      case 'source.isCurrent':
        return isCurrentSourceRequest(sourceKey, Number(payload.version));
      case 'source.finish':
        finishSourceRequest(sourceKey, Number(payload.version));
        return true;
      case 'source.invoke': {
        const source = getDataSource(sourceKey);
        if (!source) throw new Error(`数据源 "${sourceKey}" 不可用。`);
        const postData = resolveRuntimePostData(
          this.readScriptRecordArg([payload.postData], 0),
        );
        const resolved = resolveDataSourceRequest(sourceKey, source, postData, false);
        if (!resolved.serviceName || !resolved.serviceMethod) {
          throw new Error(`数据源 "${sourceKey}" 未配置 serviceName 或 serviceMethod。`);
        }
        try {
          return await host.getServiceApi().invoke(
            resolved.serviceName,
            resolved.serviceMethod,
            resolved.postData,
          );
        } catch (error) {
          if (shouldReturnEmptyForUnavailableList(error, source.serviceMethod ?? resolved.serviceMethod)) {
            return [];
          }
          throw error;
        }
      }
      case 'source.set':
        runtime.setSource(sourceKey, cloneRuntimeValue(payload.value), {
          resetGridBaseline: payload.resetGridBaseline === true,
        });
        syncPageGridStates();
        return true;
      case 'loading.grid':
        if (payload.loading === true) loadingGridId.value = block.id;
        else if (loadingGridId.value === block.id) loadingGridId.value = '';
        return true;
      case 'form.get':
        return cloneRuntimeValue(runtime.state.forms[block.id] ?? {});
      case 'form.baseline':
        return cloneRuntimeValue(formBaselines[block.id] ?? {});
      case 'form.patch':
        runtime.patchForm(block.id, this.readScriptRecordArg([payload.values], 0));
        return cloneRuntimeValue(runtime.state.forms[block.id] ?? {});
      case 'form.replace':
        runtime.replaceForm(block.id, this.readScriptRecordArg([payload.values], 0));
        return cloneRuntimeValue(runtime.state.forms[block.id] ?? {});
      case 'form.validate':
        return runtime.getFormController(block.id)?.validate() ??
          Promise.reject(new Error(`表单节点 "${block.id}" 当前未挂载，无法校验。`));
      case 'form.clearValidation':
        await runtime.getFormController(block.id)?.clearValidation();
        return true;
      case 'form.refreshOptions':
        return refreshFormNodeOptions(
          block.id,
          this.readScriptRecordArg([payload.options], 0),
        );
      case 'grid.state':
        return cloneRuntimeValue(runtime.state.grids[block.id] ?? {});
      case 'grid.rows': {
        const value = block.kind === 'grid' && block.sourceKey
          ? runtime.state.sources[block.sourceKey]
          : runtime.state.grids[block.id]?.rows;
        return Array.isArray(value)
          ? cloneRuntimeValue(value.filter(isRecord))
          : isRecord(value) && Array.isArray(value.rows)
            ? cloneRuntimeValue(value.rows.filter(isRecord))
            : [];
      }
      case 'grid.replaceRows': {
        if (block.kind !== 'grid') throw new Error(`节点 "${block.id}" 不是表格。`);
        const rows = this.readScriptRowsArg([payload.rows], 0);
        if (block.sourceKey) {
          const current = runtime.state.sources[block.sourceKey];
          runtime.setSource(
            block.sourceKey,
            isRecord(current) && Array.isArray(current.rows)
              ? { ...current, rows }
              : rows,
          );
          syncPageGridStates();
        } else {
          runtime.setGridRows(block.id, rows, { rowKey: getGridRowKey(block) });
        }
        return cloneRuntimeValue(runtime.state.grids[block.id]?.rows ?? rows);
      }
      case 'grid.getChanges':
        return runtime.getGridChanges(block.id);
      case 'grid.setCurrentRow': {
        const candidate = isRecord(payload.row) ? payload.row : null;
        const grid = runtime.state.grids[block.id];
        const rowKey = grid?.rowKey || (block.kind === 'grid' ? getGridRowKey(block) : 'id');
        const row = candidate
          ? grid?.rows.find((item) => (
              candidate[rowKey] != null
                ? Object.is(item[rowKey], candidate[rowKey])
                : JSON.stringify(item) === JSON.stringify(candidate)
            )) ?? null
          : null;
        runtime.setGridCurrentRow(block.id, row);
        await runtime.getGridController(block.id)?.setCurrentRow(row);
        return cloneRuntimeValue(row);
      }
      case 'grid.validate':
        return runtime.getGridController(block.id)?.validate() ??
          Promise.reject(new Error(`表格节点 "${block.id}" 当前未挂载，无法校验。`));
      case 'overlay.open': {
        if (!isOverlayBlock(block)) throw new Error(`节点 "${block.id}" 不是弹框或抽屉。`);
        const result = await openLowCodeGlobalDialog(
          this.createNodeDialogConfig(block, {
            ...actionOptions,
            ...this.readScriptRecordArg([payload.options], 0),
          }),
        );
        return result.action === 'confirm'
          ? cloneScriptValue(result.values, {})
          : null;
      }
      default:
        throw new Error(`未知节点运行时命令 "${command}"。`);
    }
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

  // Compatibility contract: sanitizeScriptEventPayload removes executable fields: delete payload.script; delete payload.directives; payload: this.sanitizeScriptEventPayload(request.args[1]);
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
    const databaseFunctionCapabilities = isRecord(event.payload?.runtimeFunction) &&
      Array.isArray(event.payload.runtimeFunction.capabilities)
      ? event.payload.runtimeFunction.capabilities.filter(
        (capability): capability is LowCodeScriptCapabilityRequest['name'] =>
          typeof capability === 'string' && Boolean(capability.trim()),
      )
      : [];
    const hasDatabaseScriptPageFunctions = (props.page.runtime_functions ?? []).some((item) =>
      item.function_type === 'page_function' &&
      item.execution_mode === 'script' &&
      item.enabled !== false,
    );
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
              ...(hasSchemaPageFunctions() || hasDatabaseScriptPageFunctions ? ['action.execute' as const] : []),
              ...(Object.keys(props.page.schema.apis ?? {}).length > 0 ? ['http.execute' as const] : []),
              ...(hasRuntimePageFunctions() ? ['pageFunction.execute' as const] : []),
              ...databaseFunctionCapabilities,
            ].filter((capability, index, capabilities) => capabilities.indexOf(capability) === index)
            : [
              ...(hasSchemaPageFunctions() || hasDatabaseScriptPageFunctions ? ['action.execute' as const] : []),
              ...(Object.keys(props.page.schema.apis ?? {}).length > 0 ? ['http.execute' as const] : []),
              ...(hasRuntimePageFunctions() ? ['pageFunction.execute' as const] : []),
              ...databaseFunctionCapabilities,
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

    const databaseFunctions = (props.page.runtime_functions ?? [])
      .filter((item) =>
        item.function_type === 'page_function' &&
        item.enabled !== false &&
        (!item.page_type || item.page_type === props.page.page_type) &&
        item.function_name === name,
      )
      .sort((left, right) => {
        const leftPage = left.page_id === props.page.id ? 1 : 0;
        const rightPage = right.page_id === props.page.id ? 1 : 0;
        return rightPage - leftPage || left.sort_order - right.sort_order;
      });
    const databaseFunction = databaseFunctions[0];
    if (databaseFunction) {
      if (databaseFunction.execution_mode === 'script') {
        if (!readString(databaseFunction.source_code)) {
          throw new Error(`数据库页面函数 "${name}" 未配置 source_code。`);
        }
        return {
          kind: 'database-script' as const,
          definition: databaseFunction,
        };
      }

      const nativeFunction = resolveBuiltinLowCodePageFunction(props.page.page_type, name);
      const expectedHandler = nativeFunction ? `builtin.${nativeFunction.id}` : '';
      if (!nativeFunction || databaseFunction.native_handler !== expectedHandler) {
        throw new Error(`数据库页面函数 "${name}" 的 native_handler 未注册。`);
      }
      return {
        kind: 'database-native' as const,
        pageFunction: nativeFunction,
        definition: databaseFunction,
      };
    }

    const pageFunction = props.page.schema.functions?.find((item) => item.name === name && item.enabled !== false);
    if (pageFunction) return { kind: 'schema' as const, pageFunction };

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
    const { flattenPageBlocks, getDataSource, props, runtime } = this.dependencies;
    const matchingGrid = Object.values(runtime.state.grids).find((grid) => {
      if (!grid.sourceKey) return false;
      return rows.some((row) => grid.rows.some((candidate) => Object.is(candidate[grid.rowKey], row[grid.rowKey])));
    });
    if (matchingGrid?.sourceKey) return getDataSource(matchingGrid.sourceKey);

    const sourceKey = readString(isRecord(rows[0]) ? rows[0].sourceKey : undefined);
    if (sourceKey) return getDataSource(sourceKey);

    const formSource = flattenPageBlocks(props.page.schema)
      .filter((block): block is LowCodePageFormBlock => block.kind === 'form')
      .map((block) => getDataSource(block.id))
      .find((source) => Boolean(source?.saveMethod));
    return formSource ?? Object.values(props.page.schema.dataSources ?? {})
      .find((source) => Boolean(source.saveMethod));
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
    const viewName = readString(source.viewName);
    const writeTableName = source.sourceType === 'view'
      ? readString(source.tableName ?? source.table_name) === viewName
        ? ''
        : readString(source.tableName ?? source.table_name)
      : '';
    return Promise.all(
      rows.map((row) => {
        const id = row[rowKey];
        if (typeof id === 'undefined' || id === null || id === '') {
          throw new Error('选中数据缺少主键，无法保存。');
        }
        return host.getServiceApi().invoke(serviceName, serviceMethod, {
          ...resolveRuntimePostData(source.postData),
          ...(writeTableName ? { tableName: writeTableName } : {}),
          resource: readString(
            source.postData?.resource,
            writeTableName || readString(source.tableName ?? source.table_name),
          ),
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
    const viewName = readString(source.viewName);
    const writeTableName = source.sourceType === 'view'
      ? readString(source.tableName ?? source.table_name) === viewName
        ? ''
        : readString(source.tableName ?? source.table_name)
      : '';
    const postData = {
      ...resolveRuntimePostData(source.postData),
      ...(writeTableName ? { tableName: writeTableName } : {}),
      resource: readString(
        source.postData?.resource,
        writeTableName || readString(source.tableName ?? source.table_name),
      )
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
      pageCode: props.page.code,
      serviceApi: host.getServiceApi(),
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
    if (resolvedFunction.kind === 'database-native') {
      return resolvedFunction.pageFunction.execute(this.createBuiltinPageFunctionContext(args, event));
    }
    const pageFunctionName = resolvedFunction.kind === 'database-script'
      ? resolvedFunction.definition.function_name
      : resolvedFunction.pageFunction.name;
    const callStack = Array.isArray(event.payload?.pageFunctionStack)
      ? event.payload.pageFunctionStack.filter((item): item is string => typeof item === 'string' && Boolean(item))
      : [];
    if (callStack.length >= MAX_PAGE_FUNCTION_CALL_DEPTH) {
      throw new Error(`页面函数调用深度不能超过 ${MAX_PAGE_FUNCTION_CALL_DEPTH} 层。`);
    }
    if (callStack.includes(pageFunctionName)) {
      throw new Error(`页面函数 "${pageFunctionName}" 不允许递归调用。`);
    }
    const functionEvent: LowCodeRuntimeEvent = {
      name: `pageFunction.${pageFunctionName}`,
      blockId: event.blockId,
      blockKind: event.blockKind,
      timestamp: Date.now(),
      payload: {
        args,
        callerEvent: this.sanitizeScriptEventPayload(event.payload),
        pageFunctionStack: [...callStack, pageFunctionName],
        ...(resolvedFunction.kind === 'database-script'
          ? {
            runtimeFunction: {
              runtimeKey: resolvedFunction.definition.runtime_key,
              capabilities: resolvedFunction.definition.capabilities,
            },
          }
          : {})
      }
    };
    if (resolvedFunction.kind === 'database-script') {
      const selectedRows = this.getBuiltinSelectedRows();
      const formRecords = this.getBuiltinFormRecords();
      const databaseFunctionEvent: LowCodeRuntimeEvent = {
        ...functionEvent,
        payload: {
          ...(functionEvent.payload ?? {}),
          selectedRows,
          formRecords,
          runtimeSpec: cloneRuntimeValue(resolvedFunction.definition.runtime_spec ?? {}),
        },
      };
      const scriptResult = await this.executeIsolatedScript(
        this.createDatabasePageFunctionScript(resolvedFunction.definition.source_code),
        databaseFunctionEvent,
        'function',
      );
      const runtimeValue = scriptResult.value;
      if (!isRecord(runtimeValue)) return runtimeValue;
      if (
        !('effects' in runtimeValue) &&
        !('resultEffect' in runtimeValue) &&
        !('value' in runtimeValue)
      ) {
        return runtimeValue;
      }
      const runtimeResult: LowCodeRuntimeResult = {
        value: 'value' in runtimeValue ? runtimeValue.value : undefined,
        effects: Array.isArray(runtimeValue.effects)
          ? runtimeValue.effects.filter(isRecord).map((effect) => ({
            ...effect,
            type: typeof effect.type === 'string' ? effect.type : '',
          })) as LowCodeRuntimeResult['effects']
          : [],
        ...(typeof runtimeValue.resultEffect === 'number'
          ? { resultEffect: runtimeValue.resultEffect }
          : {}),
      };
      return applyLowCodeRuntimeEffects(
        runtimeResult,
        this.createBuiltinPageFunctionContext(args, databaseFunctionEvent),
      );
    }
    const pageFunction = resolvedFunction.pageFunction;
    const result = await this.executeIsolatedScript(pageFunction.script, functionEvent);
    return result.value;
  }

  private createDatabasePageFunctionScript(sourceCode: string) {
    return `(async function executeDatabasePageFunction() {
  "use strict";
  ${sourceCode}
  if (typeof main !== "function") {
    throw new TypeError("数据库页面函数 source_code 必须定义 main。");
  }
  return await main.call(this, {
    args: this.event.args || {},
    context: this.context,
    event: this.event,
    runtimeSpec: this.event.runtimeSpec || {},
  });
})`;
  }

  private createPrimaryScriptExecutors() {
    return new ScriptExecutorRegistry([
      new NodeActionExecutor((options) => this.executeScriptNodeAction(options)),
      new PageFunctionExecutor((options, context) => this.executePageFunction(options, context.event)),
      new HttpExecutor((options) => this.executeScriptHttp(options))
    ]);
  }

  private async handleScriptCapability(
    request: LowCodeScriptCapabilityRequest,
    context: LowCodeScriptContextSnapshot,
    event: LowCodeRuntimeEvent
  ) {
    const allowedCapabilities = context.policy?.capabilities;
    if (
      Array.isArray(allowedCapabilities) &&
      !allowedCapabilities.includes(request.name)
    ) {
      throw new Error(`脚本能力 "${request.name}" 未注册或当前页面策略不允许调用。`);
    }

    if (request.name === 'api.invoke') {
      const apiName = this.readScriptStringArg(request.args, 0, 'apiName');
      const payload = this.readScriptRecordArg(request.args, 1);
      return invokeRegisteredLowCodeScriptApi(apiName, payload, context);
    }

    if (this.primaryScriptExecutors.has(request.name)) {
      return this.primaryScriptExecutors.execute(request, {
        event,
        scriptContext: context
      });
    }

    throw new Error(`脚本能力 "${request.name}" 未注册。`);
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
