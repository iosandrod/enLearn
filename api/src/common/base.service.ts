import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { PoolClient } from 'pg';
import type { ServiceContext, ServiceExecutor } from './interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission
} from './utils/supabase';
import { getPostgresPool } from './utils/database';

export type ListFilterLogic = 'and' | 'or';

export type ListFilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'notIn'
  | 'like'
  | 'ilike'
  | 'notLike'
  | 'notIlike'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull'
  | 'contains'
  | 'containedBy'
  | 'overlaps'
  | 'hasKey'
  | 'hasAnyKeys'
  | 'hasAllKeys';

export type ListFilterCondition = {
  field: string;
  op?: ListFilterOperator;
  value?: unknown;
};

export type ListFilterGroup = {
  logic?: ListFilterLogic;
  conditions: Array<ListFilterCondition | ListFilterGroup>;
};

export type ListFilters = Record<string, unknown> | ListFilterGroup;

export type ListSort = {
  field: string;
  direction?: 'asc' | 'desc';
  nulls?: 'first' | 'last';
};

export interface ServicePostData {
  resource?: unknown;
  itemType?: unknown;
  item_type?: unknown;
  type?: unknown;
  entityCode?: unknown;
  entity_code?: unknown;
  tableName?: unknown;
  table_name?: unknown;
  id?: unknown;
  ids?: unknown;
  data?: unknown;
  filters?: ListFilters;
  requiredFilters?: unknown;
  required_filters?: unknown;
  search?: unknown;
  searchFields?: unknown;
  search_fields?: unknown;
  limit?: unknown;
  page?: unknown;
  pageSize?: unknown;
  page_size?: unknown;
  offset?: unknown;
  orderBy?: unknown;
  order_by?: unknown;
  orderDirection?: unknown;
  order_direction?: unknown;
  sorts?: unknown;
  withCount?: unknown;
  with_count?: unknown;
  responseMode?: unknown;
  response_mode?: unknown;
  afterSave?: unknown;
  after_save?: unknown;
  clientMode?: unknown;
  client_mode?: unknown;
  [key: string]: unknown;
}

export type CrudAction = 'list' | 'create' | 'update' | 'delete';
export type ServiceAction = CrudAction | 'action';

export type ResourcePermissions = Partial<Record<ServiceAction, string | string[]>>;

export type ResourceUserFields = {
  createdBy?: string;
  updatedBy?: string;
  deletedBy?: string;
  owner?: string;
};

export type ResourceActionConfig = {
  allowedFields?: string[];
  requiredFields?: string[];
  timestamp?: boolean;
  userFields?: ResourceUserFields;
};

export type ResourceDeleteConfig = ResourceActionConfig & {
  softDelete?: boolean;
  deletedAtField?: string;
  statusField?: string;
  deletedStatus?: string;
};

export type ResourceListConfig = {
  defaultFilters?: Record<string, unknown>;
  defaultSorts?: ListSort[];
  searchFields?: string[];
  defaultPageSize?: number;
  maxPageSize?: number;
};

export type ResourceDetailRelation = {
  resource?: string;
  foreignKey: string;
  parentKey?: string;
  inheritFields?: string[];
  updateMode?: 'replace';
};

export type ResourceAfterSaveRelation = {
  resource?: string;
  actions: Array<'update'>;
  allowedFields: string[];
  allowedWhereFields?: string[];
};

type PreparedAfterSaveUpdate = {
  action: 'update';
  resourceName: string;
  resource: ResourceConfig;
  data: Record<string, unknown>;
  where: Record<string, unknown>;
  expectedAffectedRows?: number;
};

export type ResourceConfig = {
  code?: string;
  tableName: string;
  primaryKey?: string;
  select?: string;
  clientMode?: 'user' | 'admin';
  ownerField?: string;
  accountField?: string;
  permissions?: ResourcePermissions;
  defaults?: Record<string, unknown> | ((ctx: CrudContext) => Record<string, unknown> | Promise<Record<string, unknown>>);
  detailRelations?: Record<string, ResourceDetailRelation>;
  afterSaveRelations?: Record<string, ResourceAfterSaveRelation>;
  list?: ResourceListConfig;
  create?: ResourceActionConfig;
  update?: ResourceActionConfig;
  delete?: ResourceDeleteConfig;
};

export type ResourceConfigMap = Record<string, ResourceConfig>;

export type HookContext = {
  action: ServiceAction;
  serviceName: string;
  resourceName: string;
  resource: ResourceConfig;
  input: ServicePostData;
  data: Record<string, unknown>;
  filters: ListFilters | undefined;
  context: ServiceContext;
  client: SupabaseClient;
  user?: User;
  id?: string;
  ids: string[];
  result?: unknown;
  meta: Record<string, unknown>;
};

export type CrudContext = HookContext;

export type HookHandler = (ctx: HookContext) => Promise<void> | void;

export type ResourceHooks = Partial<Record<
  | 'beforeAction'
  | 'afterAction'
  | 'action'
  | 'beforeList'
  | 'afterList'
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeUpdate'
  | 'afterUpdate'
  | 'beforeDelete'
  | 'afterDelete'
  | 'onError',
  HookHandler | HookHandler[]
>>;

export type ServiceHooks = Record<string, ResourceHooks>;

export type ListItemsHandler = (
  postData: ServicePostData,
  context: ServiceContext
) => Promise<unknown> | unknown;

export abstract class BaseService implements ServiceExecutor {
  async execute(
    method: string,
    postData: ServicePostData,
    context: ServiceContext
  ): Promise<unknown> {
    try {
      switch (method) {
        case 'listItems':
          return this.listItems(postData, context);
        case 'createItem':
          return this.createItem(postData, context);
        case 'updateItem':
          return this.updateItem(postData, context);
        case 'deleteItem':
          return this.deleteItem(postData, context);
        case 'saveItem':
          return this.saveItem(postData, context);
        case 'runAction':
          return this.runResourceAction(postData, context);
        default:
          return this.executeAction(method, postData, context);
      }
    } catch (error) {
      throw error;
    }
  }

  protected async executeAction(
    method: string,
    _postData: ServicePostData,
    _context: ServiceContext
  ): Promise<unknown> {
    throw new BadRequestException('Unsupported ' + this.serviceLabel() + ' method: ' + method);
  }

  protected async listItems(postData: ServicePostData, context: ServiceContext) {
    const itemType = this.readListItemsType(postData);
    const listHandler = this.listItemHandlers()[itemType];
    if (listHandler) {
      return listHandler(postData, context);
    }

    const resource = this.tryResolveResource(postData, itemType);
    if (resource) {
      return this.runCrud('list', postData, context, resource);
    }

    const tableName = this.readOptionalString(postData.tableName ?? postData.table_name);
    if (!tableName) {
      return this.handleListItems(postData, context);
    }

    const clientMode = this.readOptionalString(postData.clientMode ?? postData.client_mode);
    const client = clientMode === 'admin'
      ? createSupabaseClient('admin', context)
      : (await getCurrentUser(context)).client;
    const select = this.readOptionalString(postData.select) || '*';
    const pageSize = this.readListItemsLimit(postData);
    const page = Math.min(Math.max(Math.trunc(this.readNumber(postData.page, 1)), 1), 100000);
    const offset = this.readListItemsOffset(postData, pageSize);
    const withCount = this.readBoolean(postData.withCount ?? postData.with_count, false);
    const responseMode = this.readOptionalString(postData.responseMode ?? postData.response_mode);
    const selectOptions = withCount || responseMode === 'page' ? { count: 'exact' as const } : undefined;
    let query = this.fromTable(client, tableName).select(select, selectOptions);

    const accountField = this.accountFieldForTable(tableName);
    if (accountField) {
      query = query.eq(accountField, this.accountValue(context, accountField));
    }

    query = this.applyListItemsFilters(query, postData.filters);
    query = this.applyListItemsSearch(query, postData);

    for (const sort of this.readListItemsSorts(postData)) {
      query = query.order(sort.field, {
        ascending: sort.direction === 'asc',
        nullsFirst: sort.nulls === 'first'
      });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw new BadRequestException(error.message);

    const rows = data ?? [];
    if (withCount || responseMode === 'page') {
      return {
        rows,
        total: count ?? rows.length,
        page,
        pageSize
      };
    }

    return rows;
  }

  protected async createItem(postData: ServicePostData, context: ServiceContext) {
    return this.runCrud('create', postData, context);
  }

  protected async updateItem(postData: ServicePostData, context: ServiceContext) {
    return this.runCrud('update', postData, context);
  }

  protected async deleteItem(postData: ServicePostData, context: ServiceContext) {
    return this.runCrud('delete', postData, context);
  }

  protected async saveItem(postData: ServicePostData, context: ServiceContext) {
    const resource = this.tryResolveResource(postData);
    const primaryKey = resource ? this.primaryKey(resource.config) : 'id';
    const data = this.readRecord(postData.data);
    return this.readOptionalString(postData.id ?? postData[primaryKey] ?? data.id ?? data[primaryKey])
      ? this.updateItem(postData, context)
      : this.createItem(postData, context);
  }

  protected async runResourceAction(postData: ServicePostData, context: ServiceContext) {
    const resource = this.resolveResource(postData);
    const ctx = await this.createCrudContext('action', postData, context, resource);

    try {
      await this.runHooks(ctx, ['beforeAction']);
      await this.assertPermission(ctx);
      await this.runHooks(ctx, ['action']);
      await this.runHooks(ctx, ['afterAction']);
      return ctx.result;
    } catch (error) {
      ctx.meta.error = error;
      await this.runHooks(ctx, ['onError']);
      throw error;
    }
  }

  protected async runCrud(
    action: CrudAction,
    postData: ServicePostData,
    context: ServiceContext,
    resolvedResource?: { name: string; config: ResourceConfig }
  ) {
    const resource = resolvedResource ?? this.resolveResource(postData);
    const ctx = await this.createCrudContext(action, postData, context, resource);

    try {
      await this.runHooks(ctx, ['beforeAction', this.hookName('before', action)]);
      await this.assertPermission(ctx);

      if (action === 'list') ctx.result = await this.performList(ctx);
      if (action === 'create') ctx.result = await this.performCreate(ctx);
      if (action === 'update') ctx.result = await this.performUpdate(ctx);
      if (action === 'delete') ctx.result = await this.performDelete(ctx);

      await this.runHooks(ctx, [this.hookName('after', action), 'afterAction']);
      return ctx.result;
    } catch (error) {
      ctx.meta.error = error;
      await this.runHooks(ctx, ['onError']);
      throw error;
    }
  }

  protected async createCrudContext(
    action: ServiceAction,
    postData: ServicePostData,
    context: ServiceContext,
    resource: { name: string; config: ResourceConfig }
  ): Promise<CrudContext> {
    const client = await this.createCrudClient(resource.config, context);
    const user = await this.tryReadCurrentUser(context, resource.config);
    const data = this.readDataPayload(postData);
    this.assertAccountPayload(resource.config, context, data);
    const id = this.readId(postData, resource.config);
    const ids = this.readIds(postData, resource.config);

    return {
      action,
      serviceName: this.serviceLabel(),
      resourceName: resource.name,
      resource: resource.config,
      input: postData,
      data,
      filters: postData.filters,
      context,
      client,
      user,
      id,
      ids,
      meta: {}
    };
  }

  protected async createCrudClient(resource: ResourceConfig, context: ServiceContext) {
    if (resource.clientMode === 'admin') {
      return createSupabaseClient('admin', context);
    }

    const { client } = await getCurrentUser(context);
    return client;
  }

  protected async tryReadCurrentUser(context: ServiceContext, resource: ResourceConfig) {
    if (resource.clientMode === 'admin') {
      try {
        return (await getCurrentUser(context)).user;
      } catch {
        return undefined;
      }
    }

    return (await getCurrentUser(context)).user;
  }

  protected async performList(ctx: CrudContext) {
    let query = ctx.client
      .from(ctx.resource.tableName)
      .select(ctx.resource.select ?? '*');

    if (ctx.resource.ownerField && ctx.user) {
      query = query.eq(ctx.resource.ownerField, ctx.user.id);
    }

    if (ctx.resource.accountField) {
      query = query.eq(
        ctx.resource.accountField,
        this.accountValue(ctx.context, ctx.resource.accountField)
      );
    }

    const filters = this.readRecord(ctx.filters);
    const defaultFilters = ctx.resource.list?.defaultFilters ?? {};
    for (const [field, value] of Object.entries({ ...defaultFilters, ...filters })) {
      query = this.applySupabaseFilter(query, field, value);
    }

    const sorts = this.readCrudSorts(ctx);
    for (const sort of sorts) {
      query = query.order(sort.field, {
        ascending: sort.direction === 'asc',
        nullsFirst: sort.nulls === 'first'
      });
    }

    const limit = this.readCrudLimit(ctx.input, ctx.resource);
    const offset = this.readCrudOffset(ctx.input, limit);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  protected async performCreate(ctx: CrudContext) {
    const sourceItems = this.readCreateDataItems(ctx);

    type PreparedDetail = {
      resourceName: string;
      resource: ResourceConfig;
      foreignKey: string;
      parentKey: string;
      inheritFields: string[];
      payloads: Record<string, unknown>[];
    };

    type PreparedItem = {
      payload: Record<string, unknown>;
      details: PreparedDetail[];
    };

    const quoteIdentifier = (value: string, fieldName: string) => {
      this.assertIdentifier(value, fieldName);
      return `"${value}"`;
    };

    const quoteRelation = (value: string, fieldName: string) => {
      const parts = value.split('.').map((part) => part.trim()).filter(Boolean);
      if (parts.length < 1 || parts.length > 2) {
        throw new BadRequestException(fieldName + ' must be table or schema.table.');
      }
      return parts.map((part) => quoteIdentifier(part, fieldName)).join('.');
    };

    const prepareDetails = async (source: Record<string, unknown>) => {
      const rawDetails = source.__details;
      if (rawDetails === undefined || rawDetails === null) return [] as PreparedDetail[];
      if (!Array.isArray(rawDetails)) {
        throw new BadRequestException('__details must be an array.');
      }

      const details: PreparedDetail[] = [];
      for (const [detailIndex, rawDetail] of rawDetails.entries()) {
        if (!this.isRecord(rawDetail)) {
          throw new BadRequestException(`__details[${detailIndex}] must be an object.`);
        }

        const resourceName = this.readOptionalString(rawDetail.resource);
        if (!resourceName) {
          throw new BadRequestException(`__details[${detailIndex}].resource is required.`);
        }

        const relation = ctx.resource.detailRelations?.[resourceName];
        if (!relation) {
          throw new BadRequestException(
            `Detail resource ${resourceName} is not configured for ${ctx.resourceName}.`
          );
        }

        const resolved = this.tryResolveResource({
          resource: relation.resource ?? resourceName
        });
        if (!resolved || !resolved.config.create) {
          throw new BadRequestException(`Unsupported create detail resource: ${resourceName}`);
        }
        if (
          (resolved.config.clientMode ?? 'user') !==
          (ctx.resource.clientMode ?? 'user')
        ) {
          throw new BadRequestException(
            `Detail resource ${resourceName} must use the same clientMode as ${ctx.resourceName}.`
          );
        }
        this.assertSameAccountScope(ctx.resource, resolved.config, resourceName);

        const requestedForeignKey = this.readOptionalString(
          rawDetail.foreignKey ?? rawDetail.foreign_key
        );
        const foreignKey = relation.foreignKey;
        if (requestedForeignKey && requestedForeignKey !== foreignKey) {
          throw new BadRequestException(
            `__details[${detailIndex}].foreignKey must be ${foreignKey}.`
          );
        }
        this.assertIdentifier(foreignKey, `__details[${detailIndex}].foreignKey`);

        const requestedParentKey = this.readOptionalString(
          rawDetail.parentKey ?? rawDetail.parent_key
        );
        const parentKey = relation.parentKey ?? this.primaryKey(ctx.resource);
        if (requestedParentKey && requestedParentKey !== parentKey) {
          throw new BadRequestException(
            `__details[${detailIndex}].parentKey must be ${parentKey}.`
          );
        }
        this.assertIdentifier(parentKey, `__details[${detailIndex}].parentKey`);

        const requestedInheritFields = this.readStringArray(
          rawDetail.inheritFields ?? rawDetail.inherit_fields
        );
        const inheritFields = relation.inheritFields ?? [];
        if (
          (rawDetail.inheritFields !== undefined || rawDetail.inherit_fields !== undefined) &&
          (
            requestedInheritFields.length !== inheritFields.length ||
            requestedInheritFields.some((field) => !inheritFields.includes(field))
          )
        ) {
          throw new BadRequestException(
            `__details[${detailIndex}].inheritFields does not match the configured relation.`
          );
        }
        inheritFields.forEach((field) =>
          this.assertIdentifier(field, `__details[${detailIndex}].inheritFields`)
        );

        const allowedFields = resolved.config.create.allowedFields;
        for (const managedField of [foreignKey, ...inheritFields]) {
          if (allowedFields && !allowedFields.includes(managedField)) {
            throw new BadRequestException(
              `${managedField} is not writable on detail resource ${resourceName}.`
            );
          }
        }

        if (!Array.isArray(rawDetail.rows)) {
          throw new BadRequestException(`__details[${detailIndex}].rows must be an array.`);
        }
        if (!rawDetail.rows.every((row) => this.isRecord(row))) {
          throw new BadRequestException(
            `Every item in __details[${detailIndex}].rows must be an object.`
          );
        }

        const detailContext: CrudContext = {
          ...ctx,
          action: 'create',
          resourceName: resolved.name,
          resource: resolved.config,
          input: { ...ctx.input, resource: resolved.name },
          data: {},
          filters: undefined,
          id: undefined,
          ids: [],
          result: undefined,
          meta: {}
        };
        await this.assertPermission(detailContext);

        const payloads = await Promise.all(
          (rawDetail.rows as Record<string, unknown>[]).map(async (row, rowIndex) => {
            if (row.__details !== undefined) {
              throw new BadRequestException(
                `Nested __details is not supported at __details[${detailIndex}].rows[${rowIndex}].`
              );
            }
            return this.buildWritePayload(detailContext, 'create', row);
          })
        );

        details.push({
          resourceName: resolved.name,
          resource: resolved.config,
          foreignKey,
          parentKey,
          inheritFields,
          payloads
        });
      }

      return details;
    };

    const preparedItems = await Promise.all(
      sourceItems.map(async (source): Promise<PreparedItem> => {
        const details = await prepareDetails(source);
        const mainSource = Object.fromEntries(
          Object.entries(source).filter(([field]) => field !== '__details')
        );
        const payload = await this.buildWritePayload(ctx, 'create', mainSource);
        this.assertRequiredFields(payload, ctx.resource.create?.requiredFields ?? []);
        return { payload, details };
      })
    );
    const afterSaveActions = await this.prepareAfterSaveActions(ctx);
    if (afterSaveActions.length && preparedItems.length !== 1) {
      throw new BadRequestException('afterSave requires exactly one saved item.');
    }

    const client = await getPostgresPool().connect();
    let transactionStarted = false;
    let releaseError: Error | undefined;

    const insertRows = async (
      tableName: string,
      rows: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> => {
      if (!rows.length) return [];

      const relationSql = quoteRelation(tableName, 'tableName');
      const insertedRows = new Array<Record<string, unknown>>(rows.length);
      const groups = new Map<
        string,
        { columns: string[]; items: Array<{ index: number; row: Record<string, unknown> }> }
      >();

      rows.forEach((row, index) => {
        const normalizedRow = Object.fromEntries(
          Object.entries(row).filter(([, value]) => value !== undefined)
        );
        const columns = Object.keys(normalizedRow).sort();
        const signature = JSON.stringify(columns);
        const group = groups.get(signature) ?? { columns, items: [] };
        group.items.push({ index, row: normalizedRow });
        groups.set(signature, group);
      });

      for (const group of groups.values()) {
        if (!group.columns.length) {
          for (const item of group.items) {
            const result = await client.query(
              `insert into ${relationSql} default values returning *`
            );
            insertedRows[item.index] = result.rows[0] as Record<string, unknown>;
          }
          continue;
        }

        const values: unknown[] = [];
        const valueRows = group.items.map(({ row }) => {
          const placeholders = group.columns.map((column) => {
            values.push(row[column]);
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        const columnsSql = group.columns
          .map((column) => quoteIdentifier(column, 'column'))
          .join(', ');
        const result = await client.query(
          `insert into ${relationSql} (${columnsSql}) values ${valueRows.join(', ')} returning *`,
          values
        );

        result.rows.forEach((row, resultIndex) => {
          insertedRows[group.items[resultIndex].index] = row as Record<string, unknown>;
        });
      }

      return insertedRows;
    };

    try {
      await client.query('begin');
      transactionStarted = true;
      if (ctx.resource.clientMode !== 'admin' && ctx.user) {
        await client.query(
          `select
            set_config('request.jwt.claims', $1, true),
            set_config('request.jwt.claim.sub', $2, true),
            set_config('request.jwt.claim.role', 'authenticated', true)`,
          [JSON.stringify({ sub: ctx.user.id, role: 'authenticated' }), ctx.user.id]
        );
        await client.query('set local role authenticated');
      }

      const insertedParents: Record<string, unknown>[] = [];
      for (const item of preparedItems) {
        const [parent] = await insertRows(ctx.resource.tableName, [item.payload]);
        if (!parent) throw new BadRequestException('The created parent row was not returned.');

        for (const detail of item.details) {
          const parentValue = parent[detail.parentKey];
          if (parentValue === undefined || parentValue === null) {
            throw new BadRequestException(
              `Parent field ${detail.parentKey} is required for detail resource ${detail.resourceName}.`
            );
          }

          const linkedPayloads = detail.payloads.map((payload) => {
            const linkedPayload = { ...payload, [detail.foreignKey]: parentValue };
            for (const field of detail.inheritFields) {
              if (parent[field] === undefined) {
                throw new BadRequestException(
                  `Parent field ${field} is required for detail resource ${detail.resourceName}.`
                );
              }
              linkedPayload[field] = parent[field];
            }
            this.assertRequiredFields(
              linkedPayload,
              detail.resource.create?.requiredFields ?? []
            );
            return linkedPayload;
          });

          await insertRows(detail.resource.tableName, linkedPayloads);
        }

        insertedParents.push(parent);
      }

      if (afterSaveActions.length) {
        await this.executeAfterSaveActions(
          client,
          ctx,
          afterSaveActions,
          insertedParents[0]
        );
      }

      await client.query('commit');
      transactionStarted = false;
      return insertedParents.length === 1 ? insertedParents[0] : insertedParents;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('rollback');
          transactionStarted = false;
        } catch (rollbackError) {
          releaseError = rollbackError instanceof Error
            ? rollbackError
            : new Error('PostgreSQL rollback failed.');
        }
      }

      if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Create transaction failed.'
      );
    } finally {
      client.release(releaseError);
    }
  }

  protected readCreateDataItems(ctx: CrudContext) {
    const rawItems = ctx.input.data ?? ctx.input.items ?? ctx.input.rows;
    if (Array.isArray(rawItems)) {
      const rows = rawItems.filter(this.isRecord) as Record<string, unknown>[];
      if (!rows.length) throw new BadRequestException('data must include at least one item.');
      return rows;
    }
    return [ctx.data];
  }

  protected async performUpdate(ctx: CrudContext) {
    const id = ctx.id;
    const ids = ctx.ids.filter((item) => item !== id);
    const filters = this.readRecord(ctx.filters);
    const hasFilters = Object.keys(filters).length > 0;
    const batchItems = this.readBatchUpdateDataItems(ctx);
    const primaryKey = this.primaryKey(ctx.resource);
    const isBatchUpdate = !id && !ids.length && !hasFilters && batchItems.length > 0;

    type PreparedDetail = {
      resourceName: string;
      resource: ResourceConfig;
      foreignKey: string;
      parentKey: string;
      inheritFields: string[];
      payloads: Record<string, unknown>[];
    };

    type PreparedBatchItem = {
      itemId: string;
      payload: Record<string, unknown>;
      details: PreparedDetail[];
    };

    const quoteIdentifier = (value: string, fieldName: string) => {
      this.assertIdentifier(value, fieldName);
      return `"${value}"`;
    };

    const quoteRelation = (value: string, fieldName: string) => {
      const parts = value.split('.').map((part) => part.trim()).filter(Boolean);
      if (parts.length < 1 || parts.length > 2) {
        throw new BadRequestException(fieldName + ' must be table or schema.table.');
      }
      return parts.map((part) => quoteIdentifier(part, fieldName)).join('.');
    };

    const prepareDetails = async (source: Record<string, unknown>) => {
      const rawDetails = source.__details;
      if (rawDetails === undefined || rawDetails === null) return [] as PreparedDetail[];
      if (!Array.isArray(rawDetails)) {
        throw new BadRequestException('__details must be an array.');
      }

      const details: PreparedDetail[] = [];
      const targets = new Set<string>();
      for (const [detailIndex, rawDetail] of rawDetails.entries()) {
        if (!this.isRecord(rawDetail)) {
          throw new BadRequestException(`__details[${detailIndex}] must be an object.`);
        }

        const mode = this.readOptionalString(rawDetail.mode) || 'replace';
        if (mode !== 'replace') {
          throw new BadRequestException(
            `Unsupported __details[${detailIndex}].mode: ${mode}. Only replace is supported.`
          );
        }

        const resourceName = this.readOptionalString(rawDetail.resource);
        if (!resourceName) {
          throw new BadRequestException(`__details[${detailIndex}].resource is required.`);
        }

        const relation = ctx.resource.detailRelations?.[resourceName];
        if (!relation) {
          throw new BadRequestException(
            `Detail resource ${resourceName} is not configured for ${ctx.resourceName}.`
          );
        }
        if (relation.updateMode !== mode) {
          throw new BadRequestException(
            `Detail resource ${resourceName} does not allow ${mode} updates.`
          );
        }

        const resolved = this.tryResolveResource({
          resource: relation.resource ?? resourceName
        });
        if (!resolved || !resolved.config.create) {
          throw new BadRequestException(`Unsupported replace detail resource: ${resourceName}`);
        }
        if (
          (resolved.config.clientMode ?? 'user') !==
          (ctx.resource.clientMode ?? 'user')
        ) {
          throw new BadRequestException(
            `Detail resource ${resourceName} must use the same clientMode as ${ctx.resourceName}.`
          );
        }
        this.assertSameAccountScope(ctx.resource, resolved.config, resourceName);

        const requestedForeignKey = this.readOptionalString(
          rawDetail.foreignKey ?? rawDetail.foreign_key
        );
        const foreignKey = relation.foreignKey;
        if (requestedForeignKey && requestedForeignKey !== foreignKey) {
          throw new BadRequestException(
            `__details[${detailIndex}].foreignKey must be ${foreignKey}.`
          );
        }
        this.assertIdentifier(foreignKey, `__details[${detailIndex}].foreignKey`);

        const requestedParentKey = this.readOptionalString(
          rawDetail.parentKey ?? rawDetail.parent_key
        );
        const parentKey = relation.parentKey ?? primaryKey;
        if (requestedParentKey && requestedParentKey !== parentKey) {
          throw new BadRequestException(
            `__details[${detailIndex}].parentKey must be ${parentKey}.`
          );
        }
        this.assertIdentifier(parentKey, `__details[${detailIndex}].parentKey`);

        const targetKey = `${resolved.name}:${foreignKey}:${parentKey}`;
        if (targets.has(targetKey)) {
          throw new BadRequestException(
            `Duplicate replace target at __details[${detailIndex}]: ${resourceName}.${foreignKey}.`
          );
        }
        targets.add(targetKey);

        const requestedInheritFields = this.readStringArray(
          rawDetail.inheritFields ?? rawDetail.inherit_fields
        );
        const inheritFields = relation.inheritFields ?? [];
        if (
          (rawDetail.inheritFields !== undefined || rawDetail.inherit_fields !== undefined) &&
          (
            requestedInheritFields.length !== inheritFields.length ||
            requestedInheritFields.some((field) => !inheritFields.includes(field))
          )
        ) {
          throw new BadRequestException(
            `__details[${detailIndex}].inheritFields does not match the configured relation.`
          );
        }
        inheritFields.forEach((field) =>
          this.assertIdentifier(field, `__details[${detailIndex}].inheritFields`)
        );

        const allowedFields = resolved.config.create.allowedFields;
        for (const managedField of [foreignKey, ...inheritFields]) {
          if (allowedFields && !allowedFields.includes(managedField)) {
            throw new BadRequestException(
              `${managedField} is not writable on detail resource ${resourceName}.`
            );
          }
        }

        if (!Array.isArray(rawDetail.rows)) {
          throw new BadRequestException(`__details[${detailIndex}].rows must be an array.`);
        }
        if (!rawDetail.rows.every((row) => this.isRecord(row))) {
          throw new BadRequestException(
            `Every item in __details[${detailIndex}].rows must be an object.`
          );
        }

        const detailContext: CrudContext = {
          ...ctx,
          action: 'create',
          resourceName: resolved.name,
          resource: resolved.config,
          input: { ...ctx.input, resource: resolved.name },
          data: {},
          filters: undefined,
          id: undefined,
          ids: [],
          result: undefined,
          meta: {}
        };
        await this.assertPermission(detailContext);
        await this.assertPermission({ ...detailContext, action: 'delete' });

        const payloads = await Promise.all(
          (rawDetail.rows as Record<string, unknown>[]).map(async (row, rowIndex) => {
            if (row.__details !== undefined) {
              throw new BadRequestException(
                `Nested __details is not supported at __details[${detailIndex}].rows[${rowIndex}].`
              );
            }
            return this.buildWritePayload(detailContext, 'create', row);
          })
        );

        details.push({
          resourceName: resolved.name,
          resource: resolved.config,
          foreignKey,
          parentKey,
          inheritFields,
          payloads
        });
      }

      return details;
    };

    let preparedBatchItems: PreparedBatchItem[] = [];
    let payload: Record<string, unknown> | undefined;
    let details: PreparedDetail[] = [];

    if (isBatchUpdate) {
      preparedBatchItems = await Promise.all(
        batchItems.map(async (source) => {
          const itemId = this.readOptionalString(source[primaryKey] ?? source.id);
          if (!itemId) {
            throw new BadRequestException(primaryKey + ' is required for each update item.');
          }
          const itemDetails = await prepareDetails(source);
          const mainSource = Object.fromEntries(
            Object.entries(source).filter(
              ([field]) => field !== '__details' && field !== primaryKey
            )
          );
          const itemPayload = await this.buildWritePayload(ctx, 'update', mainSource);
          this.assertRequiredFields(
            itemPayload,
            ctx.resource.update?.requiredFields ?? []
          );
          return { itemId, payload: itemPayload, details: itemDetails };
        })
      );
    } else {
      if (!id && !ids.length && !hasFilters) {
        throw new BadRequestException('id, ids, or filters is required.');
      }

      details = await prepareDetails(ctx.data);
      if (details.length && !id) {
        throw new BadRequestException(
          'A single id is required when replacing detail rows.'
        );
      }

      const mainSource = Object.fromEntries(
        Object.entries(ctx.data).filter(
          ([field]) => field !== '__details' && field !== primaryKey
        )
      );
      payload = await this.buildWritePayload(ctx, 'update', mainSource);
      this.assertRequiredFields(payload, ctx.resource.update?.requiredFields ?? []);
    }
    const afterSaveActions = await this.prepareAfterSaveActions(ctx);
    if (afterSaveActions.length && (isBatchUpdate || !id)) {
      throw new BadRequestException('afterSave on update requires a single id.');
    }

    const client = await getPostgresPool().connect();
    let transactionStarted = false;
    let releaseError: Error | undefined;

    const insertRows = async (
      tableName: string,
      rows: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> => {
      if (!rows.length) return [];

      const relationSql = quoteRelation(tableName, 'tableName');
      const insertedRows = new Array<Record<string, unknown>>(rows.length);
      const groups = new Map<
        string,
        { columns: string[]; items: Array<{ index: number; row: Record<string, unknown> }> }
      >();

      rows.forEach((row, index) => {
        const normalizedRow = Object.fromEntries(
          Object.entries(row).filter(([, value]) => value !== undefined)
        );
        const columns = Object.keys(normalizedRow).sort();
        const signature = JSON.stringify(columns);
        const group = groups.get(signature) ?? { columns, items: [] };
        group.items.push({ index, row: normalizedRow });
        groups.set(signature, group);
      });

      for (const group of groups.values()) {
        if (!group.columns.length) {
          for (const item of group.items) {
            const result = await client.query(
              `insert into ${relationSql} default values returning *`
            );
            insertedRows[item.index] = result.rows[0] as Record<string, unknown>;
          }
          continue;
        }

        const values: unknown[] = [];
        const valueRows = group.items.map(({ row }) => {
          const placeholders = group.columns.map((column) => {
            values.push(row[column]);
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        const columnsSql = group.columns
          .map((column) => quoteIdentifier(column, 'column'))
          .join(', ');
        const result = await client.query(
          `insert into ${relationSql} (${columnsSql}) values ${valueRows.join(', ')} returning *`,
          values
        );

        result.rows.forEach((row, resultIndex) => {
          insertedRows[group.items[resultIndex].index] = row as Record<string, unknown>;
        });
      }

      return insertedRows;
    };

    const appendFilter = (
      conditions: string[],
      values: unknown[],
      field: string,
      value: unknown
    ) => {
      if (!field || value === undefined || value === '') return;
      const fieldSql = quoteIdentifier(field, 'filter field');
      const bind = (operand: unknown) => {
        values.push(operand);
        return `$${values.length}`;
      };

      if (Array.isArray(value)) {
        if (value.length) {
          conditions.push(`${fieldSql} in (${value.map((item) => bind(item)).join(', ')})`);
        }
        return;
      }
      if (value === null) {
        conditions.push(`${fieldSql} is null`);
        return;
      }

      if (this.isRecord(value)) {
        const op = this.readOptionalString(value.op).replace(/_/g, '').toLowerCase();
        const operand = value.value;
        if (op === 'isnull') {
          conditions.push(`${fieldSql} is null`);
          return;
        }
        if (op === 'isnotnull') {
          conditions.push(`${fieldSql} is not null`);
          return;
        }
        if (operand === undefined || operand === '') return;
        if (op === 'eq') conditions.push(`${fieldSql} = ${bind(operand)}`);
        else if (op === 'ne') conditions.push(`${fieldSql} <> ${bind(operand)}`);
        else if (op === 'gt') conditions.push(`${fieldSql} > ${bind(operand)}`);
        else if (op === 'gte') conditions.push(`${fieldSql} >= ${bind(operand)}`);
        else if (op === 'lt') conditions.push(`${fieldSql} < ${bind(operand)}`);
        else if (op === 'lte') conditions.push(`${fieldSql} <= ${bind(operand)}`);
        else if (op === 'in' || op === 'notin') {
          const operands = Array.isArray(operand) ? operand : [];
          if (operands.length) {
            const operator = op === 'in' ? 'in' : 'not in';
            conditions.push(
              `${fieldSql} ${operator} (${operands.map((item) => bind(item)).join(', ')})`
            );
          }
        } else if (op === 'between') {
          const operands = Array.isArray(operand) ? operand : [];
          if (operands.length >= 2) {
            conditions.push(
              `${fieldSql} between ${bind(operands[0])} and ${bind(operands[1])}`
            );
          }
        } else if (op === 'like' || op === 'ilike' || op === 'notlike' || op === 'notilike') {
          const operator = op === 'like'
            ? 'like'
            : op === 'ilike'
              ? 'ilike'
              : op === 'notlike'
                ? 'not like'
                : 'not ilike';
          conditions.push(`${fieldSql} ${operator} ${bind(`%${String(operand)}%`)}`);
        } else if (op === 'startswith') {
          conditions.push(`${fieldSql} like ${bind(`${String(operand)}%`)}`);
        } else if (op === 'endswith') {
          conditions.push(`${fieldSql} like ${bind(`%${String(operand)}`)}`);
        } else if (op === 'contains') {
          conditions.push(`${fieldSql} @> ${bind(operand)}`);
        } else if (op === 'containedby') {
          conditions.push(`${fieldSql} <@ ${bind(operand)}`);
        } else if (op === 'overlaps') {
          conditions.push(`${fieldSql} && ${bind(operand)}`);
        } else {
          throw new BadRequestException('Unsupported filter operator: ' + value.op);
        }
        return;
      }

      conditions.push(`${fieldSql} = ${bind(value)}`);
    };

    const updateRows = async (
      updatePayload: Record<string, unknown>,
      selector: { id?: string; ids?: string[]; filters?: Record<string, unknown> }
    ) => {
      const entries = Object.entries(updatePayload).filter(([, value]) => value !== undefined);
      if (!entries.length) throw new BadRequestException('No writable update fields were provided.');

      const values: unknown[] = [];
      const setSql = entries.map(([field, value]) => {
        values.push(value);
        return `${quoteIdentifier(field, 'column')} = $${values.length}`;
      });
      const conditions: string[] = [];

      if (selector.id) {
        appendFilter(conditions, values, primaryKey, selector.id);
      } else if (selector.ids?.length) {
        appendFilter(conditions, values, primaryKey, selector.ids);
      } else {
        for (const [field, value] of Object.entries(selector.filters ?? {})) {
          appendFilter(conditions, values, field, value);
        }
      }

      const selectorConditionCount = conditions.length;
      if (ctx.resource.accountField) {
        appendFilter(
          conditions,
          values,
          ctx.resource.accountField,
          this.accountValue(ctx.context, ctx.resource.accountField)
        );
      }
      if (ctx.resource.ownerField && ctx.user) {
        appendFilter(conditions, values, ctx.resource.ownerField, ctx.user.id);
      }
      if (!selectorConditionCount) {
        throw new BadRequestException('At least one effective update condition is required.');
      }

      const result = await client.query(
        `update ${quoteRelation(ctx.resource.tableName, 'tableName')} ` +
          `set ${setSql.join(', ')} where ${conditions.join(' and ')} returning *`,
        values
      );
      return result.rows as Record<string, unknown>[];
    };

    const replaceDetails = async (
      parent: Record<string, unknown>,
      detailGroups: PreparedDetail[]
    ) => {
      for (const detail of detailGroups) {
        const parentValue = parent[detail.parentKey];
        if (parentValue === undefined || parentValue === null) {
          throw new BadRequestException(
            `Parent field ${detail.parentKey} is required for detail resource ${detail.resourceName}.`
          );
        }

        const deleteValues: unknown[] = [parentValue];
        const deleteConditions = [
          `${quoteIdentifier(detail.foreignKey, 'detail foreignKey')} = $1`
        ];
        if (detail.resource.accountField) {
          deleteValues.push(this.accountValue(ctx.context, detail.resource.accountField));
          deleteConditions.push(
            `${quoteIdentifier(detail.resource.accountField, 'detail account field')} = $${deleteValues.length}`
          );
        }
        for (const field of detail.inheritFields) {
          if (parent[field] === undefined) {
            throw new BadRequestException(
              `Parent field ${field} is required for detail resource ${detail.resourceName}.`
            );
          }
          deleteValues.push(parent[field]);
          deleteConditions.push(
            `${quoteIdentifier(field, 'detail inherit field')} = $${deleteValues.length}`
          );
        }

        await client.query(
          `delete from ${quoteRelation(detail.resource.tableName, 'detail tableName')} ` +
            `where ${deleteConditions.join(' and ')}`,
          deleteValues
        );

        const linkedPayloads = detail.payloads.map((detailPayload) => {
          const linkedPayload = { ...detailPayload, [detail.foreignKey]: parentValue };
          for (const field of detail.inheritFields) {
            linkedPayload[field] = parent[field];
          }
          this.assertRequiredFields(
            linkedPayload,
            detail.resource.create?.requiredFields ?? []
          );
          return linkedPayload;
        });
        await insertRows(detail.resource.tableName, linkedPayloads);
      }
    };

    try {
      await client.query('begin');
      transactionStarted = true;
      if (ctx.resource.clientMode !== 'admin' && ctx.user) {
        await client.query(
          `select
            set_config('request.jwt.claims', $1, true),
            set_config('request.jwt.claim.sub', $2, true),
            set_config('request.jwt.claim.role', 'authenticated', true)`,
          [JSON.stringify({ sub: ctx.user.id, role: 'authenticated' }), ctx.user.id]
        );
        await client.query('set local role authenticated');
      }

      if (isBatchUpdate) {
        const updatedRows: Record<string, unknown>[] = [];
        for (const item of preparedBatchItems) {
          const [updated] = await updateRows(item.payload, { id: item.itemId });
          if (!updated) {
            throw new BadRequestException(
              `No ${ctx.resourceName} row matched ${primaryKey}: ${item.itemId}.`
            );
          }
          await replaceDetails(updated, item.details);
          updatedRows.push(updated);
        }

        await client.query('commit');
        transactionStarted = false;
        return updatedRows;
      }

      const updatedRows = await updateRows(payload ?? {}, {
        ...(id ? { id } : {}),
        ...(!id && ids.length ? { ids } : {}),
        ...(!id && !ids.length ? { filters } : {})
      });
      if (details.length) {
        const [updated] = updatedRows;
        if (!updated) {
          throw new BadRequestException(
            `No ${ctx.resourceName} row matched ${primaryKey}: ${id}.`
          );
        }
        await replaceDetails(updated, details);
      }
      if (afterSaveActions.length) {
        const [saved] = updatedRows;
        if (!saved) {
          throw new BadRequestException(
            `No ${ctx.resourceName} row matched ${primaryKey}: ${id}.`
          );
        }
        await this.executeAfterSaveActions(client, ctx, afterSaveActions, saved);
      }

      await client.query('commit');
      transactionStarted = false;
      return id ? updatedRows[0] : updatedRows;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('rollback');
          transactionStarted = false;
        } catch (rollbackError) {
          releaseError = rollbackError instanceof Error
            ? rollbackError
            : new Error('PostgreSQL rollback failed.');
        }
      }

      if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Update transaction failed.'
      );
    } finally {
      client.release(releaseError);
    }
  }

  protected async prepareAfterSaveActions(
    ctx: CrudContext
  ): Promise<PreparedAfterSaveUpdate[]> {
    const rawActions = ctx.input.afterSave ?? ctx.input.after_save;
    if (rawActions === undefined || rawActions === null) return [];
    if (!Array.isArray(rawActions)) {
      throw new BadRequestException('afterSave must be an array.');
    }
    if (rawActions.length > 10) {
      throw new BadRequestException('afterSave supports at most 10 actions.');
    }

    const prepared: PreparedAfterSaveUpdate[] = [];
    for (const [index, rawAction] of rawActions.entries()) {
      if (!this.isRecord(rawAction)) {
        throw new BadRequestException(`afterSave[${index}] must be an object.`);
      }

      const action = this.readOptionalString(rawAction.action);
      if (action !== 'update') {
        throw new BadRequestException(
          `Unsupported afterSave[${index}].action: ${action || '(empty)'}.`
        );
      }

      const relationName = this.readOptionalString(rawAction.resource);
      if (!relationName) {
        throw new BadRequestException(`afterSave[${index}].resource is required.`);
      }
      const relation = ctx.resource.afterSaveRelations?.[relationName];
      if (!relation || !relation.actions.includes(action)) {
        throw new BadRequestException(
          `afterSave update resource ${relationName} is not configured for ${ctx.resourceName}.`
        );
      }

      const resolved = this.tryResolveResource({
        resource: relation.resource ?? relationName
      });
      if (!resolved?.config.update) {
        throw new BadRequestException(
          `Unsupported afterSave update resource: ${relationName}.`
        );
      }
      if (
        (resolved.config.clientMode ?? 'user') !==
        (ctx.resource.clientMode ?? 'user')
      ) {
        throw new BadRequestException(
          `afterSave resource ${relationName} must use the same clientMode as ${ctx.resourceName}.`
        );
      }
      this.assertSameAccountScope(ctx.resource, resolved.config, relationName);

      if (!this.isRecord(rawAction.data) || !Object.keys(rawAction.data).length) {
        throw new BadRequestException(`afterSave[${index}].data must be a non-empty object.`);
      }
      const data = rawAction.data;
      for (const [field, value] of Object.entries(data)) {
        this.assertIdentifier(field, `afterSave[${index}].data field`);
        if (!relation.allowedFields.includes(field)) {
          throw new BadRequestException(
            `afterSave[${index}].data field ${field} is not allowed.`
          );
        }
        if (
          resolved.config.update.allowedFields &&
          !resolved.config.update.allowedFields.includes(field)
        ) {
          throw new BadRequestException(
            `${field} is not writable on afterSave resource ${relationName}.`
          );
        }
        this.assertAfterSaveReferences(value, `afterSave[${index}].data.${field}`);
      }

      if (!this.isRecord(rawAction.where) || !Object.keys(rawAction.where).length) {
        throw new BadRequestException(`afterSave[${index}].where must be a non-empty object.`);
      }
      const where = rawAction.where;
      const allowedWhereFields = relation.allowedWhereFields ?? [
        this.primaryKey(resolved.config)
      ];
      for (const [field, value] of Object.entries(where)) {
        this.assertIdentifier(field, `afterSave[${index}].where field`);
        if (!allowedWhereFields.includes(field)) {
          throw new BadRequestException(
            `afterSave[${index}].where field ${field} is not allowed.`
          );
        }
        this.assertAfterSaveWhereValue(value, `afterSave[${index}].where.${field}`);
      }

      const targetContext: CrudContext = {
        ...ctx,
        action: 'update',
        resourceName: resolved.name,
        resource: resolved.config,
        input: { ...ctx.input, resource: resolved.name, data },
        data,
        filters: where,
        id: undefined,
        ids: [],
        result: undefined,
        meta: {}
      };
      await this.assertPermission(targetContext);
      const payload = await this.buildWritePayload(targetContext, 'update', data);
      this.assertRequiredFields(payload, resolved.config.update.requiredFields ?? []);

      const rawExpected = rawAction.expect ??
        rawAction.expectedAffectedRows ??
        rawAction.expected_affected_rows;
      const expectedAffectedRows = rawExpected === undefined
        ? 1
        : typeof rawExpected === 'number' && Number.isInteger(rawExpected) && rawExpected >= 0
          ? rawExpected
          : NaN;
      if (!Number.isInteger(expectedAffectedRows)) {
        throw new BadRequestException(
          `afterSave[${index}].expect must be a non-negative integer.`
        );
      }

      prepared.push({
        action,
        resourceName: resolved.name,
        resource: resolved.config,
        data: payload,
        where,
        expectedAffectedRows
      });
    }

    return prepared;
  }

  protected async executeAfterSaveActions(
    client: PoolClient,
    ctx: CrudContext,
    actions: PreparedAfterSaveUpdate[],
    saved: Record<string, unknown>
  ) {
    const quoteIdentifier = (value: string, fieldName: string) => {
      this.assertIdentifier(value, fieldName);
      return `"${value}"`;
    };
    const quoteRelation = (value: string, fieldName: string) => {
      const parts = value.split('.').map((part) => part.trim()).filter(Boolean);
      if (parts.length < 1 || parts.length > 2) {
        throw new BadRequestException(fieldName + ' must be table or schema.table.');
      }
      return parts.map((part) => quoteIdentifier(part, fieldName)).join('.');
    };

    for (const [index, action] of actions.entries()) {
      const data = this.resolveAfterSaveReferences(action.data, saved);
      const where = this.resolveAfterSaveReferences(action.where, saved);
      const dataEntries = Object.entries(data).filter(([, value]) => value !== undefined);
      if (!dataEntries.length) {
        throw new BadRequestException(`afterSave[${index}] has no resolved update fields.`);
      }

      const values: unknown[] = [];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      const setSql = dataEntries.map(([field, value]) =>
        `${quoteIdentifier(field, 'afterSave data field')} = ${bind(value)}`
      );
      const conditions = Object.entries(where).map(([field, value]) => {
        const fieldSql = quoteIdentifier(field, 'afterSave where field');
        return value === null ? `${fieldSql} is null` : `${fieldSql} = ${bind(value)}`;
      });
      if (action.resource.accountField) {
        conditions.push(
          `${quoteIdentifier(action.resource.accountField, 'afterSave account field')} = ${bind(
            this.accountValue(ctx.context, action.resource.accountField)
          )}`
        );
      }
      if (action.resource.ownerField && ctx.user) {
        conditions.push(
          `${quoteIdentifier(action.resource.ownerField, 'afterSave owner field')} = ${bind(ctx.user.id)}`
        );
      }
      if (!conditions.length) {
        throw new BadRequestException(`afterSave[${index}] requires an effective where condition.`);
      }

      const result = await client.query(
        `update ${quoteRelation(action.resource.tableName, 'afterSave tableName')} ` +
          `set ${setSql.join(', ')} where ${conditions.join(' and ')} returning *`,
        values
      );
      const affectedRows = result.rowCount ?? result.rows.length;
      if (
        action.expectedAffectedRows !== undefined &&
        affectedRows !== action.expectedAffectedRows
      ) {
        throw new ConflictException(
          `afterSave[${index}] expected ${action.expectedAffectedRows} affected row(s), ` +
          `but updated ${affectedRows}.`
        );
      }
    }
  }

  protected assertAfterSaveReferences(value: unknown, fieldName: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.assertAfterSaveReferences(item, `${fieldName}[${index}]`)
      );
      return;
    }
    if (!this.isRecord(value)) return;

    if (Object.prototype.hasOwnProperty.call(value, '$ref')) {
      if (Object.keys(value).length !== 1) {
        throw new BadRequestException(`${fieldName} reference must only contain $ref.`);
      }
      const reference = this.readOptionalString(value.$ref);
      if (!/^saved(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(reference)) {
        throw new BadRequestException(
          `${fieldName}.$ref must use the saved.<field> format.`
        );
      }
      return;
    }

    for (const [field, nested] of Object.entries(value)) {
      this.assertAfterSaveReferences(nested, `${fieldName}.${field}`);
    }
  }

  protected assertAfterSaveWhereValue(value: unknown, fieldName: string) {
    this.assertAfterSaveReferences(value, fieldName);
    if (
      Array.isArray(value) ||
      (this.isRecord(value) && !Object.prototype.hasOwnProperty.call(value, '$ref'))
    ) {
      throw new BadRequestException(
        `${fieldName} must be a scalar, null, or a saved.<field> reference.`
      );
    }
  }

  protected resolveAfterSaveReferences(
    value: Record<string, unknown>,
    saved: Record<string, unknown>
  ): Record<string, unknown>;
  protected resolveAfterSaveReferences(value: unknown, saved: Record<string, unknown>): any;
  protected resolveAfterSaveReferences(value: unknown, saved: Record<string, unknown>): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveAfterSaveReferences(item, saved));
    }
    if (!this.isRecord(value)) return value;

    if (Object.prototype.hasOwnProperty.call(value, '$ref')) {
      const reference = this.readOptionalString(value.$ref);
      const path = reference.split('.').slice(1);
      let resolved: unknown = saved;
      for (const field of path) {
        resolved = this.isRecord(resolved) ? resolved[field] : undefined;
      }
      if (resolved === undefined) {
        throw new BadRequestException(`Could not resolve afterSave reference: ${reference}.`);
      }
      return resolved;
    }

    return Object.fromEntries(
      Object.entries(value).map(([field, nested]) => [
        field,
        this.resolveAfterSaveReferences(nested, saved)
      ])
    );
  }

  protected readBatchUpdateDataItems(ctx: CrudContext) {
    const rawItems = ctx.input.data ?? ctx.input.items ?? ctx.input.rows;
    if (!Array.isArray(rawItems)) return [] as Record<string, unknown>[];
    return rawItems.filter(this.isRecord) as Record<string, unknown>[];
  }

  protected async performDelete(ctx: CrudContext) {
    const id = ctx.id;
    const ids = ctx.ids.filter((item) => item !== id);
    const filters = this.readRecord(ctx.filters);
    const hasFilters = Object.keys(filters).length > 0;
    if (!id && !ids.length && !hasFilters) {
      throw new BadRequestException('id, ids, or filters is required.');
    }

    const deleteConfig = ctx.resource.delete ?? {};
    let query;

    if (deleteConfig.softDelete) {
      const payload: Record<string, unknown> = {};
      payload[deleteConfig.deletedAtField ?? 'deleted_at'] = new Date().toISOString();
      if (deleteConfig.statusField && deleteConfig.deletedStatus) {
        payload[deleteConfig.statusField] = deleteConfig.deletedStatus;
      }
      if (deleteConfig.userFields?.deletedBy && ctx.user) {
        payload[deleteConfig.userFields.deletedBy] = ctx.user.id;
      }
      query = ctx.client.from(ctx.resource.tableName).update(payload);
    } else {
      query = ctx.client.from(ctx.resource.tableName).delete();
    }

    if (id) {
      query = query.eq(this.primaryKey(ctx.resource), id);
    } else if (ids.length) {
      query = query.in(this.primaryKey(ctx.resource), ids);
    } else {
      for (const [field, value] of Object.entries(filters)) {
        query = this.applySupabaseFilter(query, field, value);
      }
    }

    if (ctx.resource.ownerField && ctx.user) {
      query = query.eq(ctx.resource.ownerField, ctx.user.id);
    }

    if (ctx.resource.accountField) {
      query = query.eq(
        ctx.resource.accountField,
        this.accountValue(ctx.context, ctx.resource.accountField)
      );
    }

    const { error } = await query;
    if (error) throw new BadRequestException(error.message);
    return { success: true, ...(id ? { id } : {}), ...(ids.length ? { ids } : {}), ...(!id && !ids.length ? { filters } : {}) };
  }

  protected async buildWritePayload(
    ctx: CrudContext,
    action: 'create' | 'update',
    sourceOverride?: Record<string, unknown>
  ) {
    const actionConfig = action === 'create' ? ctx.resource.create : ctx.resource.update;
    const allowedFields = actionConfig?.allowedFields;
    const payload: Record<string, unknown> = {};
    const source = sourceOverride ?? ctx.data;

    for (const [field, value] of Object.entries(source)) {
      if (!allowedFields || allowedFields.includes(field)) {
        payload[field] = value;
      }
    }

    if (action === 'create') {
      const defaults = typeof ctx.resource.defaults === 'function'
        ? await ctx.resource.defaults(ctx)
        : ctx.resource.defaults ?? {};
      Object.assign(payload, { ...defaults, ...payload });
    }

    if (actionConfig?.timestamp !== false) {
      const now = new Date().toISOString();
      payload.updated_at = now;
      if (action === 'create') payload.created_at = payload.created_at ?? now;
    }

    const userFields = actionConfig?.userFields;
    if (ctx.user && userFields) {
      if (action === 'create' && userFields.createdBy) payload[userFields.createdBy] = ctx.user.id;
      if (userFields.updatedBy) payload[userFields.updatedBy] = ctx.user.id;
      if (userFields.owner && !payload[userFields.owner]) payload[userFields.owner] = ctx.user.id;
    }

    if (ctx.resource.ownerField && ctx.user && action === 'create') {
      payload[ctx.resource.ownerField] = payload[ctx.resource.ownerField] ?? ctx.user.id;
    }

    if (ctx.resource.accountField) {
      payload[ctx.resource.accountField] = this.accountValue(
        ctx.context,
        ctx.resource.accountField
      );
    }

    return payload;
  }

  protected async assertPermission(ctx: CrudContext) {
    const required = ctx.resource.permissions?.[ctx.action];
    if (!required) return;
    if (!ctx.user) throw new ForbiddenException('Permission required.');
    const authorization = await getUserAuthorization(ctx.client, ctx.user.id, {
      accountId: ctx.context.accountId,
      refresh: true
    });
    if (!hasRequiredPermission(authorization, required)) {
      throw new ForbiddenException('Permission required: ' + ([] as string[]).concat(required).join(', '));
    }
  }

  protected async runHooks(ctx: HookContext, names: Array<keyof ResourceHooks>) {
    const hooks = this.hooks()[ctx.resourceName] ?? {};
    for (const name of names) {
      const handlers = hooks[name];
      const handlerList = Array.isArray(handlers) ? handlers : handlers ? [handlers] : [];
      for (const handler of handlerList) {
        await handler(ctx);
      }
    }
  }

  protected hookName(prefix: 'before' | 'after', action: CrudAction): keyof ResourceHooks {
    const suffix = action.charAt(0).toUpperCase() + action.slice(1);
    return (prefix + suffix) as keyof ResourceHooks;
  }

  protected fromTable(client: SupabaseClient, tableName: string) {
    const parts = tableName.split('.').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) {
      this.assertIdentifier(parts[0], 'tableName.schema');
      this.assertIdentifier(parts[1], 'tableName.name');
      return client.schema(parts[0]).from(parts[1]);
    }

    if (parts.length !== 1) {
      throw new BadRequestException('tableName must be table or schema.table.');
    }

    this.assertIdentifier(parts[0], 'tableName');
    return client.from(parts[0]);
  }

  protected applyListItemsFilters(query: any, filters: unknown) {
    if (!this.isRecord(filters)) return query;

    for (const [field, value] of Object.entries(filters)) {
      this.assertIdentifierPath(field, 'filter field');
      query = this.applySupabaseFilter(query, field, value);
    }

    return query;
  }

  protected applyListItemsSearch(query: any, postData: ServicePostData) {
    const search = this.readOptionalString(postData.search);
    if (!search) return query;

    const fields = this.readStringArray(postData.searchFields ?? postData.search_fields);
    if (!fields.length) return query;

    const escapedSearch = this.escapePostgrestFilterValue(search);
    const orExpression = fields
      .map((field) => {
        this.assertIdentifierPath(field, 'search field');
        return field + '.ilike.%' + escapedSearch + '%';
      })
      .join(',');

    return query.or(orExpression);
  }

  protected readListItemsSorts(postData: ServicePostData): Required<ListSort>[] {
    const inputSorts = Array.isArray(postData.sorts) ? postData.sorts : [];
    const sorts = inputSorts
      .filter((sort) => this.isRecord(sort) && this.readOptionalString(sort.field))
      .map((sort) => ({
        field: this.readOptionalString((sort as Record<string, unknown>).field),
        direction: this.readOptionalString((sort as Record<string, unknown>).direction) === 'asc' ? 'asc' : 'desc',
        nulls: this.readOptionalString((sort as Record<string, unknown>).nulls) === 'first' ? 'first' : 'last'
      } as Required<ListSort>));

    if (sorts.length) {
      sorts.forEach((sort) => this.assertIdentifierPath(sort.field, 'sort field'));
      return sorts;
    }

    const orderBy = this.readOptionalString(postData.orderBy ?? postData.order_by);
    if (!orderBy) return [];
    this.assertIdentifierPath(orderBy, 'orderBy');

    return [{
      field: orderBy,
      direction: this.readOptionalString(postData.orderDirection ?? postData.order_direction) === 'asc' ? 'asc' : 'desc',
      nulls: 'last'
    }];
  }

  protected readListItemsLimit(postData: ServicePostData) {
    const value = postData.pageSize ?? postData.page_size ?? postData.limit;
    return Math.min(Math.max(Math.trunc(this.readNumber(value, 300)), 1), 1000);
  }

  protected readListItemsOffset(postData: ServicePostData, limit: number) {
    const explicitOffset = Math.trunc(this.readNumber(postData.offset, -1));
    if (explicitOffset >= 0) return explicitOffset;
    const page = Math.min(Math.max(Math.trunc(this.readNumber(postData.page, 1)), 1), 100000);
    return (page - 1) * limit;
  }

  protected readBoolean(value: unknown, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
  }

  protected readStringArray(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    return value
      .map((item) => this.readOptionalString(item))
      .filter(Boolean);
  }

  protected assertIdentifier(value: string, fieldName: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      throw new BadRequestException(fieldName + ' must be a valid identifier.');
    }
  }

  protected assertIdentifierPath(value: string, fieldName: string) {
    value.split('.').forEach((segment) => this.assertIdentifier(segment, fieldName));
  }

  protected escapePostgrestFilterValue(value: string) {
    return value.replace(/[%(),]/g, (char) => '\\' + char);
  }

  protected applySupabaseFilter(query: any, field: string, value: unknown) {
    if (!field || value === undefined || value === '') return query;
    if (Array.isArray(value)) return value.length ? query.in(field, value) : query;
    if (value === null) return query.is(field, null);

    if (this.isRecord(value)) {
      const op = this.readOptionalString(value.op).replace(/_/g, '').toLowerCase();
      const operand = value.value;
      if (op === 'isnull') return query.is(field, null);
      if (op === 'isnotnull') return query.not(field, 'is', null);
      if (operand === undefined || operand === '') return query;
      if (op === 'eq') return query.eq(field, operand);
      if (op === 'ne') return query.neq(field, operand);
      if (op === 'gt') return query.gt(field, operand);
      if (op === 'gte') return query.gte(field, operand);
      if (op === 'lt') return query.lt(field, operand);
      if (op === 'lte') return query.lte(field, operand);
      if (op === 'in') return Array.isArray(operand) ? query.in(field, operand) : query;
      if (op === 'notin') return Array.isArray(operand) ? query.not(field, 'in', '(' + operand.join(',') + ')') : query;
      if (op === 'between') {
        const items = Array.isArray(operand) ? operand : [];
        if (items.length < 2) return query;
        return query.gte(field, items[0]).lte(field, items[1]);
      }
      if (op === 'like') return query.like(field, '%' + String(operand) + '%');
      if (op === 'ilike') return query.ilike(field, '%' + String(operand) + '%');
      if (op === 'notlike') return query.not(field, 'like', '%' + String(operand) + '%');
      if (op === 'notilike') return query.not(field, 'ilike', '%' + String(operand) + '%');
      if (op === 'startswith') return query.like(field, String(operand) + '%');
      if (op === 'endswith') return query.like(field, '%' + String(operand));
      if (op === 'contains') return query.contains(field, operand);
      if (op === 'containedby') return query.containedBy(field, operand);
      if (op === 'overlaps') return query.overlaps(field, operand);
      throw new BadRequestException('Unsupported filter operator: ' + value.op);
    }

    return query.eq(field, value);
  }

  protected readCrudSorts(ctx: CrudContext): Required<ListSort>[] {
    const inputSorts = Array.isArray(ctx.input.sorts) ? ctx.input.sorts : [];
    const sorts = inputSorts
      .filter((sort) => this.isRecord(sort) && this.readOptionalString(sort.field))
      .map((sort) => ({
        field: this.readOptionalString((sort as Record<string, unknown>).field),
        direction: this.readOptionalString((sort as Record<string, unknown>).direction) === 'asc' ? 'asc' : 'desc',
        nulls: this.readOptionalString((sort as Record<string, unknown>).nulls) === 'first' ? 'first' : 'last'
      } as Required<ListSort>));

    if (sorts.length) return sorts;
    if (ctx.resource.list?.defaultSorts?.length) {
      return ctx.resource.list.defaultSorts.map((sort) => ({
        field: sort.field,
        direction: sort.direction ?? 'desc',
        nulls: sort.nulls ?? 'last'
      }));
    }

    const orderBy = this.readOptionalString(ctx.input.orderBy ?? ctx.input.order_by) || 'created_at';
    const direction = this.readOptionalString(ctx.input.orderDirection ?? ctx.input.order_direction) === 'asc' ? 'asc' : 'desc';
    return [{ field: orderBy, direction, nulls: 'last' }];
  }

  protected readCrudLimit(postData: ServicePostData, resource: ResourceConfig) {
    const fallback = resource.list?.defaultPageSize ?? 300;
    const max = resource.list?.maxPageSize ?? 1000;
    const value = postData.pageSize ?? postData.page_size ?? postData.limit;
    return Math.min(Math.max(Math.trunc(this.readNumber(value, fallback)), 1), max);
  }

  protected readCrudOffset(postData: ServicePostData, limit: number) {
    const explicitOffset = Math.trunc(this.readNumber(postData.offset, -1));
    if (explicitOffset >= 0) return explicitOffset;
    const page = Math.min(Math.max(Math.trunc(this.readNumber(postData.page, 1)), 1), 100000);
    return (page - 1) * limit;
  }

  protected readDataPayload(postData: ServicePostData) {
    const data = this.readRecord(postData.data);
    if (Object.keys(data).length) return data;
    const reserved = new Set([
      'resource', 'itemType', 'item_type', 'type', 'entityCode', 'entity_code', 'tableName', 'table_name',
      'operation', 'actionName', 'action_name', 'action',
      'id', 'ids', 'data', 'items', 'rows', 'filters', 'requiredFilters', 'required_filters', 'search', 'searchFields', 'search_fields',
      'limit', 'page', 'pageSize', 'page_size', 'offset', 'orderBy', 'order_by', 'orderDirection',
      'order_direction', 'sorts', 'withCount', 'with_count', 'responseMode', 'response_mode',
      'afterSave', 'after_save', 'clientMode', 'client_mode'
    ]);
    return Object.fromEntries(Object.entries(postData).filter(([key]) => !reserved.has(key)));
  }

  protected assertRequiredFields(payload: Record<string, unknown>, fields: string[]) {
    for (const field of fields) {
      const value = payload[field];
      if (value === undefined || value === null || value === '') {
        throw new BadRequestException('Missing required field: ' + field);
      }
    }
  }

  protected resolveResource(postData: ServicePostData) {
    const itemType = this.readListItemsType(postData);
    const resource = this.tryResolveResource(postData, itemType);
    if (!resource) throw new BadRequestException('Unsupported ' + this.serviceLabel() + ' resource: ' + itemType);
    return resource;
  }

  protected tryResolveResource(postData: ServicePostData, fallback = '') {
    const resources = this.resources();
    this.assertResourceMapMatchesTables(resources);
    const resourceName = this.readOptionalString(postData.resource) || fallback;
    if (resourceName && resources[resourceName]) {
      const config = resources[resourceName];
      this.assertResourceMatchesTable(resourceName, config);
      return { name: resourceName, config: this.withResourceCode(resourceName, config) };
    }

    const entityCode = this.readOptionalString(postData.entityCode ?? postData.entity_code);
    const tableName = this.readOptionalString(postData.tableName ?? postData.table_name);
    const match = Object.entries(resources).find(([, resource]) =>
      resource.code === entityCode ||
      resource.tableName === tableName ||
      resource.tableName === 'public.' + tableName ||
      'public.' + resource.tableName === tableName
    );
    return match ? { name: match[0], config: this.withResourceCode(match[0], match[1]) } : undefined;
  }

  protected withResourceCode(name: string, resource: ResourceConfig): ResourceConfig {
    return { ...resource, code: resource.code ?? name };
  }

  protected assertResourceMatchesTable(name: string, resource: ResourceConfig) {
    const tableName = resource.tableName.split('.').map((part) => part.trim()).filter(Boolean).at(-1);
    if (name !== tableName) {
      throw new Error(
        `Resource key ${name} must match its database table name ${resource.tableName}.`
      );
    }
  }

  protected assertResourceMapMatchesTables(resources: ResourceConfigMap) {
    for (const [name, resource] of Object.entries(resources)) {
      this.assertResourceMatchesTable(name, resource);
    }
  }

  protected primaryKey(resource: ResourceConfig) {
    return resource.primaryKey ?? 'id';
  }

  protected primaryKeyFromPostData(postData: ServicePostData) {
    const resource = this.tryResolveResource(postData);
    return resource ? this.primaryKey(resource.config) : 'id';
  }

  protected readId(postData: ServicePostData, resource: ResourceConfig) {
    const primaryKey = this.primaryKey(resource);
    const data = this.readRecord(postData.data);
    return this.readOptionalString(postData.id ?? postData[primaryKey] ?? data.id ?? data[primaryKey]);
  }

  protected readIds(postData: ServicePostData, resource: ResourceConfig) {
    const primaryKey = this.primaryKey(resource);
    const data = this.readRecord(postData.data);
    const ids = Array.isArray(postData.ids) ? postData.ids : Array.isArray(data.ids) ? data.ids : [];
    const primaryValue = postData[primaryKey] ?? data[primaryKey];
    const id = this.readOptionalString(postData.id ?? data.id);
    const primaryId = this.readOptionalString(primaryValue);
    return [...ids.map((item) => this.readOptionalString(item)), id, primaryId].filter(Boolean);
  }

  protected resources(): ResourceConfigMap {
    return {};
  }

  protected hooks(): ServiceHooks {
    return {};
  }

  protected listItemHandlers(): Record<string, ListItemsHandler> {
    return {};
  }

  protected async handleListItems(
    _postData: ServicePostData,
    _context: ServiceContext
  ): Promise<unknown> {
    throw new BadRequestException(
      'Unsupported ' + this.serviceLabel() + ' listItems itemType.'
    );
  }

  protected defaultListItemsType() {
    return 'default';
  }

  protected readListItemsType(postData: ServicePostData) {
    return this.readOptionalString(postData.resource ?? postData.itemType ?? postData.item_type ?? postData.type)
      || this.defaultListItemsType();
  }

  protected readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  protected readNumber(value: unknown, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  protected readRecord(value: unknown) {
    return this.isRecord(value) ? value as ServicePostData : {};
  }

  protected isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  protected readFilterString(postData: ServicePostData, field: string) {
    const filters = this.readRecord(postData.filters);
    return this.readOptionalString(postData[field] ?? filters[field]);
  }

  protected accountFieldForTable(tableName: string) {
    const normalized = tableName.split('.').at(-1) ?? '';
    if (normalized === 'sales_orders' || normalized === 'sales_order_lines') {
      return 'account_id';
    }

    const tenantScoped =
      normalized.startsWith('chat_') ||
      normalized === 'print_logs' ||
      normalized.startsWith('notification_') && normalized !== 'notification_templates' ||
      normalized.startsWith('wf_') && ![
        'wf_model_version',
        'wf_node_definition',
        'wf_edge_definition',
        'wf_node_instance',
        'wf_task_candidate',
        'wf_variable'
      ].includes(normalized);

    return tenantScoped ? 'account_id' : '';
  }

  protected assertSameAccountScope(
    parent: ResourceConfig,
    child: ResourceConfig,
    relationName: string
  ) {
    if (!parent.accountField && !child.accountField) return;
    if (!parent.accountField || !child.accountField) {
      throw new BadRequestException(
        `Account-scoped relation ${relationName} must configure accountField on both resources.`
      );
    }
  }

  protected accountValue(context: ServiceContext, _accountField: string) {
    if (!context.accountId) {
      throw new ForbiddenException('An active account set is required.');
    }
    return context.accountId;
  }

  protected assertAccountPayload(
    resource: ResourceConfig,
    context: ServiceContext,
    data: Record<string, unknown>
  ) {
    if (!resource.accountField) return;
    const expected = this.accountValue(context, resource.accountField);
    const supplied = data[resource.accountField];
    if (supplied !== undefined && supplied !== null && String(supplied) !== expected) {
      throw new ForbiddenException('The requested data belongs to a different account set.');
    }
    data[resource.accountField] = expected;
  }

  private serviceLabel() {
    return this.constructor.name.replace(/Service$/, '') || 'service';
  }
}
