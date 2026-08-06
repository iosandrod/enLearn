import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BaseService,
  type ResourceConfigMap
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { requireAdmin } from '../common/utils/supabase';

type JsonRecord = Record<string, unknown>;
type PhysicalTableInput = {
  schemaName: string;
  tableName: string;
};

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SUPPORTED_DATA_TYPES = new Set([
  'uuid',
  'text',
  'varchar',
  'integer',
  'bigint',
  'numeric',
  'boolean',
  'date',
  'timestamptz',
  'jsonb'
]);

const RPC_NAMES = {
  listDesign: 'entity_design_list',
  listPhysicalTables: 'entity_design_list_physical_tables',
  syncPhysicalColumns: 'entity_design_sync_physical_columns',
  syncPhysicalTables: 'entity_design_sync_physical_tables',
  saveTable: 'entity_design_save_table',
  deleteTable: 'entity_design_delete_table',
  saveColumn: 'entity_design_save_column',
  deleteColumn: 'entity_design_delete_column',
  saveRelation: 'entity_design_save_relation'
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readString(value: unknown, name: string, fallback = '') {
  const text = readOptionalString(value);
  if (text) return text;
  if (fallback) return fallback;
  throw new BadRequestException(`${name} is required.`);
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readJsonObject(value: unknown, fallback: JsonRecord = {}) {
  if (isRecord(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new BadRequestException('metadata must be valid JSON.');
    }
  }
  return fallback;
}

function assertIdentifier(value: string, name: string) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new BadRequestException(`${name} must be a valid identifier.`);
  }
}

function parseTableName(value: unknown) {
  const raw = readString(value, 'tableName');
  const parts = raw.split('.');
  if (parts.length > 2) {
    throw new BadRequestException('tableName must be table or schema.table.');
  }

  const schemaName = parts.length === 2 ? parts[0] : 'public';
  const tableName = parts.length === 2 ? parts[1] : parts[0];
  assertIdentifier(schemaName, 'schemaName');
  assertIdentifier(tableName, 'tableName');
  return { schemaName, tableName };
}

function normalizeStatus(value: unknown) {
  return ['active', 'inactive', 'draft', 'archived'].includes(String(value))
    ? String(value)
    : 'active';
}

function normalizeDataType(value: unknown) {
  const dataType = readString(value, 'dataType', 'text').toLowerCase();
  if (!SUPPORTED_DATA_TYPES.has(dataType)) {
    throw new BadRequestException(
      `Unsupported dataType "${dataType}". Use one of: ${Array.from(SUPPORTED_DATA_TYPES).join(', ')}.`
    );
  }
  return dataType;
}

function normalizePhysicalTableInput(value: unknown): PhysicalTableInput | null {
  if (typeof value === 'string' && value.trim()) {
    return parseTableName(value);
  }
  if (!isRecord(value)) return null;
  const schemaName = readOptionalString(value.schemaName ?? value.schema_name) || 'public';
  const tableName = readOptionalString(value.tableName ?? value.table_name);
  if (!tableName) return null;
  assertIdentifier(schemaName, 'schemaName');
  assertIdentifier(tableName, 'tableName');
  return { schemaName, tableName };
}

function normalizeStorageKind(value: unknown): 'physical' | 'virtual' {
  return value === 'virtual' ? 'virtual' : 'physical';
}

function normalizeDefaultExpression(value: unknown) {
  const text = readOptionalString(value);
  if (!text) return null;
  if (/[;]/.test(text) || /--|\/\*/.test(text)) {
    throw new BadRequestException('defaultValue contains unsupported SQL tokens.');
  }
  return text;
}

function normalizeTableSelector(postData: JsonRecord) {
  const tableId = readOptionalString(postData.tableId ?? postData.table_id);
  if (tableId) return { table_id: tableId };

  const tableCode = readOptionalString(
    postData.tableCode ?? postData.table_code ?? postData.code
  );
  if (tableCode) return { table_code: tableCode };

  const tableName = readOptionalString(postData.tableName ?? postData.table_name);
  if (tableName) {
    const parsed = parseTableName(tableName);
    return {
      schema_name: parsed.schemaName,
      table_name: parsed.tableName
    };
  }

  throw new BadRequestException('tableId, tableCode, or tableName is required.');
}

function isMissingEntityMetadataError(error: unknown) {
  if (!isRecord(error)) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  return (
    (code === '42P01' || code === 'PGRST202') &&
    (message.includes('entity_design') || message.includes('entity design'))
  );
}

function entityMetadataRequiredMessage() {
  return 'Entity design RPC functions are not installed. Run supabase/migrations/20260806110000_entity_design_rpc.sql first.';
}

@Injectable()
export class EntityDesignService extends BaseService {
  protected override resources(): ResourceConfigMap {
    const permissions = this.entityDesignCrudPermissions();
    const userFields = { createdBy: 'created_by', updatedBy: 'updated_by' };
    return {
      entity_design_tables: {
        tableName: 'entity_design_tables',
        permissions,
        create: {
          allowedFields: ['code', 'schema_name', 'table_name', 'title', 'description', 'primary_key', 'status', 'position_x', 'position_y', 'metadata'],
          requiredFields: ['code', 'schema_name', 'table_name', 'title'],
          userFields
        },
        update: {
          allowedFields: ['code', 'schema_name', 'table_name', 'title', 'description', 'primary_key', 'status', 'position_x', 'position_y', 'metadata'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      entity_design_columns: {
        tableName: 'entity_design_columns',
        permissions,
        create: {
          allowedFields: ['table_id', 'column_name', 'label', 'data_type', 'data_type_config', 'storage_kind', 'expression', 'is_required', 'is_primary_key', 'is_unique', 'default_value', 'sort_order', 'status', 'metadata'],
          requiredFields: ['table_id', 'column_name', 'label', 'data_type'],
          userFields
        },
        update: {
          allowedFields: ['table_id', 'column_name', 'label', 'data_type', 'data_type_config', 'storage_kind', 'expression', 'is_required', 'is_primary_key', 'is_unique', 'default_value', 'sort_order', 'status', 'metadata'],
          userFields: { updatedBy: 'updated_by' }
        }
      },
      entity_design_relations: {
        tableName: 'entity_design_relations',
        permissions,
        create: {
          allowedFields: ['source_table_id', 'source_column_id', 'source_column_name', 'target_table_id', 'target_column_id', 'target_column_name', 'relation_type', 'is_enforced', 'constraint_name', 'on_delete', 'metadata'],
          requiredFields: ['source_table_id', 'source_column_name', 'target_table_id', 'target_column_name'],
          userFields
        },
        update: {
          allowedFields: ['source_table_id', 'source_column_id', 'source_column_name', 'target_table_id', 'target_column_id', 'target_column_name', 'relation_type', 'is_enforced', 'constraint_name', 'on_delete', 'metadata'],
          userFields: { updatedBy: 'updated_by' }
        }
      }
    };
  }

  private entityDesignCrudPermissions() {
    return {
      list: ['entity.design.manage', 'admin.entities.manage'],
      create: ['entity.design.manage', 'admin.entities.manage'],
      update: ['entity.design.manage', 'admin.entities.manage'],
      delete: ['entity.design.manage', 'admin.entities.manage']
    };
  }

  protected override async executeAction(
    method: string,
    postData: JsonRecord,
    context: ServiceContext
  ) {
    try {
      switch (method) {
        case 'listDesign':
          return this.listDesign(context);
        case 'listPhysicalTables':
          return this.listPhysicalTables(context);
        case 'syncPhysicalColumns':
          return this.syncPhysicalColumns(postData, context);
        case 'syncPhysicalTables':
          return this.syncPhysicalTables(postData, context);
        case 'saveTable':
          return this.saveTable(postData, context);
        case 'deleteTable':
          return this.deleteTable(postData, context);
        case 'saveColumn':
          return this.saveColumn(postData, context);
        case 'deleteColumn':
          return this.deleteColumn(postData, context);
        case 'saveRelation':
          return this.saveRelation(postData, context);
        default:
          throw new BadRequestException(`Unsupported entityDesign method: ${method}`);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isMissingEntityMetadataError(error)) {
        throw new BadRequestException(entityMetadataRequiredMessage());
      }
      throw error;
    }
  }

  protected async assertAccess(context: ServiceContext) {
    const { client } = await requireAdmin(
      { ...context, accountId: undefined },
      ['entity.design.manage', 'admin.entities.manage']
    );
    return { client };
  }

  private async callRpc(
    client: SupabaseClient,
    functionName: string,
    payload?: JsonRecord
  ) {
    const args = payload === undefined ? undefined : { p_payload: payload };
    const { data, error } = await client.rpc(functionName, args);
    if (!error) return data;

    if (isMissingEntityMetadataError(error)) {
      throw new BadRequestException(entityMetadataRequiredMessage());
    }
    if (error.code === 'P0002') {
      throw new NotFoundException(error.message);
    }
    if (error.code === '42501') {
      throw new ForbiddenException(error.message);
    }
    if (error.code === '28000' || error.code === 'PGRST301') {
      throw new UnauthorizedException(error.message);
    }
    throw new BadRequestException(error.message);
  }

  private async listDesign(context: ServiceContext) {
    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.listDesign);
  }

  private async listPhysicalTables(context: ServiceContext) {
    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.listPhysicalTables);
  }

  private async syncPhysicalColumns(postData: JsonRecord, context: ServiceContext) {
    const { client } = await this.assertAccess(context);
    return this.callRpc(
      client,
      RPC_NAMES.syncPhysicalColumns,
      normalizeTableSelector(postData)
    );
  }

  private async syncPhysicalTables(postData: JsonRecord, context: ServiceContext) {
    const tableInputs = Array.isArray(postData.tables)
      ? postData.tables
        .map(normalizePhysicalTableInput)
        .filter((table): table is PhysicalTableInput => Boolean(table))
      : [];
    if (!tableInputs.length) {
      throw new BadRequestException('tables is required.');
    }

    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.syncPhysicalTables, {
      tables: tableInputs.map((table) => ({
        schema_name: table.schemaName,
        table_name: table.tableName
      }))
    });
  }

  private async saveTable(postData: JsonRecord, context: ServiceContext) {
    const parsed = parseTableName(postData.tableName ?? postData.table_name);
    const code = readString(postData.code, 'code', parsed.tableName);
    const primaryKey = readString(
      postData.primaryKey ?? postData.primary_key,
      'primaryKey',
      'id'
    );
    assertIdentifier(code, 'code');
    assertIdentifier(primaryKey, 'primaryKey');

    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.saveTable, {
      code,
      schema_name: parsed.schemaName,
      table_name: parsed.tableName,
      title: readString(postData.title, 'title', parsed.tableName),
      description: readOptionalString(postData.description) || null,
      primary_key: primaryKey,
      status: normalizeStatus(postData.status),
      position_x: Math.trunc(readNumber(postData.positionX ?? postData.position_x, 80)),
      position_y: Math.trunc(readNumber(postData.positionY ?? postData.position_y, 80)),
      metadata: readJsonObject(postData.metadata ?? postData.metadata_json),
      create_physical: readBoolean(
        postData.createPhysical ?? postData.create_physical,
        true
      )
    });
  }

  private async deleteTable(postData: JsonRecord, context: ServiceContext) {
    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.deleteTable, {
      ...normalizeTableSelector(postData),
      drop_physical: readBoolean(
        postData.dropPhysical ?? postData.drop_physical,
        false
      )
    });
  }

  private async saveColumn(postData: JsonRecord, context: ServiceContext) {
    const columnName = readString(
      postData.columnName ?? postData.column_name,
      'columnName'
    );
    assertIdentifier(columnName, 'columnName');

    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.saveColumn, {
      ...normalizeTableSelector(postData),
      column_name: columnName,
      label: readString(postData.label, 'label', columnName),
      data_type: normalizeDataType(postData.dataType ?? postData.data_type),
      data_type_config: readJsonObject(
        postData.dataTypeConfig ?? postData.data_type_config
      ),
      storage_kind: normalizeStorageKind(
        postData.storageKind ?? postData.storage_kind
      ),
      expression: readOptionalString(postData.expression) || null,
      is_required: readBoolean(postData.isRequired ?? postData.is_required),
      is_primary_key: readBoolean(
        postData.isPrimaryKey ?? postData.is_primary_key
      ),
      is_unique: readBoolean(postData.isUnique ?? postData.is_unique),
      default_value: normalizeDefaultExpression(
        postData.defaultValue ?? postData.default_value
      ),
      sort_order: Math.trunc(
        readNumber(postData.sortOrder ?? postData.sort_order, 0)
      ),
      status: normalizeStatus(postData.status),
      metadata: readJsonObject(postData.metadata ?? postData.metadata_json)
    });
  }

  private async deleteColumn(postData: JsonRecord, context: ServiceContext) {
    const columnName = readString(
      postData.columnName ?? postData.column_name,
      'columnName'
    );
    assertIdentifier(columnName, 'columnName');

    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.deleteColumn, {
      ...normalizeTableSelector(postData),
      column_name: columnName,
      drop_physical: readBoolean(
        postData.dropPhysical ?? postData.drop_physical,
        true
      )
    });
  }

  private async saveRelation(postData: JsonRecord, context: ServiceContext) {
    const sourceColumnName = readString(
      postData.sourceColumnName ?? postData.source_column_name,
      'sourceColumnName'
    );
    const targetColumnName = readOptionalString(
      postData.targetColumnName ?? postData.target_column_name
    );
    assertIdentifier(sourceColumnName, 'sourceColumnName');
    if (targetColumnName) assertIdentifier(targetColumnName, 'targetColumnName');

    const constraintName = readOptionalString(
      postData.constraintName ?? postData.constraint_name
    );
    if (constraintName) assertIdentifier(constraintName, 'constraintName');

    const relationTypeValue = String(
      postData.relationType ?? postData.relation_type ?? ''
    );
    const relationType = [
      'one_to_one',
      'one_to_many',
      'many_to_one',
      'many_to_many'
    ].includes(relationTypeValue)
      ? relationTypeValue
      : 'many_to_one';
    const onDeleteValue = String(
      postData.onDelete ?? postData.on_delete ?? ''
    ).toLowerCase();
    const onDelete = ['no action', 'restrict', 'cascade', 'set null'].includes(
      onDeleteValue
    )
      ? onDeleteValue
      : 'no action';

    const sourceTable = normalizeTableSelector({
      tableId: postData.sourceTableId ?? postData.source_table_id,
      tableCode: postData.sourceTableCode ?? postData.source_table_code,
      tableName: postData.sourceTableName ?? postData.source_table_name
    });
    const targetTable = normalizeTableSelector({
      tableId: postData.targetTableId ?? postData.target_table_id,
      tableCode: postData.targetTableCode ?? postData.target_table_code,
      tableName: postData.targetTableName ?? postData.target_table_name
    });

    const { client } = await this.assertAccess(context);
    return this.callRpc(client, RPC_NAMES.saveRelation, {
      source_table: sourceTable,
      source_column_name: sourceColumnName,
      target_table: targetTable,
      target_column_name: targetColumnName || null,
      relation_type: relationType,
      is_enforced: readBoolean(postData.isEnforced ?? postData.is_enforced),
      constraint_name: constraintName || null,
      on_delete: onDelete,
      metadata: readJsonObject(postData.metadata ?? postData.metadata_json)
    });
  }
}
