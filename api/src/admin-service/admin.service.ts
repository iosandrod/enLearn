import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BaseService,
  type HookContext,
  type ResourceConfigMap,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  clearAllUserAuthorizationCaches,
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  requireAdmin
} from '../common/utils/supabase';
import { listActiveAccountUserIds, requireActiveAccount } from '../common/utils/account-context';
import {
  ADMIN_NAVIGATION_SELECT,
  selectAuthorizedNavigationRoutes
} from './admin-navigation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, name: string, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (fallback) return fallback;
  throw new BadRequestException(`Missing required field: ${name}`);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function isMissingTableError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message?.includes('Could not find the table') ||
      error?.message?.includes('relation') && error?.message?.includes('does not exist')
  );
}

function metadataTablesRequired(error: { message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    throw new BadRequestException(
      'Admin metadata tables are not created yet. Run supabase/migrations/20260722100000_admin_metadata.sql first.'
    );
  }
}

function optionTablesRequired(error: { message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    throw new BadRequestException(
      'System option tables are not created yet. Run supabase/migrations/20260728033000_system_option_sources.sql first.'
    );
  }
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows as Record<string, unknown>[];
  return [];
}

@Injectable()
export class AdminService extends BaseService {
  protected override async listItems(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (this.isNavigationCompatibilityRequest(postData)) {
      return this.listNavigationRoutes(context);
    }

    return super.listItems(postData, context);
  }

  protected override async executeAction(
    method: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (method === 'listAccountLoginUsers') {
      return this.listAccountLoginUsers(context);
    }

    if (method === 'listNavigationRoutes') {
      return this.listNavigationRoutes(context);
    }

    return super.executeAction(method, postData, context);
  }

  protected override resources(): ResourceConfigMap {
    const salesOrderFields = [
      'account_id',
      'external_source',
      'external_id',
      'external_doc_id',
      'external_doc_no',
      'doc_no',
      'doc_type_code',
      'doc_type_name',
      'doc_date',
      'business_date',
      'status',
      'approval_status',
      'close_status',
      'hold_status',
      'org_code',
      'org_name',
      'sales_org_code',
      'sales_org_name',
      'sales_department_code',
      'sales_department_name',
      'salesperson_code',
      'salesperson_name',
      'operator_code',
      'operator_name',
      'customer_id',
      'customer_code',
      'customer_name',
      'invoice_customer_code',
      'invoice_customer_name',
      'payer_customer_code',
      'payer_customer_name',
      'ship_to_customer_code',
      'ship_to_customer_name',
      'contact_name',
      'contact_phone',
      'delivery_address',
      'currency_code',
      'currency_name',
      'exchange_rate',
      'price_includes_tax',
      'payment_terms_code',
      'payment_terms_name',
      'settlement_method_code',
      'settlement_method_name',
      'trade_terms_code',
      'trade_terms_name',
      'delivery_terms_code',
      'delivery_terms_name',
      'price_list_code',
      'price_list_name',
      'total_qty',
      'total_amount',
      'discount_amount',
      'tax_exclusive_amount',
      'tax_amount',
      'tax_inclusive_amount',
      'local_currency_amount',
      'source_doc_type',
      'source_doc_id',
      'source_doc_no',
      'remark',
      'metadata'
    ];
    const salesOrderLineFields = [
      'account_id',
      'order_id',
      'external_source',
      'external_id',
      'external_line_id',
      'line_no',
      'row_no',
      'status',
      'close_status',
      'item_id',
      'item_code',
      'item_name',
      'item_spec',
      'item_model',
      'item_category_code',
      'item_category_name',
      'customer_item_code',
      'customer_item_name',
      'uom_code',
      'uom_name',
      'pricing_uom_code',
      'pricing_uom_name',
      'ordered_qty',
      'delivered_qty',
      'shipped_qty',
      'invoiced_qty',
      'returned_qty',
      'open_qty',
      'unit_price',
      'tax_inclusive_unit_price',
      'discount_rate',
      'discount_amount',
      'tax_rate',
      'tax_exclusive_amount',
      'tax_amount',
      'tax_inclusive_amount',
      'local_currency_amount',
      'need_date',
      'promise_date',
      'delivery_date',
      'warehouse_code',
      'warehouse_name',
      'storage_location_code',
      'storage_location_name',
      'lot_no',
      'project_code',
      'project_name',
      'source_doc_type',
      'source_doc_id',
      'source_doc_no',
      'source_line_id',
      'source_line_no',
      'is_free_gift',
      'remark',
      'metadata'
    ];

    return {
      admin_roles: {
        tableName: 'admin_roles',
        permissions: this.adminCrudPermissions('admin.roles.manage'),
        transactionalHooks: true,
        databaseHooks: {
          afterCreate: 'public.dynamic_crud_sync_role_permissions',
          afterUpdate: 'public.dynamic_crud_sync_role_permissions'
        },
        databaseHookInputFields: ['permission_codes', 'permissionCodes'],
        defaults: { status: 'active', sort_order: 0, is_system: false },
        list: { defaultSorts: [{ field: 'sort_order', direction: 'asc' }] },
        create: {
          allowedFields: ['code', 'name', 'description', 'status', 'sort_order', 'is_system'],
          requiredFields: ['code', 'name'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['code', 'name', 'description', 'status', 'sort_order', 'is_system'],
          requiredFields: ['code', 'name'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      admin_permissions: {
        tableName: 'admin_permissions',
        permissions: this.adminCrudPermissions('admin.permissions.manage'),
        defaults: { status: 'active', sort_order: 0 },
        list: { defaultSorts: [{ field: 'sort_order', direction: 'asc' }] },
        create: {
          allowedFields: ['code', 'name', 'description', 'resource_type', 'resource_key', 'entity_code', 'action', 'status', 'sort_order'],
          requiredFields: ['code', 'name'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['code', 'name', 'description', 'resource_type', 'resource_key', 'entity_code', 'action', 'status', 'sort_order'],
          requiredFields: ['code', 'name'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      admin_routes: {
        tableName: 'admin_routes',
        permissions: this.adminCrudPermissions('admin.routes.manage'),
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_normalize_admin_route',
          beforeUpdate: 'public.dynamic_crud_normalize_admin_route'
        },
        databaseHookInputFields: ['type', 'metadata_json', 'metadata'],
        defaults: { route_type: 'page', status: 'active', visible: true, keep_alive: false, sort_order: 0 },
        list: { defaultSorts: [{ field: 'sort_order', direction: 'asc' }, { field: 'created_at', direction: 'asc' }] },
        create: {
          allowedFields: ['parent_id', 'code', 'path', 'title', 'icon', 'component', 'redirect', 'permission_code', 'route_type', 'status', 'visible', 'keep_alive', 'sort_order', 'metadata'],
          requiredFields: ['code', 'path', 'title'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['parent_id', 'code', 'path', 'title', 'icon', 'component', 'redirect', 'permission_code', 'route_type', 'status', 'visible', 'keep_alive', 'sort_order', 'metadata'],
          requiredFields: ['code', 'path', 'title'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      admin_entities: {
        tableName: 'admin_entities',
        permissions: this.adminCrudPermissions('admin.entities.manage'),
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_normalize_admin_entity',
          beforeUpdate: 'public.dynamic_crud_normalize_admin_entity'
        },
        databaseHookInputFields: ['schema_json', 'schema', 'querySql'],
        defaults: { status: 'active', sort_order: 0 },
        list: { defaultSorts: [{ field: 'sort_order', direction: 'asc' }] },
        create: {
          allowedFields: ['code', 'title', 'table_name', 'primary_key', 'schema', 'query_sql', 'status', 'sort_order'],
          requiredFields: ['code', 'title', 'table_name'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['code', 'title', 'table_name', 'primary_key', 'schema', 'query_sql', 'status', 'sort_order'],
          requiredFields: ['code', 'title', 'table_name'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      system_option_sources: {
        tableName: 'system_option_sources',
        permissions: this.adminCrudPermissions('admin.options.manage'),
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_normalize_option_source',
          beforeUpdate: 'public.dynamic_crud_normalize_option_source'
        },
        databaseHookInputFields: [
          'sourceType', 'source_config_json', 'source_config', 'sourceConfig'
        ],
        defaults: { source_type: 'dict', status: 'active', sort_order: 0, is_system: false },
        list: { defaultSorts: [{ field: 'sort_order', direction: 'asc' }] },
        create: {
          allowedFields: ['code', 'name', 'description', 'source_type', 'source_config', 'cache_ttl_seconds', 'status', 'sort_order', 'is_system'],
          requiredFields: ['code', 'name'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['code', 'name', 'description', 'source_type', 'source_config', 'cache_ttl_seconds', 'status', 'sort_order', 'is_system'],
          requiredFields: ['code', 'name'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      system_option_items: {
        tableName: 'system_option_items',
        permissions: this.adminCrudPermissions('admin.options.manage'),
        transactionalHooks: true,
        databaseHooks: {
          beforeCreate: 'public.dynamic_crud_normalize_option_item',
          beforeUpdate: 'public.dynamic_crud_normalize_option_item'
        },
        databaseHookInputFields: [
          'sourceCode', 'parentValue', 'metadata_json', 'metadata'
        ],
        defaults: { status: 'active', sort_order: 0, disabled: false, is_system: false },
        list: { defaultSorts: [{ field: 'sort_order', direction: 'asc' }] },
        create: {
          allowedFields: ['source_code', 'label', 'value', 'parent_value', 'color', 'disabled', 'status', 'sort_order', 'is_system', 'metadata'],
          requiredFields: ['source_code', 'label', 'value'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['source_code', 'label', 'value', 'parent_value', 'color', 'disabled', 'status', 'sort_order', 'is_system', 'metadata'],
          requiredFields: ['source_code', 'label', 'value'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      admin_user_roles: {
        tableName: 'admin_user_roles',
        accountField: 'account_id',
        permissions: this.adminCrudPermissions('admin.users.manage'),
        create: {
          allowedFields: ['user_id', 'role_id', 'account_id', 'assigned_by'],
          requiredFields: ['user_id', 'role_id', 'account_id'],
          timestamp: false,
          userFields: { createdBy: 'assigned_by' }
        }
      },
      admin_role_permissions: {
        tableName: 'admin_role_permissions',
        permissions: this.adminCrudPermissions('admin.roles.manage'),
        create: {
          allowedFields: ['role_id', 'permission_id'],
          requiredFields: ['role_id', 'permission_id'],
          timestamp: false
        }
      },
      sales_orders: {
        tableName: 'sales_orders',
        accountField: 'account_id',
        permissions: this.adminCrudPermissions('sales.orders.manage'),
        detailRelations: {
          sales_order_lines: {
            foreignKey: 'order_id',
            parentKey: 'id',
            inheritFields: ['account_id'],
            updateMode: 'replace'
          }
        },
        defaults: {
          external_source: 'manual',
          status: 'draft',
          approval_status: 'draft',
          close_status: 'open',
          hold_status: false,
          currency_code: 'CNY',
          exchange_rate: 1,
          price_includes_tax: true,
          metadata: {}
        },
        create: {
          allowedFields: salesOrderFields,
          requiredFields: ['account_id', 'doc_no'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: salesOrderFields.filter((field) => field !== 'account_id'),
          userFields: { updatedBy: 'updated_by' }
        }
      },
      sales_order_lines: {
        tableName: 'sales_order_lines',
        accountField: 'account_id',
        permissions: this.adminCrudPermissions('sales.orders.manage'),
        defaults: {
          external_source: 'manual',
          status: 'open',
          close_status: 'open',
          is_free_gift: false,
          metadata: {}
        },
        create: {
          allowedFields: salesOrderLineFields,
          requiredFields: ['account_id', 'order_id', 'line_no', 'item_code', 'item_name'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: salesOrderLineFields.filter(
            (field) => field !== 'account_id' && field !== 'order_id'
          ),
          userFields: { updatedBy: 'updated_by' }
        }
      },
      system_config: {
        tableName: 'system_config',
        ownerField: 'user_id',
        list: {
          defaultSorts: [{ field: 'updated_at', direction: 'desc' }],
          defaultPageSize: 1,
          maxPageSize: 1
        },
        create: {
          allowedFields: [
            'theme_mode',
            'primary_color',
            'theme_config',
            'table_config',
            'language',
            'locale_config',
            'feature_flags',
            'metadata'
          ],
          userFields: {
            createdBy: 'created_by',
            updatedBy: 'updated_by',
            owner: 'user_id'
          }
        },
        update: {
          allowedFields: [
            'theme_mode',
            'primary_color',
            'theme_config',
            'table_config',
            'language',
            'locale_config',
            'feature_flags',
            'metadata'
          ],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      print_templates: {
        tableName: 'print_templates',
        permissions: this.adminCrudPermissions('print.templates.manage'),
        defaults: {
          workspace: {},
          status: 'active',
          version: 1,
          metadata: {}
        },
        list: {
          defaultSorts: [
            { field: 'updated_at', direction: 'desc' },
            { field: 'created_at', direction: 'desc' }
          ],
          defaultPageSize: 100,
          maxPageSize: 500
        },
        create: {
          allowedFields: ['name', 'content', 'workspace', 'status', 'version', 'metadata'],
          requiredFields: ['name', 'content'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['name', 'content', 'workspace', 'status', 'version', 'metadata'],
          userFields: { updatedBy: 'updated_by' }
        }
      }
    };
  }

  protected override hooks(): ServiceHooks {
    const clearAuthorizationCaches = () => {
      clearAllUserAuthorizationCaches();
    };
    return {
      admin_roles: {
        beforeDelete: [this.resolveCodeDeleteId],
        afterCreate: [clearAuthorizationCaches],
        afterUpdate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      },
      admin_permissions: {
        beforeDelete: [this.resolveCodeDeleteId],
        afterCreate: [clearAuthorizationCaches],
        afterUpdate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      },
      admin_routes: {
        beforeDelete: [this.resolveCodeDeleteId]
      },
      admin_entities: {
        beforeDelete: [this.resolveCodeDeleteId]
      },
      system_option_sources: {
        afterList: [this.attachOptionSourceConfigJson],
        beforeDelete: [this.resolveOptionSourceDeleteId, this.preventDeleteSystemOptionSource],
        afterCreate: [this.attachOptionSourceConfigJson],
        afterUpdate: [this.attachOptionSourceConfigJson]
      },
      system_option_items: {
        beforeDelete: [this.resolveOptionItemDeleteId, this.preventDeleteSystemOptionItem],
        afterCreate: [this.attachOptionItemMetadataJson],
        afterUpdate: [this.attachOptionItemMetadataJson]
      },
      admin_user_roles: {
        afterCreate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      },
      admin_role_permissions: {
        afterCreate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      }
    };
  }

  private adminCrudPermissions(permission: string) {
    return { list: permission, create: permission, update: permission, delete: permission };
  }

  private isNavigationCompatibilityRequest(postData: Record<string, unknown>) {
    const tableName = readOptionalString(postData.tableName ?? postData.table_name);
    const resource = readOptionalString(postData.resource);
    if (tableName !== 'admin_routes' || resource) return false;

    const filters = isRecord(postData.filters) ? postData.filters : {};
    const hasSearch = readOptionalString(postData.search) !== '';
    return !hasSearch && Object.keys(filters).length === 0;
  }

  private async listAccountLoginUsers(context: ServiceContext) {
    const { client } = await requireAdmin(context);
    const { data: permissionRows, error: permissionRowsError } = await client.rpc(
      'get_admin_user_permission_rows'
    );

    if (!permissionRowsError && Array.isArray(permissionRows)) {
      const accountUserIds = new Set(await listActiveAccountUserIds(context));
      return permissionRows
        .filter((row: Record<string, unknown>) => accountUserIds.has(String(row.user_id ?? row.id ?? '')))
        .map((row: Record<string, unknown>) => ({
        id: row.id,
        user_id: row.user_id,
        email: row.email,
        full_name: row.full_name,
        nickname: row.nickname,
        role: row.legacy_profile_role,
        app_role_names: row.app_role_names,
        role_names: row.role_names
      }));
    }

    const adminClient = createSupabaseClient('admin', context);
    const [{ data: profiles, error: profileError }, authUsersResult] = await Promise.all([
      adminClient
        .from('users')
        .select('id, full_name, nickname, role, updated_at')
        .order('updated_at', { ascending: false }),
      adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    ]);

    if (profileError) throw new BadRequestException(profileError.message);
    if (authUsersResult.error) throw new BadRequestException(authUsersResult.error.message);

    const authUsersById = new Map(
      authUsersResult.data.users.map((user) => [user.id, user])
    );
    const accountUserIds = new Set(await listActiveAccountUserIds(context));

    return (profiles ?? [])
      .filter((profile) => accountUserIds.has(profile.id))
      .map((profile) => ({
      id: profile.id,
      user_id: profile.id,
      email: authUsersById.get(profile.id)?.email ?? '',
      full_name: profile.full_name,
      nickname: profile.nickname,
      role: profile.role
    }));
  }

  private async listNavigationRoutes(context: ServiceContext) {
    const activeAccount = await requireActiveAccount(context);
    const { client, user } = await getCurrentUser(activeAccount.context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: activeAccount.context.accountId
    });
    const adminClient = createSupabaseClient('admin', activeAccount.context);
    const { data, error } = await adminClient
      .from('admin_routes')
      .select(ADMIN_NAVIGATION_SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(2000);

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return selectAuthorizedNavigationRoutes(
      data ?? [],
      authorization.permissionCodes,
      authorization.isLegacyAdmin
    );
  }

  private resolveCodeDeleteId = async (ctx: HookContext) => {
    if (ctx.id) return;
    const code = readOptionalString(ctx.input.code);
    if (!code) return;
    const rows = asRows(await this.listItems({
      tableName: ctx.resource.tableName,
      select: 'id',
      filters: { code },
      clientMode: ctx.resource.clientMode ?? 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      metadataTablesRequired(error);
      throw error;
    }));
    ctx.id = readOptionalString(rows[0]?.id);
  };

  private preventDeleteSystemOptionSource = async (ctx: HookContext) => {
    await this.preventDeleteSystemRow(ctx, 'system_option_sources', 'System option sources cannot be deleted.');
  };

  private preventDeleteSystemOptionItem = async (ctx: HookContext) => {
    await this.preventDeleteSystemRow(ctx, 'system_option_items', 'System option items cannot be deleted.');
  };

  private resolveOptionSourceDeleteId = async (ctx: HookContext) => {
    if (ctx.id) return;
    const code = readOptionalString(ctx.input.code);
    if (!code) return;
    const rows = asRows(await this.listItems({
      tableName: 'system_option_sources',
      select: 'id',
      filters: { code },
      clientMode: 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      optionTablesRequired(error);
      throw error;
    }));
    ctx.id = readOptionalString(rows[0]?.id);
  };

  private resolveOptionItemDeleteId = async (ctx: HookContext) => {
    if (ctx.id) return;
    const sourceCode = readOptionalString(ctx.input.source_code ?? ctx.input.sourceCode);
    const value = readOptionalString(ctx.input.value);
    if (!sourceCode || !value) return;
    const rows = asRows(await this.listItems({
      tableName: 'system_option_items',
      select: 'id',
      filters: { source_code: sourceCode, value },
      clientMode: 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      optionTablesRequired(error);
      throw error;
    }));
    ctx.id = readOptionalString(rows[0]?.id);
  };

  private async preventDeleteSystemRow(ctx: HookContext, tableName: string, message: string) {
    const id = readOptionalString(ctx.input.id);
    const code = readOptionalString(ctx.input.code);
    const sourceCode = readOptionalString(ctx.input.source_code ?? ctx.input.sourceCode);
    const value = readOptionalString(ctx.input.value);
    let filters: Record<string, unknown>;
    if (id) filters = { id };
    else if (code) filters = { code };
    else if (sourceCode && value) filters = { source_code: sourceCode, value };
    else throw new BadRequestException('id, code, or source_code + value is required.');

    const [data] = asRows(await this.listItems({
      tableName,
      select: 'id, is_system',
      filters,
      clientMode: 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      optionTablesRequired(error);
      throw error;
    }));
    if (!data) throw new NotFoundException('Item not found.');
    if (data.is_system === true) throw new BadRequestException(message);
  }

  private attachOptionItemMetadataJson = (ctx: HookContext) => {
    const row = ctx.result as Record<string, unknown> | undefined;
    if (!row) return;
    ctx.result = { ...row, metadata_json: toPrettyJson(row.metadata ?? {}) };
  };

  private attachOptionSourceConfigJson = (ctx: HookContext) => {
    const attachConfig = (row: Record<string, unknown>) => ({
      ...row,
      source_config_json: toPrettyJson(row.source_config ?? {})
    });

    if (Array.isArray(ctx.result)) {
      ctx.result = ctx.result.map((row) => isRecord(row) ? attachConfig(row) : row);
      return;
    }

    if (isRecord(ctx.result)) {
      ctx.result = attachConfig(ctx.result);
    }
  };
}
