import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../common/database.service';
import {
  type PublishWorkflowModelDto,
  type SaveWorkflowModelDto,
  type WorkflowDefinitionQuery,
  type WorkflowModelQuery
} from './definition.dto';
import type {
  WorkflowModelRecord,
  WorkflowModelVersionRecord,
  WorkflowProcessDefinitionRecord,
  WorkflowRequestActor
} from './definition.types';
import {
  normalizeWorkflowDraftSchema,
  validateWorkflowDraftSchema
} from '../workflow.model';

export type WorkflowCapability = {
  nodeTypes: Array<{
    type: string;
    label: string;
    category: 'event' | 'task' | 'gateway' | 'notification';
  }>;
  assigneeStrategies: string[];
  conditionTypes: string[];
};

@Injectable()
export class DefinitionService {
  private readonly models = new Map<string, WorkflowModelRecord>();
  private readonly modelVersions = new Map<string, WorkflowModelVersionRecord[]>();
  private readonly definitions = new Map<string, WorkflowProcessDefinitionRecord>();

  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly database?: DatabaseService
  ) {}

  getCapabilities(): WorkflowCapability {
    return {
      nodeTypes: [
        { type: 'start', label: '开始', category: 'event' },
        { type: 'approval', label: '审批', category: 'task' },
        { type: 'sign', label: '会签', category: 'task' },
        { type: 'orSign', label: '或签', category: 'task' },
        { type: 'condition', label: '条件', category: 'gateway' },
        { type: 'cc', label: '抄送', category: 'notification' },
        { type: 'parallelGateway', label: '并行网关', category: 'gateway' },
        { type: 'serviceTask', label: '服务节点', category: 'task' },
        { type: 'timer', label: '定时节点', category: 'event' },
        { type: 'subProcess', label: '子流程', category: 'task' },
        { type: 'end', label: '结束', category: 'event' }
      ],
      assigneeStrategies: [
        'users',
        'roles',
        'departments',
        'initiatorManager',
        'field',
        'expression'
      ],
      conditionTypes: ['always', 'expression', 'field']
    };
  }

  async listModels(query: WorkflowModelQuery = {}) {
    if (this.database?.isConfigured) {
      const values: unknown[] = [];
      const conditions: string[] = [];
      addCondition(conditions, values, 'tenant_id', query.tenantId);
      addCondition(conditions, values, 'document_type', query.documentType);
      addCondition(conditions, values, 'status', query.status);
      const result = await this.database.query<WorkflowModelRow>(
        `select * from public.wf_model
        ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
        order by updated_at desc
        limit 200`,
        values
      );
      return result.rows.map(mapModel);
    }

    return Array.from(this.models.values())
      .filter((model) => !query.tenantId || model.tenantId === query.tenantId)
      .filter((model) => !query.documentType || model.documentType === query.documentType)
      .filter((model) => !query.status || model.status === query.status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getModel(modelId: string, tenantId?: string) {
    if (this.database?.isConfigured) {
      const modelResult = await this.database.query<WorkflowModelRow>(
        'select * from public.wf_model where id = $1 and ($2::text is null or tenant_id = $2)',
        [modelId, tenantId ?? null]
      );
      const model = modelResult.rows[0];
      if (!model) {
        throw new NotFoundException('Workflow model not found.');
      }

      const versionResult = await this.database.query<WorkflowModelVersionRow>(
        'select * from public.wf_model_version where model_id = $1 order by version',
        [modelId]
      );
      return {
        ...mapModel(model),
        versions: versionResult.rows.map(mapModelVersion)
      };
    }

    const model = this.models.get(modelId);
    if (!model) {
      throw new NotFoundException('Workflow model not found.');
    }
    if (tenantId && model.tenantId !== tenantId) {
      throw new NotFoundException('Workflow model not found.');
    }

    return {
      ...model,
      versions: this.modelVersions.get(model.id) ?? []
    };
  }

  async saveModel(dto: SaveWorkflowModelDto, actor: WorkflowRequestActor, modelId?: string) {
    const now = new Date().toISOString();
    const schema = normalizeWorkflowDraftSchema(dto);
    validateWorkflowDraftSchema(schema, false);

    if (this.database?.isConfigured) {
      const code = dto.code.trim();
      const result = await this.database.query<WorkflowModelRow>(
        `insert into public.wf_model (
          id, tenant_id, code, name, document_type, status, current_version,
          draft_schema, created_by, updated_by, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11)
        on conflict (tenant_id, code) do update set
          code = excluded.code,
          name = excluded.name,
          document_type = excluded.document_type,
          draft_schema = excluded.draft_schema,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
        where $12::uuid is null or public.wf_model.id = $12::uuid
        returning *`,
        [
          modelId ?? randomUUID(),
          actor.tenantId,
          code,
          dto.name.trim(),
          dto.documentType?.trim() || null,
          'draft',
          0,
          JSON.stringify(schema),
          actor.userId ?? null,
          actor.userId ?? null,
          now,
          modelId ?? null
        ]
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('Workflow model not found.');
      }
      return mapModel(row);
    }

    const existing = modelId ? this.models.get(modelId) : this.findModelByCode(actor.tenantId, dto.code);
    if (modelId && !existing) {
      throw new NotFoundException('Workflow model not found.');
    }

    const model: WorkflowModelRecord = {
      id: existing?.id ?? randomUUID(),
      tenantId: actor.tenantId,
      code: dto.code.trim(),
      name: dto.name.trim(),
      ...(dto.documentType?.trim() ? { documentType: dto.documentType.trim() } : {}),
      status: existing?.status ?? 'draft',
      currentVersion: existing?.currentVersion ?? 0,
      draftSchema: schema,
      createdBy: existing?.createdBy ?? actor.userId,
      updatedBy: actor.userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.models.set(model.id, model);
    return model;
  }

  async publishModel(modelId: string, dto: PublishWorkflowModelDto, actor: WorkflowRequestActor) {
    if (this.database?.isConfigured) {
      return this.database.withClient(async (client) => {
        await client.query('begin');
        try {
          const modelResult = await client.query<WorkflowModelRow>(
            'select * from public.wf_model where id = $1 and tenant_id = $2 for update',
            [modelId, actor.tenantId]
          );
          const modelRow = modelResult.rows[0];
          if (!modelRow) {
            throw new NotFoundException('Workflow model not found.');
          }
          const model = mapModel(modelRow);
          validateWorkflowDraftSchema(model.draftSchema, true);
          await assertWorkflowAccountUsers(
            { query: (text, values) => client.query(text, values) },
            actor.tenantId,
            collectFixedUserIds(model.draftSchema)
          );

          const now = new Date().toISOString();
          const version = model.currentVersion + 1;
          const versionId = randomUUID();
          const versionResult = await client.query<WorkflowModelVersionRow>(
            `insert into public.wf_model_version (
              id, model_id, version, schema, remark, created_by, created_at
            ) values ($1, $2, $3, $4::jsonb, $5, $6, $7)
            returning *`,
            [
              versionId,
              model.id,
              version,
              JSON.stringify(model.draftSchema),
              dto.remark?.trim() || null,
              actor.userId ?? null,
              now
            ]
          );

          const definitionId = randomUUID();
          const definitionResult = await client.query<WorkflowDefinitionRow>(
            `insert into public.wf_process_definition (
              id, tenant_id, model_id, model_version_id, code, name, version,
              document_type, schema, status, published_by, published_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'active', $10, $11)
            returning *`,
            [
              definitionId,
              model.tenantId,
              model.id,
              versionId,
              model.code,
              model.name,
              version,
              model.documentType ?? null,
              JSON.stringify(model.draftSchema),
              actor.userId ?? null,
              now
            ]
          );

          await insertDefinitionSnapshots(client, definitionId, model.draftSchema);

          const updatedModelResult = await client.query<WorkflowModelRow>(
            `update public.wf_model
            set status = 'published',
                current_version = $2,
                updated_by = $3,
                updated_at = $4
            where id = $1
            returning *`,
            [model.id, version, actor.userId ?? null, now]
          );

          await client.query('commit');
          return {
            model: mapModel(updatedModelResult.rows[0]),
            version: mapModelVersion(versionResult.rows[0]),
            definition: mapDefinition(definitionResult.rows[0])
          };
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    }

    const model = this.models.get(modelId);
    if (!model) {
      throw new NotFoundException('Workflow model not found.');
    }
    if (model.tenantId !== actor.tenantId) {
      throw new NotFoundException('Workflow model not found.');
    }

    validateWorkflowDraftSchema(model.draftSchema, true);

    const now = new Date().toISOString();
    const version = model.currentVersion + 1;
    const modelVersion: WorkflowModelVersionRecord = {
      id: randomUUID(),
      modelId: model.id,
      version,
      schema: model.draftSchema,
      ...(dto.remark?.trim() ? { remark: dto.remark.trim() } : {}),
      createdBy: actor.userId,
      createdAt: now
    };

    const definition: WorkflowProcessDefinitionRecord = {
      id: randomUUID(),
      tenantId: model.tenantId,
      modelId: model.id,
      modelVersionId: modelVersion.id,
      code: model.code,
      name: model.name,
      version,
      ...(model.documentType ? { documentType: model.documentType } : {}),
      schema: model.draftSchema,
      status: 'active',
      publishedBy: actor.userId,
      publishedAt: now
    };

    this.modelVersions.set(model.id, [...(this.modelVersions.get(model.id) ?? []), modelVersion]);
    this.definitions.set(definition.id, definition);
    this.models.set(model.id, {
      ...model,
      status: 'published',
      currentVersion: version,
      updatedBy: actor.userId,
      updatedAt: now
    });

    return {
      model: this.models.get(model.id),
      version: modelVersion,
      definition
    };
  }

  async listDefinitions(query: WorkflowDefinitionQuery = {}) {
    if (this.database?.isConfigured) {
      const values: unknown[] = [];
      const conditions: string[] = [];
      addCondition(conditions, values, 'tenant_id', query.tenantId);
      addCondition(conditions, values, 'document_type', query.documentType);
      addCondition(conditions, values, 'status', query.status);
      const result = await this.database.query<WorkflowDefinitionRow>(
        `select * from public.wf_process_definition
        ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
        order by published_at desc
        limit 200`,
        values
      );
      return result.rows.map(mapDefinition);
    }

    return Array.from(this.definitions.values())
      .filter((definition) => !query.tenantId || definition.tenantId === query.tenantId)
      .filter((definition) => !query.documentType || definition.documentType === query.documentType)
      .filter((definition) => !query.status || definition.status === query.status)
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  async getDefinition(definitionId: string, tenantId?: string) {
    if (this.database?.isConfigured) {
      const result = await this.database.query<WorkflowDefinitionRow>(
        'select * from public.wf_process_definition where id = $1 and ($2::text is null or tenant_id = $2)',
        [definitionId, tenantId ?? null]
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('Workflow definition not found.');
      }
      return mapDefinition(row);
    }

    const definition = this.definitions.get(definitionId);
    if (!definition) {
      throw new NotFoundException('Workflow definition not found.');
    }
    if (tenantId && definition.tenantId !== tenantId) {
      throw new NotFoundException('Workflow definition not found.');
    }

    return definition;
  }

  async disableDefinition(definitionId: string, tenantId?: string) {
    if (this.database?.isConfigured) {
      const result = await this.database.query<WorkflowDefinitionRow>(
        `update public.wf_process_definition
        set status = 'disabled'
        where id = $1 and ($2::text is null or tenant_id = $2)
        returning *`,
        [definitionId, tenantId ?? null]
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('Workflow definition not found.');
      }
      return mapDefinition(row);
    }

    const definition = this.definitions.get(definitionId);
    if (!definition) {
      throw new NotFoundException('Workflow definition not found.');
    }
    if (tenantId && definition.tenantId !== tenantId) {
      throw new NotFoundException('Workflow definition not found.');
    }

    const nextDefinition: WorkflowProcessDefinitionRecord = {
      ...definition,
      status: 'disabled'
    };
    this.definitions.set(definitionId, nextDefinition);
    return nextDefinition;
  }

  private findModelByCode(tenantId: string, code: string) {
    return Array.from(this.models.values()).find(
      (model) => model.tenantId === tenantId && model.code === code.trim()
    );
  }

  private async findDbModelById(modelId: string) {
    const result = await this.database?.query<WorkflowModelRow>(
      'select * from public.wf_model where id = $1',
      [modelId]
    );
    return result?.rows[0] ? mapModel(result.rows[0]) : undefined;
  }

  private async findDbModelByCode(tenantId: string, code: string) {
    const result = await this.database?.query<WorkflowModelRow>(
      'select * from public.wf_model where tenant_id = $1 and code = $2',
      [tenantId, code.trim()]
    );
    return result?.rows[0] ? mapModel(result.rows[0]) : undefined;
  }
}

type WorkflowModelRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  document_type: string | null;
  status: WorkflowModelRecord['status'];
  current_version: number;
  draft_schema: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type WorkflowModelVersionRow = QueryResultRow & {
  id: string;
  model_id: string;
  version: number;
  schema: Record<string, unknown>;
  remark: string | null;
  created_by: string | null;
  created_at: Date;
};

type WorkflowDefinitionRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  model_id: string;
  model_version_id: string;
  code: string;
  name: string;
  version: number;
  document_type: string | null;
  schema: Record<string, unknown>;
  status: WorkflowProcessDefinitionRecord['status'];
  published_by: string | null;
  published_at: Date;
};

function mapModel(row: WorkflowModelRow): WorkflowModelRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    ...(row.document_type ? { documentType: row.document_type } : {}),
    status: row.status,
    currentVersion: row.current_version,
    draftSchema: row.draft_schema,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapModelVersion(row: WorkflowModelVersionRow): WorkflowModelVersionRecord {
  return {
    id: row.id,
    modelId: row.model_id,
    version: row.version,
    schema: row.schema,
    ...(row.remark ? { remark: row.remark } : {}),
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    createdAt: row.created_at.toISOString()
  };
}

function mapDefinition(row: WorkflowDefinitionRow): WorkflowProcessDefinitionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    modelId: row.model_id,
    modelVersionId: row.model_version_id,
    code: row.code,
    name: row.name,
    version: row.version,
    ...(row.document_type ? { documentType: row.document_type } : {}),
    schema: row.schema,
    status: row.status,
    ...(row.published_by ? { publishedBy: row.published_by } : {}),
    publishedAt: row.published_at.toISOString()
  };
}

function addCondition(conditions: string[], values: unknown[], column: string, value: unknown) {
  if (value === undefined || value === null || value === '') return;
  values.push(value);
  conditions.push(`${column} = $${values.length}`);
}

async function insertDefinitionSnapshots(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  definitionId: string,
  schema: Record<string, unknown>
) {
  const nodes = Array.isArray(schema.nodes) ? schema.nodes.filter(isRecord) : [];
  const edges = Array.isArray(schema.edges) ? schema.edges.filter(isRecord) : [];

  for (const node of nodes) {
    await client.query(
      `insert into public.wf_node_definition (
        definition_id, node_id, node_type, name, config
      ) values ($1, $2, $3, $4, $5::jsonb)
      on conflict (definition_id, node_id) do update set
        node_type = excluded.node_type,
        name = excluded.name,
        config = excluded.config`,
      [
        definitionId,
        readString(node.id),
        readString(node.type),
        readString(node.name, readString(node.type)),
        JSON.stringify(isRecord(node.config) ? node.config : {})
      ]
    );
  }

  for (const edge of edges) {
    await client.query(
      `insert into public.wf_edge_definition (
        definition_id, edge_id, source_node_id, target_node_id, condition, priority
      ) values ($1, $2, $3, $4, $5::jsonb, $6)
      on conflict (definition_id, edge_id) do update set
        source_node_id = excluded.source_node_id,
        target_node_id = excluded.target_node_id,
        condition = excluded.condition,
        priority = excluded.priority`,
      [
        definitionId,
        readString(edge.id),
        readString(edge.source),
        readString(edge.target),
        isRecord(edge.condition) ? JSON.stringify(edge.condition) : null,
        typeof edge.priority === 'number' ? edge.priority : null
      ]
    );
  }
}

function collectFixedUserIds(schema: Record<string, unknown>) {
  const nodes = Array.isArray(schema.nodes) ? schema.nodes.filter(isRecord) : [];
  return [
    ...new Set(
      nodes.flatMap((node) => {
        const config = isRecord(node.config) ? node.config : {};
        const strategy = isRecord(config.assigneeStrategy) ? config.assigneeStrategy : {};
        if (strategy.type !== 'users' || !Array.isArray(strategy.userIds)) return [];
        return strategy.userIds
          .map((userId) => typeof userId === 'string' ? userId.trim() : '')
          .filter(Boolean);
      })
    )
  ];
}

async function assertWorkflowAccountUsers(
  client: { query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  tenantId: string,
  userIds: string[]
) {
  if (!userIds.length) return;
  if (!isUuid(tenantId) || userIds.some((userId) => !isUuid(userId))) {
    throw new BadRequestException('Fixed workflow users and account set must use valid UUIDs.');
  }

  const result = await client.query<{ user_id: string }>(
    `select memberships.user_id::text
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where memberships.account_id = $1::uuid
      and memberships.user_id = any($2::uuid[])
      and accounts.status = 'active'`,
    [tenantId, userIds]
  );
  const memberIds = new Set(result.rows.map((row) => row.user_id));
  if (userIds.some((userId) => !memberIds.has(userId))) {
    throw new BadRequestException('Every fixed workflow user must belong to the active account set.');
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
