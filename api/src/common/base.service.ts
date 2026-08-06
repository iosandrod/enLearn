import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { ServiceContext, ServiceExecutor } from './interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission
} from './utils/supabase';

const DYNAMIC_CRUD_RPC = 'execute_dynamic_crud';

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

export type ResourceDatabaseHooks = Partial<Record<
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeUpdate'
  | 'afterUpdate'
  | 'beforeDelete'
  | 'afterDelete',
  string | string[] | ResourceDatabaseHookConfig | ResourceDatabaseHookConfig[]
>>;

export type ResourceDatabaseHookConfig = {
  function: string;
  args?: Record<string, unknown>;
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
  internalActions?: ServiceAction[];
  primaryKey?: string;
  select?: string;
  clientMode?: 'user' | 'admin';
  ownerField?: string;
  accountField?: string;
  permissions?: ResourcePermissions;
  defaults?: Record<string, unknown> | ((ctx: CrudContext) => Record<string, unknown> | Promise<Record<string, unknown>>);
  detailRelations?: Record<string, ResourceDetailRelation>;
  afterSaveRelations?: Record<string, ResourceAfterSaveRelation>;
  databaseHooks?: ResourceDatabaseHooks;
  databaseHookInputFields?: string[];
  transactionalHooks?: boolean;
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
          this.assertPublicResourceAccess(postData, 'list');
          return this.listItems(postData, context);
        case 'createItem':
          this.assertPublicResourceAccess(postData, 'create');
          return this.createItem(postData, context);
        case 'updateItem':
          this.assertPublicResourceAccess(postData, 'update');
          return this.updateItem(postData, context);
        case 'deleteItem':
          this.assertPublicResourceAccess(postData, 'delete');
          return this.deleteItem(postData, context);
        case 'saveItem':
          {
            const publicResource = this.tryResolveResource(postData);
            const primaryKey = publicResource
              ? this.primaryKey(publicResource.config)
              : 'id';
            const data = this.readRecord(postData.data);
            this.assertPublicResourceAccess(
              postData,
              this.readOptionalString(
                postData.id ?? postData[primaryKey] ?? data.id ?? data[primaryKey]
              )
                ? 'update'
                : 'create'
            );
          }
          return this.saveItem(postData, context);
        case 'runAction':
          this.assertPublicResourceAccess(postData, 'action');
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
      const databaseOwnedWriteHooks =
        action !== 'list' && ctx.resource.transactionalHooks === true;
      await this.runHooks(ctx, [
        'beforeAction',
        ...(databaseOwnedWriteHooks ? [] : [this.hookName('before', action)])
      ]);
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
    return (await getCurrentUser(context)).client;
  }

  protected assertPublicResourceAccess(
    postData: ServicePostData,
    action: ServiceAction
  ) {
    const resource = this.tryResolveResource(postData);
    if (resource?.config.internalActions?.includes(action)) {
      throw new ForbiddenException(
        `${action} on resource ${resource.name} is only available through its service method.`
      );
    }
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

  protected serializeDynamicResourceConfig(resourceName: string, resource: ResourceConfig) {
    const hooks = Object.fromEntries(
      Object.entries(resource.databaseHooks ?? {}).map(([name, handlers]) => [
        name,
        ([] as Array<string | ResourceDatabaseHookConfig>)
          .concat(handlers ?? [])
          .map((handler) => {
          const functionName = typeof handler === 'string' ? handler : handler.function;
          this.assertIdentifierPath(functionName, `databaseHooks.${name}`);
          return {
            function: functionName,
            args: typeof handler === 'string' ? {} : handler.args ?? {}
          };
        })
      ])
    );

    const serializeAction = (
      action: 'create' | 'update' | 'delete',
      config: ResourceActionConfig | ResourceDeleteConfig | undefined
    ) => {
      if (!config) return null;

      const managedFields = new Set<string>();
      if (action !== 'delete' && config.timestamp !== false) {
        managedFields.add('updated_at');
        if (action === 'create') managedFields.add('created_at');
      }
      if (action === 'create' && config.userFields?.createdBy) {
        managedFields.add(config.userFields.createdBy);
      }
      if (action !== 'delete' && config.userFields?.updatedBy) {
        managedFields.add(config.userFields.updatedBy);
      }
      if (action !== 'delete' && config.userFields?.owner) {
        managedFields.add(config.userFields.owner);
      }
      if (action === 'delete' && config.userFields?.deletedBy) {
        managedFields.add(config.userFields.deletedBy);
      }
      if (action === 'create' && resource.ownerField) managedFields.add(resource.ownerField);
      if (action !== 'delete' && resource.accountField) managedFields.add(resource.accountField);

      const deleteConfig = action === 'delete' ? config as ResourceDeleteConfig : undefined;
      const deleteAllowedFields = deleteConfig?.softDelete
        ? [
            deleteConfig.deletedAtField ?? 'deleted_at',
            ...(deleteConfig.statusField ? [deleteConfig.statusField] : []),
            ...(deleteConfig.userFields?.deletedBy
              ? [deleteConfig.userFields.deletedBy]
              : [])
          ]
        : [];

      return {
        allowed_fields: action === 'delete'
          ? [...new Set([...deleteAllowedFields, ...managedFields])]
          : config.allowedFields
            ? [...new Set([...config.allowedFields, ...managedFields])]
            : null,
        input_allowed_fields: action === 'delete' ? [] : config.allowedFields ?? null,
        managed_fields: [...managedFields],
        hook_input_fields: resource.databaseHookInputFields ?? [],
        required_fields: config.requiredFields ?? [],
        timestamp: action !== 'delete' && config.timestamp !== false,
        ...(deleteConfig
          ? {
              soft_delete: deleteConfig.softDelete === true,
              deleted_at_field: deleteConfig.deletedAtField ?? 'deleted_at',
              status_field: deleteConfig.statusField ?? null,
              deleted_status: deleteConfig.deletedStatus ?? null,
              deleted_by_field: deleteConfig.userFields?.deletedBy ?? null
            }
          : {})
      };
    };

    return {
      code: resource.code ?? resourceName,
      table_name: resource.tableName,
      primary_key: this.primaryKey(resource),
      owner_field: resource.ownerField ?? null,
      account_field: resource.accountField ?? null,
      client_mode: resource.clientMode ?? 'user',
      hooks,
      create: serializeAction('create', resource.create),
      update: serializeAction('update', resource.update),
      delete: serializeAction('delete', resource.delete)
    };
  }

  protected buildDynamicCrudConfig(ctx: CrudContext) {
    const resources = this.resources();
    const included = new Set<string>([ctx.resourceName]);

    for (const [name, relation] of Object.entries(ctx.resource.detailRelations ?? {})) {
      included.add(relation.resource ?? name);
    }
    for (const relation of Object.entries(ctx.resource.afterSaveRelations ?? {})) {
      included.add(relation[1].resource ?? relation[0]);
    }

    const serializedResources = Object.fromEntries(
      [...included]
        .filter(Boolean)
        .map((name) => {
          const config = resources[name];
          if (!config) throw new BadRequestException(`Unknown dynamic CRUD resource: ${name}.`);
          return [name, this.serializeDynamicResourceConfig(name, config)];
        })
    );

    const config = {
      resource_name: ctx.resourceName,
      resources: serializedResources,
      detail_relations: Object.fromEntries(
        Object.entries(ctx.resource.detailRelations ?? {}).map(([name, relation]) => [
          name,
          {
            resource: relation.resource ?? name,
            foreign_key: relation.foreignKey,
            parent_key: relation.parentKey ?? this.primaryKey(ctx.resource),
            inherit_fields: relation.inheritFields ?? [],
            update_mode: relation.updateMode ?? null
          }
        ])
      ),
      after_save_relations: Object.fromEntries(
        Object.entries(ctx.resource.afterSaveRelations ?? {}).map(([name, relation]) => [
          name,
          {
            resource: relation.resource ?? name,
            actions: relation.actions,
            allowed_fields: relation.allowedFields,
            allowed_where_fields: relation.allowedWhereFields ?? null
          }
        ])
      )
    };
    return {
      ...config,
      config_hash: this.hashDynamicCrudConfig(config)
    };
  }

  protected hashDynamicCrudConfig(value: unknown) {
    const stableJson = JSON.stringify(value, (_key, nested) => {
      if (!nested || Array.isArray(nested) || typeof nested !== 'object') return nested;
      return Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0
      ));
    });
    return createHash('sha256').update(stableJson).digest('hex');
  }

  protected async callDynamicCrudRpc(
    ctx: CrudContext,
    action: 'create' | 'update' | 'delete',
    operation: Record<string, unknown>
  ) {
    if (ctx.resource.clientMode === 'admin' && !ctx.context.authorization) {
      throw new ForbiddenException(
        'Authenticated request context is required for admin-mode CRUD.'
      );
    }
    const hookInput = action === 'delete'
      ? {}
      : {
          ...this.buildDatabaseHookInput(ctx.resource, this.readRecord(ctx.input.data)),
          ...this.buildDatabaseHookInput(ctx.resource, ctx.input)
        };
    const config = this.buildDynamicCrudConfig(ctx);
    if (ctx.context.authorization) {
      const adminClient = createSupabaseClient('admin', ctx.context);
      const { data: registeredHash, error: hashError } = await adminClient.rpc(
        'get_dynamic_crud_resource_hash',
        {
          p_resource_name: ctx.resourceName,
          p_table_name: ctx.resource.tableName
        }
      );
      if (hashError || registeredHash !== config.config_hash) {
        const { error: registrationError } = await adminClient.rpc(
          'register_dynamic_crud_resource',
          {
            p_resource_name: ctx.resourceName,
            p_table_name: ctx.resource.tableName,
            p_config_hash: config.config_hash,
            p_config: config
          }
        );
        if (registrationError) {
          throw new BadRequestException(
            `Could not register dynamic CRUD resource: ${registrationError.message}`
          );
        }
      }
    }
    const userClient = ctx.context.authorization && ctx.resource.clientMode !== 'admin'
      ? (await getCurrentUser(ctx.context)).client
      : undefined;
    const rpcClient = ctx.resource.clientMode === 'admin'
      ? ctx.client
      : userClient ?? ctx.client;
    const { data, error } = await rpcClient.rpc(DYNAMIC_CRUD_RPC, {
      p_action: action,
      p_table_name: ctx.resource.tableName,
      p_config: config,
      p_operation: {
        ...operation,
        hook_input: hookInput,
        ...(ctx.user?.id ? { actor_user_id: ctx.user.id } : {})
      },
      p_account_id: ctx.context.accountId ?? null
    });

    if (error) {
      if (error.code === '42501') throw new ForbiddenException(error.message);
      if (error.code === 'P0001' && /expected .* affected row/i.test(error.message)) {
        throw new ConflictException(error.message);
      }
      throw new BadRequestException(error.message);
    }

    return data;
  }

  protected buildDatabaseHookInput(
    resource: ResourceConfig,
    source: Record<string, unknown>
  ) {
    return Object.fromEntries(
      (resource.databaseHookInputFields ?? [])
        .filter((field) => {
          this.assertIdentifier(field, 'databaseHookInputFields');
          return Object.prototype.hasOwnProperty.call(source, field);
        })
        .map((field) => [field, source[field]])
    );
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
      hookInput: Record<string, unknown>;
      details: PreparedDetail[];
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
        if (!ctx.resource.transactionalHooks) {
          this.assertRequiredFields(payload, ctx.resource.create?.requiredFields ?? []);
        }
        return {
          payload,
          hookInput: this.buildDatabaseHookInput(ctx.resource, source),
          details
        };
      })
    );
    const afterSaveActions = await this.prepareAfterSaveActions(ctx);
    if (afterSaveActions.length && preparedItems.length !== 1) {
      throw new BadRequestException('afterSave requires exactly one saved item.');
    }

    return this.callDynamicCrudRpc(ctx, 'create', {
      items: preparedItems.map((item) => ({
        data: item.payload,
        ...(Object.keys(item.hookInput).length ? { hook_input: item.hookInput } : {}),
        details: item.details.map((detail) => ({
          resource: detail.resourceName,
          foreign_key: detail.foreignKey,
          parent_key: detail.parentKey,
          inherit_fields: detail.inheritFields,
          rows: detail.payloads
        }))
      })),
      after_save: afterSaveActions.map((action) => ({
        action: action.action,
        resource: action.resourceName,
        data: action.data,
        where: action.where,
        expect: action.expectedAffectedRows
      }))
    });
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
      hookInput: Record<string, unknown>;
      details: PreparedDetail[];
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
          return {
            itemId,
            payload: itemPayload,
            hookInput: this.buildDatabaseHookInput(ctx.resource, source),
            details: itemDetails
          };
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
    }
    const afterSaveActions = await this.prepareAfterSaveActions(ctx);
    if (afterSaveActions.length && (isBatchUpdate || !id)) {
      throw new BadRequestException('afterSave on update requires a single id.');
    }

    const serializeDetails = (items: PreparedDetail[]) =>
      items.map((detail) => ({
        resource: detail.resourceName,
        mode: 'replace',
        foreign_key: detail.foreignKey,
        parent_key: detail.parentKey,
        inherit_fields: detail.inheritFields,
        rows: detail.payloads
      }));

    return this.callDynamicCrudRpc(ctx, 'update', {
      primary_key: primaryKey,
      batch_items: isBatchUpdate
        ? preparedBatchItems.map((item) => ({
            id: item.itemId,
            data: item.payload,
            ...(Object.keys(item.hookInput).length ? { hook_input: item.hookInput } : {}),
            details: serializeDetails(item.details)
          }))
        : [],
      data: payload ?? {},
      selector: {
        id: id ?? null,
        ids,
        filters
      },
      details: serializeDetails(details),
      after_save: afterSaveActions.map((action) => ({
        action: action.action,
        resource: action.resourceName,
        data: action.data,
        where: action.where,
        expect: action.expectedAffectedRows
      })),
      return_single: Boolean(id)
    });
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

    return this.callDynamicCrudRpc(ctx, 'delete', {
      selector: {
        id: id ?? null,
        ids,
        filters
      },
      return_single: Boolean(id)
    });
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
