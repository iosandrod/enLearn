import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BaseService,
  type HookContext,
  type ResourceConfigMap,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { createSupabaseClient, requireAdmin } from '../common/utils/supabase';

type OptionSourceType = 'dict' | 'table' | 'view' | 'rpc' | 'sql';

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

function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (isRecord(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new BadRequestException('Invalid JSON payload.');
    }
  }
  return fallback;
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

function normalizeStatus(value: unknown, allowed: string[], fallback: string) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function normalizeOptionSourceType(value: unknown): OptionSourceType {
  return normalizeStatus(value, ['dict', 'table', 'view', 'rpc', 'sql'], 'dict') as OptionSourceType;
}

function readConfigString(config: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = readOptionalString(config[key]);
    if (value) return value;
  }
  return fallback;
}

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new BadRequestException(`${fieldName} must be a valid identifier.`);
  }
}

function assertIdentifierPath(value: string, fieldName: string) {
  value.split('.').forEach((segment) => assertIdentifier(segment, fieldName));
}

function readRelationIdentifier(value: unknown, fieldName: string) {
  const relation = readString(value, fieldName);
  const parts = relation.split('.');
  if (parts.length > 2) {
    throw new BadRequestException(`${fieldName} must be table or schema.table.`);
  }
  parts.forEach((part) => assertIdentifier(part, fieldName));
}

function assertOptionSourceConfig(sourceType: OptionSourceType, config: Record<string, unknown>, status: string) {
  if (status !== 'active' || sourceType === 'dict') return;

  if (sourceType === 'table' || sourceType === 'view') {
    const relation = readConfigString(
      config,
      sourceType === 'view' ? ['view', 'table', 'relation', 'from'] : ['table', 'relation', 'from']
    );
    readRelationIdentifier(relation, 'source_config.table');
    assertIdentifierPath(readConfigString(config, ['labelField', 'label_field'], 'label'), 'source_config.labelField');
    assertIdentifierPath(readConfigString(config, ['valueField', 'value_field'], 'value'), 'source_config.valueField');
    return;
  }

  if (sourceType === 'rpc') {
    assertIdentifier(readConfigString(config, ['functionName', 'function_name', 'rpc']), 'source_config.functionName');
    return;
  }

  if (sourceType === 'sql' && !readConfigString(config, ['sql', 'query'])) {
    throw new BadRequestException('source_config.sql is required for SQL option sources.');
  }
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows as Record<string, unknown>[];
  return [];
}

@Injectable()
export class AdminService extends BaseService {
  protected override async executeAction(
    method: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (method === 'listApprovalTestUsers') {
      return this.listApprovalTestUsers(context);
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
      roles: {
        tableName: 'admin_roles',
        permissions: this.adminCrudPermissions('admin.roles.manage'),
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
      permissions: {
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
      routes: {
        tableName: 'admin_routes',
        permissions: this.adminCrudPermissions('admin.routes.manage'),
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
      entities: {
        tableName: 'admin_entities',
        permissions: this.adminCrudPermissions('admin.entities.manage'),
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
      optionSources: {
        tableName: 'system_option_sources',
        permissions: this.adminCrudPermissions('admin.options.manage'),
        defaults: { source_type: 'dict', status: 'active', sort_order: 0, is_system: false },
        list: { defaultSorts: [{ field: 'sort_order', direction: 'asc' }] },
        create: {
          allowedFields: ['code', 'name', 'description', 'source_type', 'source_config', 'status', 'sort_order', 'is_system'],
          requiredFields: ['code', 'name'],
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: ['code', 'name', 'description', 'source_type', 'source_config', 'status', 'sort_order', 'is_system'],
          requiredFields: ['code', 'name'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      optionItems: {
        tableName: 'system_option_items',
        permissions: this.adminCrudPermissions('admin.options.manage'),
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
      userRoles: {
        tableName: 'admin_user_roles',
        permissions: this.adminCrudPermissions('admin.users.manage'),
        create: {
          allowedFields: ['user_id', 'role_id', 'assigned_by'],
          requiredFields: ['user_id', 'role_id'],
          timestamp: false,
          userFields: { createdBy: 'assigned_by' }
        }
      },
      rolePermissions: {
        tableName: 'admin_role_permissions',
        permissions: this.adminCrudPermissions('admin.roles.manage'),
        create: {
          allowedFields: ['role_id', 'permission_id'],
          requiredFields: ['role_id', 'permission_id'],
          timestamp: false
        }
      },
      salesOrders: {
        tableName: 'sales_orders',
        permissions: this.adminCrudPermissions('sales.orders.manage'),
        detailRelations: {
          salesOrderLines: {
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
      salesOrderLines: {
        tableName: 'sales_order_lines',
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
      }
    };
  }

  protected override hooks(): ServiceHooks {
    return {
      roles: {
        afterCreate: [this.syncRolePermissionsHook],
        afterUpdate: [this.syncRolePermissionsHook],
        beforeDelete: [this.resolveCodeDeleteId]
      },
      permissions: { beforeDelete: [this.resolveCodeDeleteId] },
      routes: {
        beforeCreate: [this.normalizeRoutePayload],
        beforeUpdate: [this.normalizeRoutePayload],
        beforeDelete: [this.resolveCodeDeleteId]
      },
      entities: {
        beforeCreate: [this.normalizeEntityPayload],
        beforeUpdate: [this.normalizeEntityPayload],
        beforeDelete: [this.resolveCodeDeleteId]
      },
      optionSources: {
        beforeCreate: [this.normalizeOptionSourcePayload],
        beforeUpdate: [this.normalizeOptionSourcePayload],
        beforeDelete: [this.resolveOptionSourceDeleteId, this.preventDeleteSystemOptionSource]
      },
      optionItems: {
        beforeCreate: [this.normalizeOptionItemPayload, this.assertDictOptionSource],
        beforeUpdate: [this.normalizeOptionItemPayload, this.assertDictOptionSource],
        beforeDelete: [this.resolveOptionItemDeleteId, this.preventDeleteSystemOptionItem],
        afterCreate: [this.attachOptionItemMetadataJson],
        afterUpdate: [this.attachOptionItemMetadataJson]
      }
    };
  }

  private adminCrudPermissions(permission: string) {
    return { list: permission, create: permission, update: permission, delete: permission };
  }

  private async listApprovalTestUsers(context: ServiceContext) {
    const { client } = await requireAdmin(context, [
      'workflow.definitions.manage',
      'admin.users.manage'
    ]);
    const { data: permissionRows, error: permissionRowsError } = await client.rpc(
      'get_admin_user_permission_rows'
    );

    if (!permissionRowsError && Array.isArray(permissionRows)) {
      return permissionRows.map((row: Record<string, unknown>) => ({
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

    return (profiles ?? []).map((profile) => ({
      id: profile.id,
      user_id: profile.id,
      email: authUsersById.get(profile.id)?.email ?? '',
      full_name: profile.full_name,
      nickname: profile.nickname,
      role: profile.role
    }));
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

  private syncRolePermissionsHook = async (ctx: HookContext) => {
    const role = ctx.result as Record<string, unknown> | undefined;
    const roleId = readOptionalString(role?.id);
    if (!roleId) return;

    const permissionCodes = readStringArray(ctx.input.permission_codes ?? ctx.input.permissionCodes);
    const allPermissions = asRows(await this.listItems({
      tableName: 'admin_permissions',
      select: 'id, code',
      clientMode: 'admin',
      limit: 1000
    }, ctx.context).catch((error) => {
      metadataTablesRequired(error);
      throw error;
    }));

    const permissionIds = allPermissions
      .filter((permission) => permissionCodes.includes(String(permission.code)))
      .map((permission) => String(permission.id));

    const { error: deleteMappingsError } = await ctx.client
      .from('admin_role_permissions')
      .delete()
      .eq('role_id', roleId);

    if (deleteMappingsError) {
      metadataTablesRequired(deleteMappingsError);
      throw new BadRequestException(deleteMappingsError.message);
    }

    if (permissionIds.length) {
      const { error: insertMappingsError } = await ctx.client
        .from('admin_role_permissions')
        .insert(permissionIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })));

      if (insertMappingsError) {
        metadataTablesRequired(insertMappingsError);
        throw new BadRequestException(insertMappingsError.message);
      }
    }

    ctx.result = { ...role, permission_codes: permissionCodes };
  };

  private normalizeRoutePayload = (ctx: HookContext) => {
    if ('type' in ctx.data && !('route_type' in ctx.data)) {
      ctx.data.route_type = ctx.data.type;
      delete ctx.data.type;
    }
    if ('metadata_json' in ctx.input || 'metadata' in ctx.input) {
      ctx.data.metadata = readJsonObject(ctx.input.metadata_json ?? ctx.input.metadata);
    }
  };

  private normalizeEntityPayload = (ctx: HookContext) => {
    if ('schema_json' in ctx.input || 'schema' in ctx.input) {
      ctx.data.schema = readJsonObject(ctx.input.schema_json ?? ctx.input.schema);
    }
    if ('querySql' in ctx.input) {
      ctx.data.query_sql = readOptionalString(ctx.input.querySql) || null;
    }
  };

  private normalizeOptionSourcePayload = (ctx: HookContext) => {
    ctx.data.source_type = normalizeOptionSourceType(ctx.data.source_type ?? ctx.input.sourceType);
    ctx.data.source_config = readJsonObject(
      ctx.input.source_config_json ?? ctx.input.source_config ?? ctx.input.sourceConfig
    );
    assertOptionSourceConfig(
      ctx.data.source_type as OptionSourceType,
      ctx.data.source_config as Record<string, unknown>,
      readOptionalString(ctx.data.status) || 'active'
    );
  };

  private normalizeOptionItemPayload = (ctx: HookContext) => {
    if ('sourceCode' in ctx.input) ctx.data.source_code = ctx.input.sourceCode;
    if ('parentValue' in ctx.input) ctx.data.parent_value = ctx.input.parentValue || null;
    if ('metadata_json' in ctx.input || 'metadata' in ctx.input) {
      ctx.data.metadata = readJsonObject(ctx.input.metadata_json ?? ctx.input.metadata);
    }
  };

  private assertDictOptionSource = async (ctx: HookContext) => {
    const sourceCode = readString(ctx.data.source_code, 'source_code');
    const [source] = asRows(await this.listItems({
      tableName: 'system_option_sources',
      select: 'code, source_type',
      filters: { code: sourceCode },
      clientMode: 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      optionTablesRequired(error);
      throw error;
    }));

    if (!source) throw new NotFoundException('Option source not found.');
    if (source.source_type !== 'dict') {
      throw new BadRequestException('Only dict option sources can save manual items.');
    }
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
}
