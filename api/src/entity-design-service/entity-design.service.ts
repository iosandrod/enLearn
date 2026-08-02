import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  BaseService,
  type ResourceConfigMap
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { withPostgresClient } from '../common/utils/database';
import { requireAdmin } from '../common/utils/supabase';

type JsonRecord = Record<string, unknown>;
type TableRef = {
  id: string;
  code: string;
  schema_name: string;
  table_name: string;
  title: string;
  primary_key: string;
};

type ColumnInput = {
  id?: string;
  tableId: string;
  columnName: string;
  label: string;
  dataType: string;
  storageKind: 'physical' | 'virtual';
  expression: string | null;
  isRequired: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  sortOrder: number;
  status: string;
  metadata: JsonRecord;
};

type PhysicalColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
};

type PhysicalTableInput = {
  schemaName: string;
  tableName: string;
};

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SUPPORTED_DATA_TYPES = new Map<string, string>([
  ['uuid', 'uuid'],
  ['text', 'text'],
  ['varchar', 'varchar(255)'],
  ['integer', 'integer'],
  ['bigint', 'bigint'],
  ['numeric', 'numeric'],
  ['boolean', 'boolean'],
  ['date', 'date'],
  ['timestamptz', 'timestamp with time zone'],
  ['jsonb', 'jsonb']
]);

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

function asRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value as JsonRecord[];
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows as JsonRecord[];
  return [];
}

function assertIdentifier(value: string, name: string) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new BadRequestException(`${name} must be a valid identifier.`);
  }
}

function quoteIdent(value: string) {
  assertIdentifier(value, 'identifier');
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteRelation(schemaName: string, tableName: string) {
  return `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;
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
  return { schemaName, tableName, fullName: `${schemaName}.${tableName}` };
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
      `Unsupported dataType "${dataType}". Use one of: ${Array.from(SUPPORTED_DATA_TYPES.keys()).join(', ')}.`
    );
  }
  return dataType;
}

function normalizePhysicalDataType(column: Pick<PhysicalColumnRow, 'data_type' | 'udt_name'>) {
  const dataType = String(column.data_type ?? '').toLowerCase();
  const udtName = String(column.udt_name ?? '').toLowerCase();
  if (dataType === 'uuid' || udtName === 'uuid') return 'uuid';
  if (dataType === 'character varying' || dataType === 'varchar') return 'varchar';
  if (dataType === 'integer' || dataType === 'int4' || udtName === 'int4') return 'integer';
  if (dataType === 'bigint' || dataType === 'int8' || udtName === 'int8') return 'bigint';
  if (['numeric', 'decimal', 'double precision', 'real'].includes(dataType)) return 'numeric';
  if (dataType === 'boolean' || udtName === 'bool') return 'boolean';
  if (dataType === 'date') return 'date';
  if (dataType.startsWith('timestamp')) return 'timestamptz';
  if (dataType === 'json' || dataType === 'jsonb' || udtName === 'jsonb') return 'jsonb';
  return 'text';
}

function sanitizePhysicalDefault(value: unknown) {
  const text = readOptionalString(value);
  if (!text) return null;
  if (/[;]/.test(text) || /--|\/\*/.test(text)) return null;
  return text;
}

function humanizeTableName(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || value;
}

function normalizePhysicalTableInput(value: unknown): PhysicalTableInput | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseTableName(value);
    return { schemaName: parsed.schemaName, tableName: parsed.tableName };
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

function buildPhysicalColumnDefinition(input: ColumnInput) {
  const sqlType = SUPPORTED_DATA_TYPES.get(input.dataType);
  if (!sqlType) {
    throw new BadRequestException(`Unsupported dataType "${input.dataType}".`);
  }

  const fragments = [quoteIdent(input.columnName), sqlType];
  if (input.defaultValue) fragments.push(`default ${input.defaultValue}`);
  if (input.isRequired || input.isPrimaryKey) fragments.push('not null');
  if (input.isUnique && !input.isPrimaryKey) fragments.push('unique');
  return fragments.join(' ');
}

function isMissingEntityMetadataError(error: unknown) {
  if (!isRecord(error)) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  return (
    code === '42P01' &&
    (message.includes('entity_design_tables') ||
      message.includes('entity_design_columns') ||
      message.includes('entity_design_relations'))
  );
}

function entityMetadataRequiredMessage() {
  return 'Entity design metadata tables are not created yet. Run supabase/migrations/20260728070000_entity_design_metadata.sql first.';
}

function normalizeColumnInput(postData: JsonRecord, tableId: string): ColumnInput {
  const columnName = readString(postData.columnName ?? postData.column_name, 'columnName');
  assertIdentifier(columnName, 'columnName');
  const label = readString(postData.label, 'label', columnName);

  return {
    id: readOptionalString(postData.id) || undefined,
    tableId,
    columnName,
    label,
    dataType: normalizeDataType(postData.dataType ?? postData.data_type),
    storageKind: normalizeStorageKind(postData.storageKind ?? postData.storage_kind),
    expression: readOptionalString(postData.expression) || null,
    isRequired: readBoolean(postData.isRequired ?? postData.is_required),
    isPrimaryKey: readBoolean(postData.isPrimaryKey ?? postData.is_primary_key),
    isUnique: readBoolean(postData.isUnique ?? postData.is_unique),
    defaultValue: normalizeDefaultExpression(postData.defaultValue ?? postData.default_value),
    sortOrder: readNumber(postData.sortOrder ?? postData.sort_order, 0),
    status: normalizeStatus(postData.status),
    metadata: readJsonObject(postData.metadata ?? postData.metadata_json)
  };
}

async function runInTransaction<T>(client: PoolClient, callback: () => Promise<T>) {
  await client.query('begin');
  try {
    const result = await callback();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

@Injectable()
export class EntityDesignService extends BaseService {
  protected override resources(): ResourceConfigMap {
    const permissions = this.entityDesignCrudPermissions();
    const userFields = { createdBy: 'created_by', updatedBy: 'updated_by' };
    return {
      tables: {
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
      columns: {
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
      relations: {
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

  protected override async executeAction(method: string, postData: JsonRecord, context: ServiceContext) {
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

  private async assertAccess(context: ServiceContext) {
    return requireAdmin(context, ['entity.design.manage', 'admin.entities.manage']);
  }

  private async listDesign(context: ServiceContext) {
    await this.assertAccess(context);
    try {
      const [tableRows, columnRows, relationRows, physicalRows] = await Promise.all([
        this.listItems({
          tableName: 'entity_design_tables',
          sorts: [
            { field: 'position_y', direction: 'asc' },
            { field: 'position_x', direction: 'asc' },
            { field: 'created_at', direction: 'asc' }
          ],
          clientMode: 'admin',
          limit: 1000
        }, context).then(asRows),
        this.listItems({
          tableName: 'entity_design_columns',
          sorts: [
            { field: 'sort_order', direction: 'asc' },
            { field: 'created_at', direction: 'asc' }
          ],
          clientMode: 'admin',
          limit: 10000
        }, context).then(asRows),
        this.listItems({
          tableName: 'entity_design_relations',
          sorts: [{ field: 'created_at', direction: 'asc' }],
          clientMode: 'admin',
          limit: 10000
        }, context).then(asRows),
        withPostgresClient(async (client) => {
          const result = await client.query(`
            select
              table_schema,
              table_name,
              column_name,
              data_type,
              is_nullable,
              column_default,
              ordinal_position
            from information_schema.columns
            where table_schema = 'public'
            order by table_schema, table_name, ordinal_position
          `);
          return result.rows as JsonRecord[];
        })
      ]);

      const physicalByTable = new Map<string, JsonRecord[]>();
      for (const row of physicalRows) {
        const key = `${row.table_schema}.${row.table_name}`;
        physicalByTable.set(key, [...(physicalByTable.get(key) ?? []), row]);
      }

      const columnsByTableId = new Map<string, JsonRecord[]>();
      for (const column of columnRows) {
        const tableId = String(column.table_id);
        columnsByTableId.set(tableId, [...(columnsByTableId.get(tableId) ?? []), column]);
      }

      const tables = tableRows.map((table) => {
        const tableId = String(table.id);
        const physicalKey = `${table.schema_name}.${table.table_name}`;
        return {
          ...table,
          full_name: physicalKey,
          columns: columnsByTableId.get(tableId) ?? [],
          physical_columns: physicalByTable.get(physicalKey) ?? []
        };
      });

      return {
        tables,
        relations: relationRows
      };
    } catch (error) {
      if (isMissingEntityMetadataError(error)) {
        return {
          tables: [],
          relations: [],
          setupRequired: true,
          message: entityMetadataRequiredMessage()
        };
      }
      throw error;
    }
  }

  private async findTable(
    client: PoolClient,
    postData: JsonRecord,
    options: { required?: boolean } = { required: true }
  ) {
    const id = readOptionalString(postData.tableId ?? postData.table_id);
    const code = readOptionalString(postData.tableCode ?? postData.table_code ?? postData.code);
    const tableName = readOptionalString(postData.tableName ?? postData.table_name);

    let result;
    if (id) {
      result = await client.query('select * from public.entity_design_tables where id = $1', [id]);
    } else if (code) {
      result = await client.query('select * from public.entity_design_tables where code = $1', [code]);
    } else if (tableName) {
      const parsed = parseTableName(tableName);
      result = await client.query(
        'select * from public.entity_design_tables where schema_name = $1 and table_name = $2',
        [parsed.schemaName, parsed.tableName]
      );
    } else if (options.required !== false) {
      throw new BadRequestException('tableId, tableCode, or tableName is required.');
    } else {
      return null;
    }

    const table = result.rows[0] as TableRef | undefined;
    if (!table && options.required !== false) {
      throw new NotFoundException('Entity design table not found.');
    }
    return table ?? null;
  }

  private async listPhysicalTables(context: ServiceContext) {
    await this.assertAccess(context);
    return withPostgresClient(async (client) => {
      const result = await client.query(`
        select
          tables.table_schema,
          tables.table_name,
          coalesce(columns.column_count, 0)::int as column_count,
          metadata.id as table_id,
          metadata.title
        from information_schema.tables tables
        left join (
          select table_schema, table_name, count(*) as column_count
          from information_schema.columns
          where table_schema = 'public'
          group by table_schema, table_name
        ) columns
          on columns.table_schema = tables.table_schema
         and columns.table_name = tables.table_name
        left join public.entity_design_tables metadata
          on metadata.schema_name = tables.table_schema
         and metadata.table_name = tables.table_name
        where tables.table_schema = 'public'
          and tables.table_type = 'BASE TABLE'
          and tables.table_name not in (
            'entity_design_tables',
            'entity_design_columns',
            'entity_design_relations',
            'schema_migrations'
          )
        order by tables.table_schema, tables.table_name
      `);

      return (result.rows as JsonRecord[]).map((row) => {
        const schemaName = String(row.table_schema);
        const tableName = String(row.table_name);
        return {
          schemaName,
          tableName,
          fullName: `${schemaName}.${tableName}`,
          title: readOptionalString(row.title) || humanizeTableName(tableName),
          existsInMetadata: Boolean(row.table_id),
          tableId: row.table_id ?? null,
          columnCount: Number(row.column_count ?? 0)
        };
      });
    });
  }

  private async readPhysicalColumns(client: PoolClient, schemaName: string, tableName: string) {
    const result = await client.query(
      `
        select
          table_schema,
          table_name,
          column_name,
          data_type,
          udt_name,
          is_nullable,
          column_default,
          ordinal_position
        from information_schema.columns
        where table_schema = $1
          and table_name = $2
        order by ordinal_position
      `,
      [schemaName, tableName]
    );
    return result.rows as PhysicalColumnRow[];
  }

  private async inferPrimaryKey(client: PoolClient, schemaName: string, tableName: string) {
    const result = await client.query(
      `
        select key_usage.column_name
        from information_schema.table_constraints constraints
        join information_schema.key_column_usage key_usage
          on key_usage.constraint_schema = constraints.constraint_schema
         and key_usage.constraint_name = constraints.constraint_name
         and key_usage.table_schema = constraints.table_schema
         and key_usage.table_name = constraints.table_name
        where constraints.table_schema = $1
          and constraints.table_name = $2
          and constraints.constraint_type = 'PRIMARY KEY'
        order by key_usage.ordinal_position
        limit 1
      `,
      [schemaName, tableName]
    );
    return readOptionalString(result.rows[0]?.column_name) || 'id';
  }

  private async ensurePhysicalTableMetadata(
    client: PoolClient,
    table: PhysicalTableInput,
    userId: string,
    index = 0
  ) {
    const primaryKey = await this.inferPrimaryKey(client, table.schemaName, table.tableName);
    assertIdentifier(primaryKey, 'primaryKey');
    const saved = await client.query(
      `
        insert into public.entity_design_tables (
          code, schema_name, table_name, title, primary_key, status,
          position_x, position_y, metadata, created_by, updated_by
        ) values ($1,$2,$3,$4,$5,'active',$6,$7,'{}'::jsonb,$8,$8)
        on conflict (schema_name, table_name) do update set
          title = coalesce(nullif(public.entity_design_tables.title, ''), excluded.title),
          primary_key = coalesce(nullif(public.entity_design_tables.primary_key, ''), excluded.primary_key),
          updated_by = excluded.updated_by,
          updated_at = timezone('utc'::text, now())
        returning *
      `,
      [
        table.tableName,
        table.schemaName,
        table.tableName,
        humanizeTableName(table.tableName),
        primaryKey,
        100 + index * 340,
        120 + index * 40,
        userId
      ]
    );
    return saved.rows[0] as TableRef;
  }

  private async syncColumnsForTable(client: PoolClient, table: TableRef, userId: string) {
    const physicalColumns = await this.readPhysicalColumns(client, table.schema_name, table.table_name);
    if (!physicalColumns.length) {
      throw new NotFoundException(`Physical table ${table.schema_name}.${table.table_name} was not found.`);
    }

    const existing = await client.query(
      'select column_name from public.entity_design_columns where table_id = $1',
      [table.id]
    );
    const existingNames = new Set((existing.rows as JsonRecord[]).map((row) => String(row.column_name)));
    let inserted = 0;
    let skipped = 0;

    for (const column of physicalColumns) {
      if (existingNames.has(column.column_name)) {
        skipped += 1;
        continue;
      }
      await client.query(
        `
          insert into public.entity_design_columns (
            table_id, column_name, label, data_type, storage_kind, expression,
            is_required, is_primary_key, is_unique, default_value, sort_order,
            status, metadata, created_by, updated_by
          ) values ($1,$2,$3,$4,'physical',null,$5,$6,false,$7,$8,'active','{}'::jsonb,$9,$9)
          on conflict (table_id, column_name) do nothing
        `,
        [
          table.id,
          column.column_name,
          column.column_name,
          normalizePhysicalDataType(column),
          column.is_nullable === 'NO',
          column.column_name === table.primary_key,
          sanitizePhysicalDefault(column.column_default),
          Number(column.ordinal_position) * 10,
          userId
        ]
      );
      inserted += 1;
      existingNames.add(column.column_name);
    }

    return { inserted, skipped, columns: physicalColumns };
  }

  private async syncPhysicalColumns(postData: JsonRecord, context: ServiceContext) {
    const { user } = await this.assertAccess(context);
    return withPostgresClient(async (client) => {
      const table = await this.findTable(client, postData);
      if (!table) throw new NotFoundException('Entity design table not found.');
      return runInTransaction(client, async () => {
        const result = await this.syncColumnsForTable(client, table, user.id);
        return {
          tableId: table.id,
          tableName: `${table.schema_name}.${table.table_name}`,
          inserted: result.inserted,
          skipped: result.skipped,
          columns: result.columns
        };
      });
    });
  }

  private async syncPhysicalTables(postData: JsonRecord, context: ServiceContext) {
    const { user } = await this.assertAccess(context);
    const tableInputs = Array.isArray(postData.tables)
      ? postData.tables.map(normalizePhysicalTableInput).filter((table): table is PhysicalTableInput => Boolean(table))
      : [];
    if (!tableInputs.length) {
      throw new BadRequestException('tables is required.');
    }

    return withPostgresClient(async (client) =>
      runInTransaction(client, async () => {
        const loaded = [];
        let imported = 0;
        let existing = 0;
        for (const [index, tableInput] of tableInputs.entries()) {
          const physicalColumns = await this.readPhysicalColumns(client, tableInput.schemaName, tableInput.tableName);
          if (!physicalColumns.length) {
            throw new NotFoundException(`Physical table ${tableInput.schemaName}.${tableInput.tableName} was not found.`);
          }

          const before = await this.findTable(
            client,
            { tableName: `${tableInput.schemaName}.${tableInput.tableName}` },
            { required: false }
          );
          const table = await this.ensurePhysicalTableMetadata(client, tableInput, user.id, index);
          if (before) {
            existing += 1;
          } else {
            imported += 1;
          }
          const synced = await this.syncColumnsForTable(client, table, user.id);
          loaded.push({
            tableId: table.id,
            schemaName: table.schema_name,
            tableName: table.table_name,
            fullName: `${table.schema_name}.${table.table_name}`,
            created: !before,
            insertedColumns: synced.inserted,
            skippedColumns: synced.skipped
          });
        }

        return { imported, existing, tables: loaded };
      })
    );
  }

  private async saveTable(postData: JsonRecord, context: ServiceContext) {
    const { user } = await this.assertAccess(context);
    const parsed = parseTableName(postData.tableName ?? postData.table_name);
    const code = readString(postData.code, 'code', parsed.tableName);
    assertIdentifier(code, 'code');
    const title = readString(postData.title, 'title', parsed.tableName);
    const primaryKey = readString(postData.primaryKey ?? postData.primary_key, 'primaryKey', 'id');
    assertIdentifier(primaryKey, 'primaryKey');
    const createPhysical = postData.createPhysical !== false && postData.create_physical !== false;

    return withPostgresClient(async (client) =>
      runInTransaction(client, async () => {
        if (createPhysical) {
          await client.query(`
            create table if not exists ${quoteRelation(parsed.schemaName, parsed.tableName)} (
              ${quoteIdent(primaryKey)} uuid primary key default gen_random_uuid(),
              created_at timestamp with time zone not null default timezone('utc'::text, now()),
              updated_at timestamp with time zone not null default timezone('utc'::text, now())
            )
          `);
        }

        const saved = await client.query(
          `
            insert into public.entity_design_tables (
              code, schema_name, table_name, title, description, primary_key, status,
              position_x, position_y, metadata, created_by, updated_by
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
            on conflict (schema_name, table_name) do update set
              code = excluded.code,
              title = excluded.title,
              description = excluded.description,
              primary_key = excluded.primary_key,
              status = excluded.status,
              position_x = excluded.position_x,
              position_y = excluded.position_y,
              metadata = excluded.metadata,
              updated_by = excluded.updated_by,
              updated_at = timezone('utc'::text, now())
            returning *
          `,
          [
            code,
            parsed.schemaName,
            parsed.tableName,
            title,
            readOptionalString(postData.description) || null,
            primaryKey,
            normalizeStatus(postData.status),
            Math.trunc(readNumber(postData.positionX ?? postData.position_x, 80)),
            Math.trunc(readNumber(postData.positionY ?? postData.position_y, 80)),
            readJsonObject(postData.metadata ?? postData.metadata_json),
            user.id
          ]
        );

        if (createPhysical) {
          await this.ensurePrimaryColumnMetadata(client, saved.rows[0] as TableRef, user.id);
        }

        return saved.rows[0];
      })
    );
  }

  private async ensurePrimaryColumnMetadata(client: PoolClient, table: TableRef, userId: string) {
    await client.query(
      `
        insert into public.entity_design_columns (
          table_id, column_name, label, data_type, storage_kind, is_required,
          is_primary_key, sort_order, created_by, updated_by
        ) values ($1,$2,$3,'uuid','physical',true,true,0,$4,$4)
        on conflict (table_id, column_name) do update set
          is_primary_key = true,
          is_required = true,
          updated_by = excluded.updated_by,
          updated_at = timezone('utc'::text, now())
      `,
      [table.id, table.primary_key, table.primary_key, userId]
    );
  }

  private async deleteTable(postData: JsonRecord, context: ServiceContext) {
    await this.assertAccess(context);
    return withPostgresClient(async (client) => {
      const table = await this.findTable(client, postData);
      const dropPhysical = readBoolean(postData.dropPhysical ?? postData.drop_physical, false);

      return runInTransaction(client, async () => {
        if (dropPhysical && table) {
          await client.query(`drop table if exists ${quoteRelation(table.schema_name, table.table_name)} cascade`);
        }
        await client.query('delete from public.entity_design_tables where id = $1', [table?.id]);
        return { success: true };
      });
    });
  }

  private async saveColumn(postData: JsonRecord, context: ServiceContext) {
    const { user } = await this.assertAccess(context);
    return withPostgresClient(async (client) => {
      const table = await this.findTable(client, postData);
      if (!table) throw new NotFoundException('Entity design table not found.');
      const input = normalizeColumnInput(postData, table.id);

      return runInTransaction(client, async () => {
        const physicalColumn = await client.query(
          `
            select 1
            from information_schema.columns
            where table_schema = $1
              and table_name = $2
              and column_name = $3
          `,
          [table.schema_name, table.table_name, input.columnName]
        );

        if (input.storageKind === 'physical' && !physicalColumn.rows.length) {
          await client.query(
            `alter table ${quoteRelation(table.schema_name, table.table_name)} add column if not exists ${buildPhysicalColumnDefinition(input)}`
          );
        }

        const saved = await client.query(
          `
            insert into public.entity_design_columns (
              table_id, column_name, label, data_type, data_type_config, storage_kind,
              expression, is_required, is_primary_key, is_unique, default_value,
              sort_order, status, metadata, created_by, updated_by
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
            on conflict (table_id, column_name) do update set
              label = excluded.label,
              data_type = excluded.data_type,
              data_type_config = excluded.data_type_config,
              storage_kind = excluded.storage_kind,
              expression = excluded.expression,
              is_required = excluded.is_required,
              is_primary_key = excluded.is_primary_key,
              is_unique = excluded.is_unique,
              default_value = excluded.default_value,
              sort_order = excluded.sort_order,
              status = excluded.status,
              metadata = excluded.metadata,
              updated_by = excluded.updated_by,
              updated_at = timezone('utc'::text, now())
            returning *
          `,
          [
            input.tableId,
            input.columnName,
            input.label,
            input.dataType,
            readJsonObject(postData.dataTypeConfig ?? postData.data_type_config),
            input.storageKind,
            input.expression,
            input.isRequired,
            input.isPrimaryKey,
            input.isUnique,
            input.defaultValue,
            input.sortOrder,
            input.status,
            input.metadata,
            user.id
          ]
        );

        return saved.rows[0];
      });
    });
  }

  private async deleteColumn(postData: JsonRecord, context: ServiceContext) {
    await this.assertAccess(context);
    const columnName = readString(postData.columnName ?? postData.column_name, 'columnName');
    assertIdentifier(columnName, 'columnName');

    return withPostgresClient(async (client) => {
      const table = await this.findTable(client, postData);
      if (!table) throw new NotFoundException('Entity design table not found.');
      if (columnName === table.primary_key) {
        throw new BadRequestException('Primary key column cannot be deleted.');
      }
      const dropPhysical = postData.dropPhysical !== false && postData.drop_physical !== false;

      return runInTransaction(client, async () => {
        const column = await client.query(
          'select storage_kind from public.entity_design_columns where table_id = $1 and column_name = $2',
          [table.id, columnName]
        );
        const storageKind = String(column.rows[0]?.storage_kind ?? 'physical');

        if (dropPhysical && storageKind === 'physical') {
          await client.query(
            `alter table ${quoteRelation(table.schema_name, table.table_name)} drop column if exists ${quoteIdent(columnName)} cascade`
          );
        }

        await client.query(
          'delete from public.entity_design_columns where table_id = $1 and column_name = $2',
          [table.id, columnName]
        );
        await client.query(
          'delete from public.entity_design_relations where (source_table_id = $1 and source_column_name = $2) or (target_table_id = $1 and target_column_name = $2)',
          [table.id, columnName]
        );
        return { success: true };
      });
    });
  }

  private async saveRelation(postData: JsonRecord, context: ServiceContext) {
    const { user } = await this.assertAccess(context);
    return withPostgresClient(async (client) => {
      const sourceTable = await this.findTable(client, {
        tableId: postData.sourceTableId ?? postData.source_table_id,
        tableCode: postData.sourceTableCode ?? postData.source_table_code,
        tableName: postData.sourceTableName ?? postData.source_table_name
      });
      const targetTable = await this.findTable(client, {
        tableId: postData.targetTableId ?? postData.target_table_id,
        tableCode: postData.targetTableCode ?? postData.target_table_code,
        tableName: postData.targetTableName ?? postData.target_table_name
      });
      if (!sourceTable || !targetTable) {
        throw new NotFoundException('Relation table not found.');
      }

      const sourceColumnName = readString(
        postData.sourceColumnName ?? postData.source_column_name,
        'sourceColumnName'
      );
      const targetColumnName = readString(
        postData.targetColumnName ?? postData.target_column_name,
        'targetColumnName',
        targetTable.primary_key
      );
      assertIdentifier(sourceColumnName, 'sourceColumnName');
      assertIdentifier(targetColumnName, 'targetColumnName');
      const relationType = ['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'].includes(
        String(postData.relationType ?? postData.relation_type)
      )
        ? String(postData.relationType ?? postData.relation_type)
        : 'many_to_one';
      const onDelete = ['no action', 'restrict', 'cascade', 'set null'].includes(
        String(postData.onDelete ?? postData.on_delete)
      )
        ? String(postData.onDelete ?? postData.on_delete)
        : 'no action';
      const enforce = readBoolean(postData.isEnforced ?? postData.is_enforced);
      const constraintName =
        readOptionalString(postData.constraintName ?? postData.constraint_name) ||
        `fk_${sourceTable.table_name}_${sourceColumnName}_${targetTable.table_name}`;
      assertIdentifier(constraintName, 'constraintName');

      return runInTransaction(client, async () => {
        if (enforce) {
          const existingConstraint = await client.query(
            `
              select 1
              from pg_constraint constraints
              join pg_class tables on tables.oid = constraints.conrelid
              join pg_namespace namespaces on namespaces.oid = tables.relnamespace
              where namespaces.nspname = $1
                and tables.relname = $2
                and constraints.conname = $3
            `,
            [sourceTable.schema_name, sourceTable.table_name, constraintName]
          );

          if (!existingConstraint.rows.length) {
            await client.query(
              `
                alter table ${quoteRelation(sourceTable.schema_name, sourceTable.table_name)}
                add constraint ${quoteIdent(constraintName)}
                foreign key (${quoteIdent(sourceColumnName)})
                references ${quoteRelation(targetTable.schema_name, targetTable.table_name)} (${quoteIdent(targetColumnName)})
                on delete ${onDelete}
              `
            );
          }
        }

        const saved = await client.query(
          `
            insert into public.entity_design_relations (
              source_table_id, source_column_name, target_table_id, target_column_name,
              relation_type, is_enforced, constraint_name, on_delete, metadata, created_by, updated_by
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
            on conflict (source_table_id, source_column_name, target_table_id, target_column_name)
            do update set
              relation_type = excluded.relation_type,
              is_enforced = excluded.is_enforced,
              constraint_name = excluded.constraint_name,
              on_delete = excluded.on_delete,
              metadata = excluded.metadata,
              updated_by = excluded.updated_by,
              updated_at = timezone('utc'::text, now())
            returning *
          `,
          [
            sourceTable.id,
            sourceColumnName,
            targetTable.id,
            targetColumnName,
            relationType,
            enforce,
            constraintName,
            onDelete,
            readJsonObject(postData.metadata ?? postData.metadata_json),
            user.id
          ]
        );

        return saved.rows[0];
      });
    });
  }

}
