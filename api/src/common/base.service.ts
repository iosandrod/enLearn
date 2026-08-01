import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { ServiceContext, ServiceExecutor } from './interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission
} from './utils/supabase';

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
  clientMode?: unknown;
  client_mode?: unknown;
  [key: string]: unknown;
}

export type CrudAction = 'list' | 'create' | 'update' | 'delete';

export type ResourcePermissions = Partial<Record<CrudAction, string | string[]>>;

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

export type ResourceConfig = {
  code?: string;
  tableName: string;
  primaryKey?: string;
  select?: string;
  clientMode?: 'user' | 'admin';
  ownerField?: string;
  permissions?: ResourcePermissions;
  defaults?: Record<string, unknown> | ((ctx: CrudContext) => Record<string, unknown> | Promise<Record<string, unknown>>);
  list?: ResourceListConfig;
  create?: ResourceActionConfig;
  update?: ResourceActionConfig;
  delete?: ResourceDeleteConfig;
};

export type ResourceConfigMap = Record<string, ResourceConfig>;

export type HookContext = {
  action: CrudAction;
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
    const tableName = this.readOptionalString(postData.tableName ?? postData.table_name);
    if (!tableName) {
      throw new BadRequestException('tableName is required for listItems.');
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
    action: CrudAction,
    postData: ServicePostData,
    context: ServiceContext,
    resource: { name: string; config: ResourceConfig }
  ): Promise<CrudContext> {
    const client = await this.createCrudClient(resource.config, context);
    const user = await this.tryReadCurrentUser(context, resource.config);
    const data = this.readDataPayload(postData);
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
    const payloads = await Promise.all(
      sourceItems.map(async (source) => {
        const payload = await this.buildWritePayload(ctx, 'create', source);
        this.assertRequiredFields(payload, ctx.resource.create?.requiredFields ?? []);
        return payload;
      })
    );

    if (payloads.length > 1) {
      const { data, error } = await ctx.client
        .from(ctx.resource.tableName)
        .insert(payloads)
        .select(ctx.resource.select ?? '*');

      if (error) throw new BadRequestException(error.message);
      return data ?? [];
    }

    const payload = payloads[0] ?? {};

    const { data, error } = await ctx.client
      .from(ctx.resource.tableName)
      .insert(payload)
      .select(ctx.resource.select ?? '*')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
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
    if (!id) throw new BadRequestException('id is required.');
    const payload = await this.buildWritePayload(ctx, 'update');
    this.assertRequiredFields(payload, ctx.resource.update?.requiredFields ?? []);

    let query = ctx.client
      .from(ctx.resource.tableName)
      .update(payload)
      .eq(this.primaryKey(ctx.resource), id);

    if (ctx.resource.ownerField && ctx.user) {
      query = query.eq(ctx.resource.ownerField, ctx.user.id);
    }

    const { data, error } = await query
      .select(ctx.resource.select ?? '*')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
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

    return payload;
  }

  protected async assertPermission(ctx: CrudContext) {
    const required = ctx.resource.permissions?.[ctx.action];
    if (!required) return;
    if (!ctx.user) throw new ForbiddenException('Permission required.');
    const authorization = await getUserAuthorization(ctx.client, ctx.user.id);
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
      'id', 'ids', 'data', 'items', 'rows', 'filters', 'requiredFilters', 'required_filters', 'search', 'searchFields', 'search_fields',
      'limit', 'page', 'pageSize', 'page_size', 'offset', 'orderBy', 'order_by', 'orderDirection',
      'order_direction', 'sorts', 'withCount', 'with_count', 'responseMode', 'response_mode', 'clientMode', 'client_mode'
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
    const resourceName = this.readOptionalString(postData.resource) || fallback;
    if (resourceName && resources[resourceName]) {
      return { name: resourceName, config: this.withResourceCode(resourceName, resources[resourceName]) };
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

  private serviceLabel() {
    return this.constructor.name.replace(/Service$/, '') || 'service';
  }
}
