import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { WorkflowSupabaseService } from '../common/workflow-supabase.service';
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

const WORKFLOW_DEFINITION_COMMAND_RPC = 'workflow_definition_command';

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
    @Inject(WorkflowSupabaseService)
    private readonly persistence?: WorkflowSupabaseService
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
    if (this.persistence?.isConfigured) {
      let request = this.persistence.client
        .from('wf_model')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (query.tenantId) request = request.eq('account_id', query.tenantId);
      if (query.documentType) request = request.eq('document_type', query.documentType);
      if (query.status) request = request.eq('status', query.status);
      const { data, error } = await request;
      if (error) throw new BadRequestException(error.message);
      return (data ?? []).map((row) => mapModel(row as WorkflowModelRow));
    }

    return Array.from(this.models.values())
      .filter((model) => !query.tenantId || model.tenantId === query.tenantId)
      .filter((model) => !query.documentType || model.documentType === query.documentType)
      .filter((model) => !query.status || model.status === query.status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getModel(modelId: string, tenantId?: string) {
    if (this.persistence?.isConfigured) {
      let modelRequest = this.persistence.client
        .from('wf_model')
        .select('*')
        .eq('id', modelId);
      if (tenantId) modelRequest = modelRequest.eq('account_id', tenantId);
      const { data: model, error: modelError } = await modelRequest.maybeSingle();
      if (modelError) throw new BadRequestException(modelError.message);
      if (!model) {
        throw new NotFoundException('Workflow model not found.');
      }

      const { data: versions, error: versionError } = await this.persistence.client
        .from('wf_model_version')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: true });
      if (versionError) throw new BadRequestException(versionError.message);
      return {
        ...mapModel(model as WorkflowModelRow),
        versions: (versions ?? []).map((row) => mapModelVersion(row as WorkflowModelVersionRow))
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

    if (this.persistence?.isConfigured) {
      const { data, error } = await this.persistence.client.rpc(WORKFLOW_DEFINITION_COMMAND_RPC, {
        p_action: 'save_model',
        p_payload: {
        model_id: modelId ?? null,
        account_id: actor.tenantId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        document_type: dto.documentType?.trim() || null,
        draft_schema: schema,
        user_id: actor.userId ?? null
        }
      });
      if (error?.code === 'P0002') throw new NotFoundException(error.message);
      if (error) throw new BadRequestException(error.message);
      if (!isRecord(data)) {
        throw new BadRequestException('Workflow definition RPC returned an invalid model.');
      }
      return mapModel(data as WorkflowModelRow);
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
    if (this.persistence?.isConfigured) {
      const { data, error } = await this.persistence.client.rpc('publish_workflow_model', {
        p_model_id: modelId,
        p_account_id: actor.tenantId,
        p_user_id: actor.userId ?? null,
        p_remark: dto.remark?.trim() || null
      });
      if (error?.code === 'P0002') throw new NotFoundException(error.message);
      if (error) throw new BadRequestException(error.message);
      if (!isRecord(data) || !isRecord(data.model) || !isRecord(data.version) || !isRecord(data.definition)) {
        throw new BadRequestException('Workflow publish RPC returned an invalid result.');
      }
      return {
        model: mapModel(data.model as WorkflowModelRow),
        version: mapModelVersion(data.version as WorkflowModelVersionRow),
        definition: mapDefinition(data.definition as WorkflowDefinitionRow)
      };
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
    if (this.persistence?.isConfigured) {
      let request = this.persistence.client
        .from('wf_process_definition')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(200);
      if (query.tenantId) request = request.eq('account_id', query.tenantId);
      if (query.documentType) request = request.eq('document_type', query.documentType);
      if (query.status) request = request.eq('status', query.status);
      const { data, error } = await request;
      if (error) throw new BadRequestException(error.message);
      return (data ?? []).map((row) => mapDefinition(row as WorkflowDefinitionRow));
    }

    return Array.from(this.definitions.values())
      .filter((definition) => !query.tenantId || definition.tenantId === query.tenantId)
      .filter((definition) => !query.documentType || definition.documentType === query.documentType)
      .filter((definition) => !query.status || definition.status === query.status)
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  async getDefinition(definitionId: string, tenantId?: string) {
    if (this.persistence?.isConfigured) {
      let request = this.persistence.client
        .from('wf_process_definition')
        .select('*')
        .eq('id', definitionId);
      if (tenantId) request = request.eq('account_id', tenantId);
      const { data: row, error } = await request.maybeSingle();
      if (error) throw new BadRequestException(error.message);
      if (!row) {
        throw new NotFoundException('Workflow definition not found.');
      }
      return mapDefinition(row as WorkflowDefinitionRow);
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
    if (this.persistence?.isConfigured) {
      const { data, error } = await this.persistence.client.rpc(WORKFLOW_DEFINITION_COMMAND_RPC, {
        p_action: 'disable_definition',
        p_payload: {
          definition_id: definitionId,
          account_id: tenantId ?? null
        }
      });
      if (error?.code === 'P0002') throw new NotFoundException(error.message);
      if (error) throw new BadRequestException(error.message);
      if (!isRecord(data)) {
        throw new BadRequestException('Workflow definition RPC returned an invalid definition.');
      }
      return mapDefinition(data as WorkflowDefinitionRow);
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

}

type WorkflowModelRow = {
  id: string;
  account_id: string;
  code: string;
  name: string;
  document_type: string | null;
  status: WorkflowModelRecord['status'];
  current_version: number;
  draft_schema: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkflowModelVersionRow = {
  id: string;
  model_id: string;
  version: number;
  schema: Record<string, unknown>;
  remark: string | null;
  created_by: string | null;
  created_at: Date | string;
};

type WorkflowDefinitionRow = {
  id: string;
  account_id: string;
  model_id: string;
  model_version_id: string;
  code: string;
  name: string;
  version: number;
  document_type: string | null;
  schema: Record<string, unknown>;
  status: WorkflowProcessDefinitionRecord['status'];
  published_by: string | null;
  published_at: Date | string;
};

function mapModel(row: WorkflowModelRow): WorkflowModelRecord {
  return {
    id: row.id,
    tenantId: row.account_id,
    code: row.code,
    name: row.name,
    ...(row.document_type ? { documentType: row.document_type } : {}),
    status: row.status,
    currentVersion: row.current_version,
    draftSchema: row.draft_schema,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
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
    createdAt: toIso(row.created_at)
  };
}

function mapDefinition(row: WorkflowDefinitionRow): WorkflowProcessDefinitionRecord {
  return {
    id: row.id,
    tenantId: row.account_id,
    modelId: row.model_id,
    modelVersionId: row.model_version_id,
    code: row.code,
    name: row.name,
    version: row.version,
    ...(row.document_type ? { documentType: row.document_type } : {}),
    schema: row.schema,
    status: row.status,
    ...(row.published_by ? { publishedBy: row.published_by } : {}),
    publishedAt: toIso(row.published_at)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
