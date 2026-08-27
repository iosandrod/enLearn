import type { LowCodeHostRuntime } from '../core/host';
import { resolveGridRows } from '../lowcode/block-materials/helpers';
import type {
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageRecord,
  LowCodePageSearchFormBlock,
  LowCodeRuntimeEvent,
} from '../types/lowcode';
import { ensureLowCodeEditPage } from './lowcode-pages';
import { resolveLowCodeDataSourceNodeAction } from './node-action-registry';
import { lowCodeOptionSourceRegistry } from './option-source-registry';
import type {
  LowCodePageRuntimeContext,
  LowCodePageRuntimeGridState,
} from './page-runtime';
import { resolveLowCodeEditPageMode } from './edit-page-mode';
import type { BuiltinLowCodePageFunctionMode } from './page-function';
import type { LowCodeScriptExecutionMode } from './scripts';
import type { LowCodePageRendererProps } from './renderer-types';
import {
  appendRouteQuery,
  cloneRuntimeValue,
  isRecord,
  readString,
} from './renderer-value-utils';
import {
  buildLowCodeGridDetailSubmission,
  normalizeLowCodeGridDetailConfig,
} from './grid-detail-submission';

type ValueRef<T> = { value: T };
type DataSourceRequest = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
};

type RefreshDataSourceOptions = {
  ordered?: boolean;
  strict?: boolean;
};

type GridInteractionStates = Record<
  string,
  Pick<
    LowCodePageRuntimeGridState,
    'currentRow' | 'selectedRows' | 'contextRow' | 'currentCell'
  >
>;

export type PageDataControllerDependencies = {
  props: LowCodePageRendererProps;
  host: LowCodeHostRuntime;
  runtime: LowCodePageRuntimeContext;
  resolvedData: ValueRef<Record<string, unknown>>;
  formModels: ValueRef<Record<string, Record<string, unknown>>>;
  searchFilters: ValueRef<Record<string, Record<string, unknown>>>;
  loadingBlockId: ValueRef<string>;
  message: ValueRef<string>;
  messageClass: ValueRef<string>;
  builtinPageFunctionMode: ValueRef<BuiltinLowCodePageFunctionMode>;
  formBaselines: Record<string, Record<string, unknown>>;
  sourceRequestVersions: Map<string, number>;
  getDataSource(key?: string): LowCodePageDataSource | undefined;
  getGridRowKey(block: LowCodePageGridBlock): string;
  flattenPageBlocks(schema?: LowCodePageRecord['schema']): LowCodePageBlock[];
  findRuntimeBlock(blockId: string): LowCodePageBlock | undefined;
  resolveDataSourceRequest(
    key: string,
    source: LowCodePageDataSource,
    postData?: Record<string, unknown>,
    includeSearchFilters?: boolean,
  ): DataSourceRequest;
  resolveDataSourcePostData(
    key: string,
    source: LowCodePageDataSource,
  ): Record<string, unknown>;
  resolveRuntimeRoute(path: string, row?: Record<string, unknown>): string;
  shouldReturnEmptyForUnavailableList(error: unknown, serviceMethod: string): boolean;
  isListItemsRequest(serviceName: string, serviceMethod: string): boolean;
  executeNodeAction(options: Record<string, unknown>): Promise<unknown>;
  executeIsolatedScript(
    script: string,
    event: LowCodeRuntimeEvent,
    executionMode?: LowCodeScriptExecutionMode,
  ): Promise<{ value: unknown }>;
  reportRuntimeDirectiveError(error: unknown): void;
  publishRuntimeEvent(event: LowCodeRuntimeEvent): Promise<void>;
};

/** Owns data-source concurrency, form persistence, grid hydration, and page loading. */
export class PageDataController {
  private sourceRequestSequence = 0;
  private runtimePageId = '';
  private lastSavedFormRecord: Record<string, unknown> | undefined;

  constructor(private readonly dependencies: PageDataControllerDependencies) {}

  readonly findLowCodePage = async (filters: Record<string, unknown>) => {
    const pages = await this.dependencies.host.getServiceApi().invoke<LowCodePageRecord[]>('lowcode', 'listItems', {
      tableName: 'lowcode_pages',
      filters,
      includeData: false,
      limit: 1,
    });
    return Array.isArray(pages) ? pages[0] : undefined;
  }

  private readonly resolveAssociatedEditPage = async () => {
    if (this.dependencies.props.page.page_type === 'list') {
      return ensureLowCodeEditPage(this.dependencies.host.getServiceApi(), this.dependencies.props.page);
    }

    const editPageId = readString(this.dependencies.props.page.edit_page_id);
    if (editPageId) return this.findLowCodePage({ id: editPageId });
    return this.findLowCodePage({ code: `${this.dependencies.props.page.code}-edit` });
  }

  readonly resolveEditPageRoute = async (
    row: Record<string, unknown> = {},
    rowKey = 'id',
  ) => {
    const editPage = await this.resolveAssociatedEditPage();
    const route = readString(editPage?.route);
    if (!route) return '';

    const resolvedRoute = this.dependencies.resolveRuntimeRoute(route, row);
    const rowValue = row[rowKey];

    return appendRouteQuery(resolvedRoute, {
      fromPage: this.dependencies.props.page.code,
      ...(typeof rowValue !== 'undefined' && rowValue !== null && rowValue !== ''
        ? { [rowKey]: rowValue }
        : {}),
    });
  }

  readonly resolveLinkedEditPageRoute = async (
    block: LowCodePageGridBlock,
    row: Record<string, unknown>
  ) => {
    return this.resolveEditPageRoute(row, this.dependencies.getGridRowKey(block));
  }

  private readonly invokeDataSource = async (
    key: string,
    source: LowCodePageDataSource,
    force = false
  ) => {
    if (!force && source.autoLoad === false) {
      return [key, undefined] as const;
    }

    const { serviceName, serviceMethod, postData } = this.dependencies.resolveDataSourceRequest(key, source);

    if (!serviceName || !serviceMethod) {
      throw new Error(`Data source ${key} is missing serviceName or serviceMethod.`);
    }

    let data: unknown;

    try {
      data = await this.dependencies.host.getServiceApi().invoke(
        serviceName,
        serviceMethod,
        postData
      );
    } catch (error) {
      if (this.dependencies.shouldReturnEmptyForUnavailableList(error, source.serviceMethod ?? serviceMethod)) {
        data = [];
      } else {
        console.error(`[LowCode Runtime] 数据源 ${key} 加载失败`, error);
        throw error;
      }
    }

    return [key, data] as const;
  }

  readonly beginSourceRequest = (key: string) => {
    const version = ++this.sourceRequestSequence;
    this.dependencies.sourceRequestVersions.set(key, version);
    this.dependencies.runtime.setSourceLoading(key, true);
    return version;
  }

  readonly isCurrentSourceRequest = (key: string, version: number) => {
    return this.dependencies.sourceRequestVersions.get(key) === version;
  }

  readonly finishSourceRequest = (key: string, version: number) => {
    if (!this.isCurrentSourceRequest(key, version)) return;
    this.dependencies.runtime.setSourceLoading(key, false);
  }

  private readonly invalidateSourceRequests = () => {
    this.dependencies.sourceRequestVersions.clear();
  }

  private readonly collectConfiguredDataSources = (
    schema: LowCodePageRecord['schema'],
    pageBlocks = this.dependencies.flattenPageBlocks(schema),
  ) => {
    const sources: Record<string, LowCodePageDataSource> = {
      ...(schema.dataSources ?? {}),
    };

    pageBlocks.forEach((block) => {
      if (block.kind !== 'form' || !isRecord(block.dataSource)) return;
      sources[block.id] = {
        ...block.dataSource,
        key: block.id,
      };
    });

    return sources;
  }

  private readonly getFormSourceKey = (block: LowCodePageFormBlock) => block.id;

  readonly refreshDataSources = async (
    sourceKeys: string[] = [],
    options: RefreshDataSourceOptions = {},
  ) => {
    const allEntries = Object.entries(this.collectConfiguredDataSources(this.dependencies.props.page.schema));
    const uniqueSourceKeys = [...new Set(sourceKeys)];
    const entries = uniqueSourceKeys.length
      ? uniqueSourceKeys
        .map((key) => {
          const source = this.dependencies.getDataSource(key);
          return source ? ([key, source] as const) : undefined;
        })
        .filter((entry): entry is readonly [string, LowCodePageDataSource] => Boolean(entry))
      : allEntries;
    const pageBlocks = this.dependencies.flattenPageBlocks(this.dependencies.props.page.schema);
    const refreshEntry = async ([key, source]: readonly [string, LowCodePageDataSource]) => {
      const nodeAction = resolveLowCodeDataSourceNodeAction(
        pageBlocks,
        key,
        this.dependencies.props.page.node_actions,
      );
      if (nodeAction) {
        try {
          await this.dependencies.executeNodeAction({
            node: nodeAction.block.id,
            method: nodeAction.action.method,
          });
          return '';
        } catch (error) {
          console.error(`[LowCode Runtime] 数据源 ${key} 刷新失败`, error);
          return `${key}: ${error instanceof Error ? error.message : this.dependencies.host.t('runtime.errors.refreshDataSource')}`;
        }
      }

      const version = this.beginSourceRequest(key);
      this.dependencies.runtime.setSource(key, undefined);

      try {
        const [resolvedKey, value] = await this.invokeDataSource(key, source, true);
        if (!this.isCurrentSourceRequest(key, version)) return '';
        if (typeof value !== 'undefined') {
          this.dependencies.runtime.setSource(resolvedKey, value, { resetGridBaseline: true });
        }
        return '';
      } catch (error) {
        if (!this.isCurrentSourceRequest(key, version)) return '';
        console.error(`[LowCode Runtime] 数据源 ${key} 刷新失败`, error);
        return `${key}: ${error instanceof Error ? error.message : this.dependencies.host.t('runtime.errors.refreshDataSource')}`;
      } finally {
        this.finishSourceRequest(key, version);
      }
    };
    const errors: string[] = [];
    if (options.ordered) {
      for (const entry of entries) {
        const error = await refreshEntry(entry);
        if (error) {
          errors.push(error);
          if (options.strict) break;
        }
      }
    } else {
      errors.push(...(await Promise.all(entries.map(refreshEntry))).filter(Boolean));
    }

    if (errors.length) {
      this.dependencies.message.value = errors[0];
      this.dependencies.messageClass.value = 'lc-error';
    }

    this.syncPageGridStates();

    if (errors.length && options.strict) throw new Error(errors[0]);
    return errors;
  }

  private readonly uniqueStrings = (values: unknown[]) => {
    return [...new Set(values
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter(Boolean))];
  }

  readonly refreshFormNodeOptions = async (
    blockId: string,
    options: { codes?: string[]; sourceKeys?: string[] } = {},
  ) => {
    const block = this.dependencies.findRuntimeBlock(blockId);
    if (!block || (block.kind !== 'form' && block.kind !== 'searchForm')) {
      throw new Error(`页面表单节点 "${blockId}" 不存在。`);
    }

    const configuredCodes = this.uniqueStrings(
      block.schema.fields.map((field) => field.optionsCode),
    );
    const configuredSourceKeys = this.uniqueStrings(
      block.schema.fields.map((field) => field.optionsSourceKey),
    );
    const codes = Array.isArray(options.codes)
      ? this.uniqueStrings(options.codes).filter((code) => configuredCodes.includes(code))
      : configuredCodes;
    const sourceKeys = Array.isArray(options.sourceKeys)
      ? this.uniqueStrings(options.sourceKeys).filter((key) => configuredSourceKeys.includes(key))
      : configuredSourceKeys;

    if (codes.length) {
      await lowCodeOptionSourceRegistry.refresh(codes, () => this.dependencies.host.getServiceApi());
    }
    if (sourceKeys.length) {
      const errors = await this.refreshDataSources(sourceKeys);
      if (errors.length) throw new Error(errors[0]);
    }

    return { codes, sourceKeys };
  }

  readonly cloneScriptValue = <T>(value: T, fallback: T): T => {
    try {
      const serialized = JSON.stringify(value);
      return typeof serialized === 'string' ? JSON.parse(serialized) as T : fallback;
    } catch {
      return fallback;
    }
  }

  private readonly initializePageGridStates = (blocks: LowCodePageBlock[]) => {
    const gridBlocks = blocks.filter(
      (block): block is LowCodePageGridBlock => block.kind === 'grid'
    );
    const gridIds = new Set(gridBlocks.map((block) => block.id));

    Object.keys(this.dependencies.runtime.state.grids).forEach((blockId) => {
      if (!gridIds.has(blockId)) delete this.dependencies.runtime.state.grids[blockId];
    });

    gridBlocks.forEach((block) => {
      const grid = this.dependencies.runtime.ensureGrid(block.id, {
        sourceKey: block.sourceKey,
        rowKey: this.dependencies.getGridRowKey(block),
      });
      if (!block.sourceKey && !this.dependencies.runtime.isGridInitialized(block.id) && Array.isArray(block.rows)) {
        this.dependencies.runtime.setGridRows(block.id, block.rows.filter(isRecord), {
          rowKey: this.dependencies.getGridRowKey(block),
        });
      }
    });
  }

  readonly syncPageGridStates = (
    schema: LowCodePageRecord['schema'] = this.dependencies.props.page.schema,
  ) => {
    const blocks = this.dependencies.flattenPageBlocks(schema);
    this.initializePageGridStates(blocks);

    blocks.forEach((block) => {
      if (block.kind !== 'grid') return;
      if (!block.sourceKey && this.dependencies.runtime.isGridInitialized(block.id)) return;
      this.dependencies.runtime.setGridRows(
        block.id,
        resolveGridRows(block, this.dependencies.resolvedData.value, this.dependencies.searchFilters.value),
        {
          sourceKey: block.sourceKey,
          rowKey: this.dependencies.getGridRowKey(block),
        }
      );
    });
  }

  readonly refreshGridChangeSets = () => {
    Object.keys(this.dependencies.runtime.state.grids).forEach((blockId) => {
      this.dependencies.runtime.getGridChanges(blockId);
    });
  }

  private readonly captureGridInteractionState = (): GridInteractionStates => {
    return Object.fromEntries(
      Object.entries(this.dependencies.runtime.state.grids).map(([blockId, grid]) => [
        blockId,
        {
          currentRow: grid.currentRow,
          selectedRows: [...grid.selectedRows],
          contextRow: grid.contextRow,
          currentCell: grid.currentCell
            ? { row: grid.currentCell.row, field: grid.currentCell.field }
            : null,
        },
      ])
    );
  }

  private readonly restoreGridInteractionState = (
    states: GridInteractionStates,
  ) => {
    Object.entries(states).forEach(([blockId, state]) => {
      if (!this.dependencies.runtime.state.grids[blockId]) return;
      this.dependencies.runtime.setGridCurrentRow(blockId, state.currentRow);
      this.dependencies.runtime.setGridSelectedRows(blockId, state.selectedRows);
      this.dependencies.runtime.setGridContextRow(blockId, state.contextRow);
      this.dependencies.runtime.setGridCurrentCell(blockId, state.currentCell);
    });
  }

  private readonly deriveStaticFormModel = (
    block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
    row?: Record<string, unknown>
  ) => {
    return this.mergeFormModelValues(block.initialValues ?? {}, row ?? {});
  }

  private readonly hasPersistedFormRecord = (row?: Record<string, unknown>) => {
    if (!row) return false;
    const recordId = row.id;
    return recordId !== undefined && recordId !== null && String(recordId).trim() !== '';
  }

  private readonly resolveFormDynamicDefaults = async (
    block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
    model: Record<string, unknown>,
    options: { skipAllocatingDefaults?: boolean } = {},
  ) => {
    const nextModel = cloneRuntimeValue(model);
    for (const field of block.schema.fields) {
      if (field.field in nextModel) continue;

      const defaultValueType = readString(field.defaultValueType);
      const defaultValueScript = readString(field.defaultValueScript);
      const defaultValueProcedure = readString(field.defaultValueProcedure);
      if (
        options.skipAllocatingDefaults &&
        defaultValueType === 'procedure' &&
        defaultValueProcedure === 'public.generate_document_number'
      ) continue;
      if (
        (defaultValueType !== 'function' || !defaultValueScript) &&
        (defaultValueType !== 'procedure' || !defaultValueProcedure)
      ) continue;

      const event: LowCodeRuntimeEvent = {
        name: 'form.fieldDefaultValue',
        blockId: block.id,
        blockKind: block.kind,
        timestamp: Date.now(),
        payload: {
          field: field.field,
          values: cloneRuntimeValue(nextModel),
        },
      };
      try {
        const value = defaultValueType === 'procedure'
          ? await this.dependencies.host.getServiceApi().invoke('lowcode', 'executeDefaultValueProcedure', {
            procedure: defaultValueProcedure,
            blockId: block.id,
            field: field.field,
            values: cloneRuntimeValue(nextModel),
          })
          : (await this.dependencies.executeIsolatedScript(defaultValueScript, event, 'function')).value;
        if (typeof value !== 'undefined') nextModel[field.field] = cloneRuntimeValue(value);
      } catch (error) {
        this.dependencies.reportRuntimeDirectiveError(error);
      }
    }
    return nextModel;
  }

  readonly deriveFormModel = async (
    block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
    row?: Record<string, unknown>,
  ) => {
    return this.resolveFormDynamicDefaults(
      block,
      this.deriveStaticFormModel(block, row),
      {
        skipAllocatingDefaults:
          this.hasPersistedFormRecord(row) ||
          (this.dependencies.props.page.page_type === 'edit' && this.dependencies.builtinPageFunctionMode.value !== 'add'),
      },
    );
  }

  readonly deriveNewFormModel = async (
    block: LowCodePageFormBlock,
    mode: 'create' | 'copy',
    current: Record<string, unknown>,
  ) => {
    const primaryKeys = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by']);
    const stateFields: Record<string, unknown> = {
      status: 'draft',
    };
    const values = mode === 'copy'
      ? cloneRuntimeValue(current)
      : cloneRuntimeValue(block.initialValues ?? {});

    primaryKeys.forEach((field) => {
      if (field === 'id') values[field] = '';
      else delete values[field];
    });
    Object.entries(stateFields).forEach(([field, value]) => {
      if (field in values || field in current) values[field] = value;
    });
    for (const field of block.schema.fields) {
      if (field.defaultValueType === 'function' || field.defaultValueType === 'procedure') {
        delete values[field.field];
      }
    }

    return this.resolveFormDynamicDefaults(block, values);
  }

  private readonly resolveGridDynamicDefaults = async (block: LowCodePageGridBlock) => {
    const columns = block.schema.grid.columns ?? [];
    const dynamicColumns = columns.filter((column) => {
      const params = isRecord(column.params) ? column.params : {};
      const field = isRecord(params.lowcodeField) ? params.lowcodeField : {};
      const type = readString(field.defaultValueType);
      return Boolean(
        column.field &&
        (type === 'function' || type === 'procedure') &&
        (readString(field.defaultValueScript) || readString(field.defaultValueProcedure))
      );
    });
    if (!dynamicColumns.length) return;

    for (const column of dynamicColumns) {
      const params = isRecord(column.params) ? column.params : {};
      const field = isRecord(params.lowcodeField) ? params.lowcodeField : {};
      const defaultValueType = readString(field.defaultValueType);
      const defaultValueScript = readString(field.defaultValueScript);
      const defaultValueProcedure = readString(field.defaultValueProcedure);
      const event: LowCodeRuntimeEvent = {
        name: 'grid.fieldDefaultValue',
        blockId: block.id,
        blockKind: block.kind,
        timestamp: Date.now(),
        payload: {
          field: column.field,
          values: {},
        },
      };

      try {
        const value = defaultValueType === 'procedure'
          ? await this.dependencies.host.getServiceApi().invoke('lowcode', 'executeDefaultValueProcedure', {
            procedure: defaultValueProcedure,
            blockId: block.id,
            field: column.field,
            values: {},
          })
          : (await this.dependencies.executeIsolatedScript(defaultValueScript, event, 'function')).value;
        const editRender = isRecord(column.editRender) ? column.editRender : {};
        if (typeof value === 'undefined') delete editRender.defaultValue;
        else editRender.defaultValue = cloneRuntimeValue(value);
        column.editRender = editRender;
      } catch (error) {
        this.dependencies.reportRuntimeDirectiveError(error);
      }
    }
  }

  readonly mergeFormModelValues = (
    defaults: Record<string, unknown>,
    values: Record<string, unknown>
  ) => {
    const nextModel = cloneRuntimeValue(defaults);

    for (const [key, value] of Object.entries(values)) {
      const defaultValue = nextModel[key];
      nextModel[key] = isRecord(defaultValue) && isRecord(value)
        ? this.mergeFormModelValues(defaultValue, value)
        : cloneRuntimeValue(value);
    }

    return nextModel;
  }

  private readonly runtimeValuesEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;

    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every(
        (item, index) => this.runtimeValuesEqual(item, right[index])
      );
    }

    if (isRecord(left) && isRecord(right)) {
      const leftKeys = Object.keys(left);
      const rightKeys = Object.keys(right);
      return leftKeys.length === rightKeys.length && leftKeys.every(
        (key) => key in right && this.runtimeValuesEqual(left[key], right[key])
      );
    }

    return false;
  }

  private readonly mergeChangedFormValue = (
    target: unknown,
    baseline: unknown,
    current: unknown
  ): { changed: boolean; value: unknown } => {
    if (this.runtimeValuesEqual(baseline, current)) {
      return { changed: false, value: target };
    }

    if (isRecord(baseline) && isRecord(current)) {
      const value = isRecord(target) ? cloneRuntimeValue(target) : {};
      let changed = false;

      for (const key of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
        if (!(key in current)) {
          delete value[key];
          changed = true;
          continue;
        }

        const merged = this.mergeChangedFormValue(value[key], baseline[key], current[key]);
        if (!merged.changed) continue;
        value[key] = merged.value;
        changed = true;
      }

      return { changed, value };
    }

    return { changed: true, value: cloneRuntimeValue(current) };
  }

  readonly captureFormBaselines = () => {
    Object.keys(this.dependencies.formBaselines).forEach((blockId) => delete this.dependencies.formBaselines[blockId]);
    Object.entries(this.dependencies.formModels.value).forEach(([blockId, values]) => {
      this.dependencies.formBaselines[blockId] = cloneRuntimeValue(values);
    });
  }

  private readonly readDataSourceRecord = (sourceKey: string) => {
    const sourceValue = this.dependencies.resolvedData.value[sourceKey];
    if (Array.isArray(sourceValue)) return isRecord(sourceValue[0]) ? sourceValue[0] : undefined;
    if (isRecord(sourceValue) && Array.isArray(sourceValue.rows)) {
      return isRecord(sourceValue.rows[0]) ? sourceValue.rows[0] : undefined;
    }
    return isRecord(sourceValue) ? sourceValue : undefined;
  }

  readonly collectFormSubmissionGroups = () => {
    const groups = new Map<string, LowCodePageFormBlock[]>();

    for (const block of this.dependencies.flattenPageBlocks(this.dependencies.props.page.schema)) {
      if (block.kind !== 'form') continue;
      const sourceKey = this.getFormSourceKey(block);
      if (!this.dependencies.getDataSource(sourceKey)?.saveMethod) continue;
      groups.set(sourceKey, [...(groups.get(sourceKey) ?? []), block]);
    }

    return groups;
  }

  private readonly collectGridDetailSubmissionGroups = (
    formGroups: Map<string, LowCodePageFormBlock[]>,
  ) => {
    const groups = new Map<string, LowCodePageGridBlock[]>();

    for (const block of this.dependencies.flattenPageBlocks(this.dependencies.props.page.schema)) {
      if (block.kind !== 'grid' || !isRecord(block.schema.detailConfig)) continue;
      if (block.schema.detailConfig.enabled === false) continue;

      const source = this.dependencies.getDataSource(block.sourceKey);
      const config = normalizeLowCodeGridDetailConfig(block.schema.detailConfig, source);
      if (!config) {
        throw new Error(`子表“${block.title ?? block.id}”缺少主表数据源、子表资源或关联外键。`);
      }
      if (!formGroups.has(config.parentSourceKey)) {
        throw new Error(
          `子表“${block.title ?? block.id}”关联的主表数据源“${config.parentSourceKey}”没有可保存表单。`,
        );
      }
      groups.set(config.parentSourceKey, [
        ...(groups.get(config.parentSourceKey) ?? []),
        block,
      ]);
    }

    return groups;
  }

  private readonly validateSubmissionBlocks = async (
    formGroups: Map<string, LowCodePageFormBlock[]>,
    detailGroups: Map<string, LowCodePageGridBlock[]>,
  ) => {
    for (const blocks of formGroups.values()) {
      for (const block of blocks) {
        const controller = this.dependencies.runtime.getFormController(block.id);
        if (controller && !(await controller.validate())) return false;
      }
    }

    for (const blocks of detailGroups.values()) {
      for (const block of blocks) {
        const controller = this.dependencies.runtime.getGridController(block.id);
        if (controller && !(await controller.validate())) return false;
      }
    }

    return true;
  }

  private readonly buildGridDetailSubmissions = (
    blocks: LowCodePageGridBlock[],
  ) => {
    const creating =
      this.dependencies.props.page.page_type === 'edit' &&
      this.dependencies.builtinPageFunctionMode.value === 'add';

    return blocks.map((block) => {
      const grid = this.dependencies.runtime.state.grids[block.id];
      const source = this.dependencies.getDataSource(block.sourceKey);
      const submission = buildLowCodeGridDetailSubmission({
        block,
        source,
        rows: grid?.rows ?? [],
        changes: this.dependencies.runtime.getGridChanges(block.id),
        creating,
      });
      if (!submission) {
        throw new Error(`子表“${block.title ?? block.id}”配置无效。`);
      }
      return submission;
    });
  }

  private readonly buildFormSubmissionValues = (
    sourceKey: string,
    blocks: LowCodePageFormBlock[]
  ) => {
    const isCreating =
      this.dependencies.props.page.page_type === 'edit' && this.dependencies.builtinPageFunctionMode.value === 'add';
    if (isCreating) {
      return blocks.reduce<Record<string, unknown>>((values, block) => ({
        ...values,
        ...cloneRuntimeValue(this.dependencies.formModels.value[block.id] ?? block.initialValues ?? {}),
      }), {});
    }

    const sourceRecord = this.readDataSourceRecord(sourceKey);
    const values = sourceRecord ? cloneRuntimeValue(sourceRecord) : {};

    for (const block of blocks) {
      const current = this.dependencies.formModels.value[block.id] ?? {};
      const baseline = this.dependencies.formBaselines[block.id] ?? {};

      for (const field of block.schema.fields) {
        const fieldName = readString(field.field);
        if (!fieldName || fieldName in values) continue;
        if (fieldName in baseline) values[fieldName] = cloneRuntimeValue(baseline[fieldName]);
        else if (fieldName in current) values[fieldName] = cloneRuntimeValue(current[fieldName]);
      }
    }

    for (const block of blocks) {
      const current = this.dependencies.formModels.value[block.id] ?? {};
      const baseline = this.dependencies.formBaselines[block.id] ?? {};

      for (const field of block.schema.fields) {
        const fieldName = readString(field.field);
        if (!fieldName || !(fieldName in current)) continue;
        const merged = this.mergeChangedFormValue(
          values[fieldName],
          baseline[fieldName],
          current[fieldName]
        );
        if (merged.changed) values[fieldName] = merged.value;
      }
    }

    return values;
  }

  readonly saveFormSource = async (
    sourceKey: string,
    values: Record<string, unknown>
  ) => {
    const source = this.dependencies.getDataSource(sourceKey);
    if (!source) throw new Error(`Data source ${sourceKey} is unavailable.`);

    const request = this.dependencies.resolveDataSourceRequest(source.key, source);
    const serviceName = request.serviceName;
    const serviceMethod = source.saveMethod ?? request.serviceMethod;

    if (!serviceName || !serviceMethod || (!source.saveMethod && this.dependencies.isListItemsRequest(serviceName, serviceMethod))) {
      throw new Error(`Data source ${source.key} is missing save service.`);
    }

    return this.dependencies.host.getServiceApi().invoke(serviceName, serviceMethod, {
      ...request.postData,
      ...values,
    });
  }

  private readonly readSavedRecord = (value: unknown): Record<string, unknown> | undefined => {
    if (isRecord(value)) {
      if (isRecord(value.data)) return value.data;
      if (Array.isArray(value.rows) && isRecord(value.rows[0])) return value.rows[0];
      if (Array.isArray(value.items) && isRecord(value.items[0])) return value.items[0];
      if (isRecord(value.saved)) return value.saved;
      return value;
    }
    if (Array.isArray(value) && isRecord(value[0])) return value[0];
    return undefined;
  }

  readonly readRouteQueryWithoutRecordId = () => {
    const query = this.dependencies.host.getRoute().query ?? {};
    return Object.fromEntries(
      Object.entries(query).filter(([key]) => key !== 'id'),
    );
  }

  readonly readSavedRecordId = (
    saved: Record<string, unknown> | undefined,
    groups: Map<string, LowCodePageFormBlock[]>,
  ) => {
    const savedId = readString(saved?.id);
    if (savedId) return savedId;

    for (const [sourceKey, blocks] of groups) {
      const values = this.buildFormSubmissionValues(sourceKey, blocks);
      const id = readString(values.id);
      if (id) return id;
    }
    return '';
  }

  readonly submitForms = async (options: { reload?: boolean } = {}) => {
    await this.commitPendingFormValues();
    const groups = this.collectFormSubmissionGroups();
    if (!groups.size) return true;

    this.dependencies.message.value = '';
    this.lastSavedFormRecord = undefined;

    try {
      const detailGroups = this.collectGridDetailSubmissionGroups(groups);
      if (!(await this.validateSubmissionBlocks(groups, detailGroups))) {
        throw new Error('请检查表单和子表中的必填项。');
      }

      for (const [sourceKey, blocks] of groups) {
        this.dependencies.loadingBlockId.value = blocks[0]?.id ?? '';
        const values = this.buildFormSubmissionValues(sourceKey, blocks);
        const details = this.buildGridDetailSubmissions(detailGroups.get(sourceKey) ?? []);
        if (details.length) values.__details = details;
        const saved = await this.saveFormSource(
          sourceKey,
          values,
        );
        if (!this.lastSavedFormRecord) this.lastSavedFormRecord = this.readSavedRecord(saved);
      }

      if (options.reload !== false) {
        await this.loadPageData(this.dependencies.props.page);
      }
      await this.dependencies.publishRuntimeEvent({
        name: 'form.saved',
        blockKind: 'form',
        timestamp: Date.now(),
        payload: {
          sourceKeys: Array.from(groups.keys()),
        },
      });
      this.dependencies.message.value = this.dependencies.host.t('runtime.form.saved');
      this.dependencies.messageClass.value = 'lc-help';
      return true;
    } catch (error) {
      console.error('[LowCode Runtime] 表单保存失败', error);
      this.dependencies.message.value =
        error instanceof Error ? error.message : this.dependencies.host.t('runtime.form.submitFailed');
      this.dependencies.messageClass.value = 'lc-error';
      return false;
    } finally {
      this.dependencies.loadingBlockId.value = '';
    }
  }

  readonly commitPendingFormValues = async () => {
    const pendingCommits = this.dependencies.flattenPageBlocks(this.dependencies.props.page.schema)
      .filter((block): block is LowCodePageFormBlock => block.kind === 'form')
      .map((block) => this.dependencies.runtime.getFormController(block.id)?.commitPendingValues?.())
      .filter((value): value is Promise<void> | void => typeof value !== 'undefined');

    await Promise.all(pendingCommits);
  }

  private readonly collectSharedFormDefaults = (blocks: LowCodePageBlock[]) => {
    const defaultsBySource: Record<string, Record<string, unknown>> = {};

    for (const block of blocks) {
      if (block.kind !== 'form') continue;
      const sourceKey = this.getFormSourceKey(block);

      defaultsBySource[sourceKey] = this.mergeFormModelValues(
        defaultsBySource[sourceKey] ?? {},
        block.initialValues ?? {}
      );
    }

    return defaultsBySource;
  }

  private readonly hydrateSourceBoundForms = (
    blocks: LowCodePageBlock[],
    sources: Record<string, LowCodePageDataSource>,
    loadedSourceKeys: ReadonlySet<string>
  ) => {
    for (const block of blocks) {
      if (block.kind !== 'form') continue;

      const sourceKey = this.getFormSourceKey(block);
      if (!loadedSourceKeys.has(sourceKey)) continue;
      const source = sourceKey ? sources[sourceKey] : undefined;
      const sourceValue = source ? this.dependencies.resolvedData.value[source.key] : undefined;
      const sourceRecord = Array.isArray(sourceValue) ? sourceValue[0] : sourceValue;

      if (isRecord(sourceRecord)) {
        this.dependencies.runtime.replaceForm(block.id, this.mergeFormModelValues(
          this.dependencies.formModels.value[block.id] ?? {},
          sourceRecord
        ));
      }
    }
  }

  private readonly loadDataSourceEntry = async (
    key: string,
    source: LowCodePageDataSource,
    pageBlocks: LowCodePageBlock[]
  ) => {
    const nodeAction = resolveLowCodeDataSourceNodeAction(
      pageBlocks,
      key,
      this.dependencies.props.page.node_actions,
    );
    if (nodeAction) {
      if (source.autoLoad === false) return '';
      return this.dependencies.executeNodeAction({
        node: nodeAction.block.id,
        method: nodeAction.action.method,
      })
        .then(() => '')
        .catch((error: unknown) => {
          console.error(`[LowCode Runtime] 数据源 ${key} 加载失败`, error);
          return `${key}: ${error instanceof Error ? error.message : this.dependencies.host.t('runtime.errors.loadDataSource')}`;
        });
    }

    const version = this.beginSourceRequest(key);
    return this.invokeDataSource(key, source)
      .then(([resolvedKey, value]) => {
        if (!this.isCurrentSourceRequest(key, version)) return '';
        if (typeof value !== 'undefined') {
          this.dependencies.runtime.setSource(resolvedKey, value, { resetGridBaseline: true });
        }
        return '';
      })
      .catch((error: unknown) => {
        if (!this.isCurrentSourceRequest(key, version)) return '';
        console.error(`[LowCode Runtime] 数据源 ${key} 加载失败`, error);
        return `${key}: ${error instanceof Error ? error.message : this.dependencies.host.t('runtime.errors.loadDataSource')}`;
      })
      .finally(() => this.finishSourceRequest(key, version));
  }
  private readonly loadDataSourceWaves = async (
    entries: Array<[string, LowCodePageDataSource]>,
    pageBlocks: LowCodePageBlock[],
    sources: Record<string, LowCodePageDataSource>
  ) => {
    const results = await Promise.all(
      entries.map(([key, source]) => this.loadDataSourceEntry(key, source, pageBlocks)),
    );
    const loadedSourceKeys = new Set(
      entries
        .filter((_, index) => !results[index])
        .map(([key]) => key),
    );
    this.hydrateSourceBoundForms(pageBlocks, sources, loadedSourceKeys);
    return results.filter(Boolean);
  }

  readonly loadPageData = async (nextPage: LowCodePageRecord) => {
    const pageBlocks = this.dependencies.flattenPageBlocks(nextPage.schema);
    const sources = this.collectConfiguredDataSources(nextPage.schema, pageBlocks);
    const entries = Object.entries(sources);
    const sharedFormDefaults = this.collectSharedFormDefaults(pageBlocks);
    const preserveGrids = this.runtimePageId === nextPage.id;
    const gridInteractionState = preserveGrids ? this.captureGridInteractionState() : {};

    if (!preserveGrids) {
      this.dependencies.builtinPageFunctionMode.value = resolveLowCodeEditPageMode(
        this.dependencies.host.getRoute().query?.id,
      );
    }

    this.invalidateSourceRequests();
    this.dependencies.runtime.resetData({ preserveGrids, preserveLocalGridRows: preserveGrids });
    this.runtimePageId = nextPage.id;
    this.initializePageGridStates(pageBlocks);

    for (const block of pageBlocks) {
      if (block.kind === 'grid') {
        await this.resolveGridDynamicDefaults(block);
      } else if (block.kind === 'form') {
        const sourceKey = this.getFormSourceKey(block);
        this.dependencies.runtime.replaceForm(block.id, await this.deriveFormModel(
          block,
          sharedFormDefaults[sourceKey]
        ));
      } else if (block.kind === 'searchForm') {
        this.dependencies.runtime.replaceForm(block.id, await this.deriveFormModel(block));
      }
    }//
    if (!entries.length) {
      this.syncPageGridStates(nextPage.schema);
      this.restoreGridInteractionState(gridInteractionState);
      this.captureFormBaselines();
      return [];
    }

    const errors = await this.loadDataSourceWaves(entries, pageBlocks, sources);

    this.syncPageGridStates(nextPage.schema);
    this.restoreGridInteractionState(gridInteractionState);
    this.captureFormBaselines();

    return errors;
  }

  readonly getLastSavedFormRecord = () => this.lastSavedFormRecord;
}
