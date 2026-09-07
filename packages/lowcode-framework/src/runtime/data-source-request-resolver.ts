import type { LowCodeHostRuntime } from '../core/host';
import type {
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageGridBlock,
  LowCodeRuntimeEvent,
} from '../types/lowcode';
import type { LowCodePageRuntimeContext } from './page-runtime';
import type { LowCodePageRendererProps } from './renderer-types';
import { isRecord, readPath, readString } from './renderer-value-utils';

type ValueRef<T> = { value: T };

export type RuntimeExpressionScope = {
  row?: Record<string, unknown>;
  event?: LowCodeRuntimeEvent;
  value?: unknown;
  values?: Record<string, unknown>;
};

export type DataSourceRequestResolverDependencies = {
  props: LowCodePageRendererProps;
  host: LowCodeHostRuntime;
  runtime: LowCodePageRuntimeContext;
  resolvedData: ValueRef<Record<string, unknown>>;
  formModels: ValueRef<Record<string, Record<string, unknown>>>;
  searchFilters: ValueRef<Record<string, Record<string, unknown>>>;
  gridStates: ValueRef<Record<string, unknown>>;
  selectedCategoryId: ValueRef<string>;
  flattenPageBlocks(schema?: LowCodePageRendererProps['page']['schema']): LowCodePageBlock[];
};

/** Builds normalized service requests from page expressions and legacy source metadata. */
export class DataSourceRequestResolver {
  readonly resolveRuntimeValue: (
    value: unknown,
    scope?: RuntimeExpressionScope | Record<string, unknown>,
  ) => unknown;
  readonly resolveRuntimePostData: (
    postData?: Record<string, unknown>,
  ) => Record<string, unknown>;
  readonly normalizeLegacyRequest: (
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
  ) => { serviceName: string; serviceMethod: string; postData: Record<string, unknown> };
  readonly shouldReturnEmptyForUnavailableList: (
    error: unknown,
    serviceMethod: string,
  ) => boolean;
  readonly isListItemsRequest: (serviceName: string, serviceMethod: string) => boolean;
  readonly resolveRequest: (
    key: string,
    source: LowCodePageDataSource,
    postDataOverride?: Record<string, unknown>,
    includeSearchFilters?: boolean,
  ) => { serviceName: string; serviceMethod: string; postData: Record<string, unknown> };
  readonly resolvePostData: (
    key: string,
    source: LowCodePageDataSource,
  ) => Record<string, unknown>;
  readonly resolveRoute: (
    path: string,
    row?: Record<string, unknown>,
  ) => string;

  constructor(dependencies: DataSourceRequestResolverDependencies) {
    const {
      props,
      host,
      runtime,
      resolvedData,
      formModels,
      searchFilters,
      gridStates,
      selectedCategoryId,
      flattenPageBlocks,
    } = dependencies;
    function toExpressionScope(
      scopeOrRow: RuntimeExpressionScope | Record<string, unknown> = {}
    ): RuntimeExpressionScope {
      if (
        'event' in scopeOrRow ||
        'row' in scopeOrRow ||
        'value' in scopeOrRow ||
        'values' in scopeOrRow
      ) {
        return scopeOrRow as RuntimeExpressionScope;
      }

      return { row: scopeOrRow as Record<string, unknown> };
    }

    function resolveExpression(
      expression: string,
      scopeOrRow: RuntimeExpressionScope | Record<string, unknown> = {}
    ) {
      const scope = toExpressionScope(scopeOrRow);
      const eventPayload = scope.event?.payload ?? {};
      const currentBlockId = scope.event?.blockId ?? '';
      const currentForm = currentBlockId ? formModels.value[currentBlockId] ?? {} : {};
      const currentRoute = host.getRoute();
      const expressionRoot = {
        row: scope.row ?? (isRecord(eventPayload.row) ? eventPayload.row : {}),
        route: {
          query: currentRoute.query ?? {},
          params: currentRoute.params ?? {},
          path: currentRoute.path ?? '',
          fullPath: currentRoute.fullPath ?? ''
        },
        data: resolvedData.value,
        form: currentForm,
        forms: formModels.value,
        search: searchFilters.value,
        grids: gridStates.value,
        event: {
          ...eventPayload,
          name: scope.event?.name,
          blockId: scope.event?.blockId,
          blockKind: scope.event?.blockKind
        },
        value: scope.value ?? eventPayload.value,
        values: scope.values ?? (isRecord(eventPayload.values) ? eventPayload.values : {})
      };

      return readPath(expressionRoot, expression.trim());
    }

    function resolveRuntimeValue(
      value: unknown,
      scopeOrRow: RuntimeExpressionScope | Record<string, unknown> = {}
    ): unknown {
      if (typeof value === 'string') {
        const singleExpression = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
        if (singleExpression) {
          return resolveExpression(singleExpression[1], scopeOrRow) ?? '';
        }

        return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) =>
          String(resolveExpression(expression, scopeOrRow) ?? '')
        );
      }

      if (Array.isArray(value)) {
        return value.map((item) => resolveRuntimeValue(item, scopeOrRow));
      }

      if (isRecord(value)) {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, resolveRuntimeValue(item, scopeOrRow)])
        );
      }

      return value;
    }

    function resolveRuntimePostData(postData?: Record<string, unknown>) {
      return resolveRuntimeValue(postData ?? {}) as Record<string, unknown>;
    }

    function tableNameFromEntityCode(entityCode: string) {
      const knownTables: Record<string, string> = {
        users: 'profiles',
        admin_roles: 'admin_roles',
        admin_permissions: 'admin_permissions',
        admin_routes: 'admin_routes',
        admin_entities: 'admin_entities',
        lowcode_pages: 'lowcode_pages',
      };

      return knownTables[entityCode] ?? entityCode;
    }

    function readDataSourceTargetValue(
      source: LowCodePageDataSource,
      postData: Record<string, unknown>,
      camelKey: 'entityCode' | 'tableName',
      snakeKey: 'entity_code' | 'table_name'
    ) {
      return readString(postData[camelKey] ?? postData[snakeKey], readString(source[camelKey] ?? source[snakeKey]));
    }

    function withDataSourceTargetPostData(
      source: LowCodePageDataSource,
      postData: Record<string, unknown>
    ) {
      const entityCode = readDataSourceTargetValue(source, postData, 'entityCode', 'entity_code');
      const tableName = readDataSourceTargetValue(source, postData, 'tableName', 'table_name');
      const resolvedTableName = tableName || (entityCode ? tableNameFromEntityCode(entityCode) : '');

      return {
        ...postData,
        ...(resolvedTableName ? { tableName: resolvedTableName } : {}),
      };
    }

    function hasDataSourceTableTarget(
      source: LowCodePageDataSource,
      postData: Record<string, unknown>
    ) {
      return Boolean(
        readDataSourceTargetValue(source, postData, 'entityCode', 'entity_code') ||
        readDataSourceTargetValue(source, postData, 'tableName', 'table_name')
      );
    }

    function resolveDataSourceService(
      source: LowCodePageDataSource,
      postData: Record<string, unknown>
    ) {
      const isListItemsSource = hasDataSourceTableTarget(source, postData);

      return {
        serviceName: readString(source.serviceName, isListItemsSource ? 'admin' : ''),
        serviceMethod: readString(source.serviceMethod, isListItemsSource ? 'listItems' : ''),
      };
    }

    const legacyAdminListMethodTables: Record<string, string> = {
      listUsers: 'users',
      listRoles: 'admin_roles',
      listPermissions: 'admin_permissions',
      listRoutes: 'admin_routes',
      listRouteTree: 'admin_routes',
      listRouteManageTree: 'admin_routes',
      listEntities: 'admin_entities',
      listPages: 'lowcode_pages',
      listOptionSources: 'system_option_sources',
      listSystemExecutionTasks: 'system_execution_tasks',
      listWorkflowJobs: 'workflow_jobs',
      listWorkflowJobRuns: 'workflow_job_runs',
      listWorkflowTimerJobs: 'workflow_timer_jobs',
    };

    const legacyDynamicOptionListMethods = new Set([
      'listOptionItems',
      'listDropdownOptions',
    ]);

    const legacyWorkflowListItemTypes: Record<string, string> = {
      listWorkflowJobs: 'jobs',
      listWorkflowJobRuns: 'jobRuns',
    };

    const legacyLowCodeListMethodTables: Record<string, string> = {
      listPages: 'lowcode_pages',
    };

    const legacyNotificationListResources: Record<string, string> = {
      listMessages: 'notification_messages',
      getPreferences: 'notification_preferences',
      listDeliveries: 'notification_deliveries',
    };

    const emptyWhenUnavailableListMethods = new Set([
      'listSystemExecutionTasks',
      'listWorkflowTimerJobs',
    ]);

    const lowCodeTableListMethods = new Set([
      'listTableRows',
      'listRows',
      'listTableData',
    ]);

    function normalizeLegacyAdminListRequest(
      serviceName: string,
      serviceMethod: string,
      postData: Record<string, unknown>
    ) {
      if (serviceName === 'admin' && legacyDynamicOptionListMethods.has(serviceMethod)) {
        return {
          serviceName,
          serviceMethod: 'resolveOptionItems',
          postData,
        };
      }

      if (serviceName === 'notification' && legacyNotificationListResources[serviceMethod]) {
        return {
          serviceName,
          serviceMethod: 'listItems',
          postData: {
            ...postData,
            resource: readString(postData.resource, legacyNotificationListResources[serviceMethod]),
          },
        };
      }

      if (serviceName === 'files' && serviceMethod === 'listStorageEntities') {
        return {
          serviceName,
          serviceMethod: 'runAction',
          postData: {
            ...postData,
            resource: readString(postData.resource, 'file_objects'),
            operation: readString(postData.operation ?? postData.actionName ?? postData.action, serviceMethod),
          },
        };
      }

      if (serviceName === 'admin' && legacyWorkflowListItemTypes[serviceMethod]) {
        return {
          serviceName: 'workflow',
          serviceMethod: 'listItems',
          postData: {
            ...postData,
            itemType: readString(postData.itemType ?? postData.item_type ?? postData.type, legacyWorkflowListItemTypes[serviceMethod]),
          },
        };
      }

      if (serviceName === 'lowcode' && lowCodeTableListMethods.has(serviceMethod)) {
        return {
          serviceName: 'admin',
          serviceMethod: 'listItems',
          postData,
        };
      }

      const tableName = serviceName === 'admin'
        ? legacyAdminListMethodTables[serviceMethod]
        : serviceName === 'lowcode'
          ? legacyLowCodeListMethodTables[serviceMethod]
          : '';
      if (!tableName) {
        return { serviceName, serviceMethod, postData };
      }

      return {
        serviceName,
        serviceMethod: 'listItems',
        postData: {
          ...postData,
          tableName: readString(postData.tableName ?? postData.table_name, tableName),
        },
      };
    }

    function shouldReturnEmptyForUnavailableList(error: unknown, serviceMethod: string) {
      if (!emptyWhenUnavailableListMethods.has(serviceMethod)) return false;
      const message = error instanceof Error ? error.message : String(error ?? '');
      return (
        message.includes('Could not find the table') ||
        message.includes('Unsupported Admin listItems itemType') ||
        message.includes('does not exist')
      );
    }

    function isListItemsRequest(serviceName: string, serviceMethod: string) {
      return serviceName === 'admin' && serviceMethod === 'listItems';
    }

    function mergeDataSourceSearchFilters(
      key: string,
      postData: Record<string, unknown>
    ) {
      const sourceFilters = searchFilters.value[key];

      if (!sourceFilters || !Object.keys(sourceFilters).length) {
        return postData;
      }

      const currentFilters = isRecord(postData.filters) ? postData.filters : {};

      return {
        ...postData,
        filters: {
          ...currentFilters,
          ...sourceFilters,
        },
      };
    }

    function mergeMainGridCategoryFilter(
      key: string,
      postData: Record<string, unknown>,
    ) {
      if (!selectedCategoryId.value) return postData;

      const mainGrid = flattenPageBlocks(props.page.schema).find(
        (block): block is LowCodePageGridBlock => (
          block.kind === 'grid' &&
          block.tableType === 'main' &&
          block.sourceKey === key &&
          readString(block.categoryField) !== ''
        ),
      );
      const categoryField = readString(mainGrid?.categoryField);
      if (!categoryField) return postData;

      return {
        ...postData,
        filters: {
          ...(isRecord(postData.filters) ? postData.filters : {}),
          [categoryField]: selectedCategoryId.value,
        },
      };
    }

    function resolveDataSourceRequest(
      key: string,
      source: LowCodePageDataSource,
      postDataOverride?: Record<string, unknown>,
      includeSearchFilters = true,
    ) {
      // debugger//
      const basePostData = resolveRuntimePostData(postDataOverride ?? source.postData);
      const targetedPostData = withDataSourceTargetPostData(source, basePostData);
      const searchedPostData = includeSearchFilters
        ? mergeDataSourceSearchFilters(key, targetedPostData)
        : targetedPostData;
      const postData = mergeMainGridCategoryFilter(key, searchedPostData);
      const service = resolveDataSourceService(source, postData);

      return normalizeLegacyAdminListRequest(service.serviceName, service.serviceMethod, postData);
    }

    function resolveDataSourcePostData(key: string, source: LowCodePageDataSource) {
      return resolveDataSourceRequest(key, source).postData;
    }

    function resolveRuntimeRoute(path: string, row: Record<string, unknown> = {}) {
      return resolveRuntimeValue(path, row) as string;
    }

    this.resolveRuntimeValue = resolveRuntimeValue;
    this.resolveRuntimePostData = resolveRuntimePostData;
    this.normalizeLegacyRequest = normalizeLegacyAdminListRequest;
    this.shouldReturnEmptyForUnavailableList = shouldReturnEmptyForUnavailableList;
    this.isListItemsRequest = isListItemsRequest;
    this.resolveRequest = resolveDataSourceRequest;
    this.resolvePostData = resolveDataSourcePostData;
    this.resolveRoute = resolveRuntimeRoute;
  }
}
