import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';
import {
  BaseService,
  type CrudContext,
  type ResourceConfigMap,
  type ServicePostData
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  assertWorkflowInternalCapability
} from '../common/workflow-internal-capabilities';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission
} from '../common/utils/supabase';
import { TriggerCredentialsService } from '../workflow/trigger/trigger-credentials.service';
import { TriggerDevClient } from '../workflow/trigger/trigger-dev.client';
import { buildFreppleInput } from './execution/frepple-input.builder';
import {
  createPlanningPool,
  PlanningDataLoader
} from './execution/planning-data-loader';
import { getPlanningEngineCapabilities } from './execution/planning-engine';
import { resolvePlanningParameters } from './execution/planning-parameters';
import { preflightPlanningData } from './execution/planning-preflight';
import {
  loadPlanningConsoleDataset,
  parsePlanningConsoleRequest
} from './planning-console';
import { planningResources } from './planning.resources';
import {
  PLANNING_MANAGE_PERMISSION,
  PLANNING_VIEW_PERMISSION
} from './planning.resources';
import {
  PLANNING_MODEL_BY_KEY,
  type PlanningModelDefinition
} from './planning.models';

@Injectable()
export class PlanningService extends BaseService {
  constructor(
    @Optional()
    @Inject(TriggerDevClient)
    private readonly triggerClient?: TriggerDevClient,
    @Optional()
    @Inject(TriggerCredentialsService)
    private readonly triggerCredentials?: TriggerCredentialsService
  ) {
    super();
  }

  protected override resources(): ResourceConfigMap {
    return planningResources();
  }

  protected override async listItems(
    postData: ServicePostData,
    context: ServiceContext
  ) {
    const result = await super.listItems(postData, context);
    const resolved = this.tryResolveResource(postData, this.readListItemsType(postData));
    const model = resolved ? PLANNING_MODEL_BY_KEY.get(resolved.name) : undefined;
    if (!model) return result;

    const rows = Array.isArray(result)
      ? result as Record<string, unknown>[]
      : this.isRecord(result) && Array.isArray(result.rows)
        ? result.rows as Record<string, unknown>[]
        : [];
    if (!rows.length) return result;

    await this.attachRelationLabels(rows, model, context);
    return result;
  }

  protected override async buildWritePayload(
    ctx: CrudContext,
    action: 'create' | 'update',
    sourceOverride?: Record<string, unknown>
  ) {
    const model = PLANNING_MODEL_BY_KEY.get(ctx.resourceName);
    if (!model) {
      return super.buildWritePayload(ctx, action, sourceOverride);
    }

    const source = sourceOverride ?? ctx.data;
    const normalized = { ...source };
    for (const field of model.fields) {
      if (field.required || normalized[field.name] !== '') continue;
      if (field.kind !== 'text') normalized[field.name] = null;
    }

    return super.buildWritePayload(ctx, action, normalized);
  }

  protected override async executeAction(
    method: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (method === 'getRuntimeCapabilities') {
      const { client, user } = await getCurrentUser(context);
      const authorization = await getUserAuthorization(client, user.id, {
        accountId: context.accountId
      });
      const canManage = hasRequiredPermission(authorization, PLANNING_MANAGE_PERMISSION);
      const engine = canManage ? getPlanningEngineCapabilities() : undefined;
      const trigger = canManage
        ? this.triggerCredentials
          ? await this.triggerCredentials.getStatus()
          : { configured: false, reason: 'Trigger.dev client is unavailable.' }
        : undefined;
      const worker = canManage && trigger?.configured
        ? await this.readPlanningWorkerStatus(context.accountId)
        : undefined;
      return {
        canManage,
        accessLabel: canManage ? '可执行' : '只读',
        engineLabel: !canManage ? '-' : engine?.available ? '可用' : '不可用',
        triggerLabel: !canManage ? '-' : !trigger?.configured
          ? '未配置'
          : worker?.online === true
            ? 'Worker 在线'
            : worker?.online === false
              ? 'Worker 离线'
              : '在线状态未知',
        ...(canManage ? { engine, trigger, worker, supportedJobTypes: ['supply_plan'] } : {})
      };
    }

    if (method === 'getPlanningCapabilities') {
      await this.authorizeExecution(context);
      return {
        engine: getPlanningEngineCapabilities(),
        trigger: this.triggerCredentials
          ? await this.triggerCredentials.getStatus()
          : { configured: false, reason: 'Trigger.dev client is unavailable.' },
        supportedJobTypes: ['supply_plan']
      };
    }

    if (method === 'preflightSupplyPlan') {
      return this.runPreflightSupplyPlan(postData, context);
    }

    if (method === 'preflightSupplyPlanIssues') {
      const report = await this.runPreflightSupplyPlan(postData, context);
      return [
        ...report.errors.map((issue) => ({ ...issue, level: 'error', severity: 'error' })),
        ...report.warnings.map((issue) => ({ ...issue, level: 'warning', severity: 'warning' })),
        ...(report.buildError ? [{
          code: 'INPUT_BUILD_ERROR',
          message: report.buildError,
          level: 'error',
          severity: 'error'
        }] : []),
        ...(!report.errors.length && !report.warnings.length && !report.buildError ? [{
          code: 'PREFLIGHT_OK',
          message: '数据完整性预检通过，可以启动排产。',
          level: 'success',
          severity: 'success',
          snapshotHash: report.inputSnapshot.hash
        }] : [])
      ];
    }

    if (method === 'getPlanningConsoleOptions') {
      const { client } = await this.authorizeConsoleRead(context);
      const accountId = this.accountValue(context, 'account_id');
      const optionType = this.readOptionalString(postData.optionType ?? postData.option_type);
      const optionResources = {
        scenario: { table: 'planning_scenario', labelField: 'name', fallbackField: 'id' },
        item: { table: 'planning_item', labelField: 'display_name', fallbackField: 'name' },
        resource: { table: 'planning_resource', labelField: 'name', fallbackField: 'id' },
        operation: { table: 'planning_operation', labelField: 'name', fallbackField: 'id' }
      } as const;
      const option = optionResources[optionType as keyof typeof optionResources];
      if (!option) throw new BadRequestException(`Unsupported planning console option type: ${optionType || '(empty)'}.`);
      const { data, error } = await client
        .from(option.table)
        .select(`id,${option.labelField},${option.fallbackField}`)
        .eq('account_id', accountId)
        .order(option.labelField, { ascending: true })
        .limit(1000);
      if (error) throw new BadRequestException(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: row.id,
        label: String(row[option.labelField] ?? row[option.fallbackField] ?? row.id ?? '')
      }));
    }

    if (method === 'listInventoryBuffers') {
      assertWorkflowInternalCapability(
        context,
        'planning.listInventoryBuffers'
      );
      const accountId = this.accountValue(context, 'account_id');
      const itemId = this.readOptionalString(postData.itemId ?? postData.item_id);
      const locationId = this.readOptionalString(
        postData.locationId ?? postData.location_id
      );
      const requestedLimit = Number(postData.limit ?? 50);
      const limit = Number.isInteger(requestedLimit)
        ? Math.min(100, Math.max(1, requestedLimit))
        : 50;
      let query = createSupabaseClient('admin', context)
        .from('planning_buffer')
        .select('*')
        .eq('account_id', accountId);
      if (itemId) query = query.eq('item_id', itemId);
      if (locationId) query = query.eq('location_id', locationId);
      const { data, error } = await query
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw new BadRequestException(error.message);
      return data ?? [];
    }

    if (method === 'getPlanningConsoleData') {
      const { client } = await this.authorizeConsoleRead(context);
      const accountId = this.accountValue(context, 'account_id');
      const request = parsePlanningConsoleRequest(postData);
      return loadPlanningConsoleDataset(
        client,
        accountId,
        request.dataset,
        request.filters
      );
    }

    if (method === 'runSupplyPlan') {
      const { client, user } = await this.authorizeExecution(context);
      this.assertSupplyPlan(postData);
      const engine = getPlanningEngineCapabilities();
      if (!engine.available) {
        throw new ServiceUnavailableException(
          `Planning engine is unavailable: ${engine.reason ?? 'unknown configuration error.'}`
        );
      }
      const trigger = this.triggerCredentials
        ? await this.triggerCredentials.getStatus()
        : { configured: false, reason: 'Trigger.dev client is unavailable.' };
      if (!trigger.configured) {
        const detail = 'error' in trigger
          ? trigger.error
          : 'reason' in trigger
            ? trigger.reason
            : undefined;
        throw new ServiceUnavailableException(
          `Background planning service is unavailable${detail ? `: ${detail}` : '.'}`
        );
      }
      const accountId = this.accountValue(context, 'account_id');
      const scenarioId = this.readUuid(
        postData.scenarioId ?? postData.scenario_id,
        'scenarioId'
      );
      const overrides = this.readJsonObject(postData.overrides, 'overrides');
      const name = this.readOptionalString(postData.name);
      const { data, error } = await client.rpc('planning_create_supply_run', {
        p_account_id: accountId,
        p_scenario_id: scenarioId,
        p_name: name ?? null,
        p_arguments: { jobType: 'supply_plan', overrides },
        p_submitted_by: user.id,
        p_job_type: 'supply_plan'
      });
      if (error) throw new BadRequestException(error.message);
      const created = this.requireRecord(data, 'Planning run creation returned an invalid result.');
      const run = this.requireRecord(created.run, 'Planning run creation omitted the run.');
      const version = this.requireRecord(created.version, 'Planning run creation omitted the version.');
      const runId = this.readUuid(run.id, 'run.id');
      const planVersionId = this.readUuid(version.id, 'version.id');
      const triggerClient = this.requireTriggerClient();
      let triggerRunId: string | undefined;
      try {
        const handle = await triggerClient.triggerTask('planning.run', {
          accountId,
          jobType: 'supply_plan',
          overrides,
          planVersionId,
          runId,
          scenarioId
        }, {
          idempotencyKey: `planning-run:${runId}`,
          tags: [
            `tenant:${accountId}`,
            `planning-run:${runId}`,
            `planning-scenario:${scenarioId}`
          ]
        });
        triggerRunId = handle.id;
        const projection = await client.rpc('planning_project_trigger_run', {
          p_account_id: accountId,
          p_run_id: runId,
          p_trigger_run_id: handle.id
        });
        if (projection.error) throw new Error(projection.error.message);
        return {
          run: projection.data,
          version,
          triggerRunId: handle.id
        };
      } catch (triggerError) {
        if (triggerRunId) {
          await triggerClient.cancelRun(triggerRunId).catch(() => undefined);
        }
        try {
          await client.rpc('planning_fail_supply_run', {
            p_account_id: accountId,
            p_run_id: runId,
            p_message: triggerError instanceof Error ? triggerError.message : String(triggerError)
          });
        } catch {
          // Preserve the Trigger.dev failure returned to the caller.
        }
        throw new ServiceUnavailableException(
          `Unable to start planning run: ${triggerError instanceof Error ? triggerError.message : String(triggerError)}`
        );
      }
    }

    if (method === 'cancelPlanningRun') {
      const { client } = await this.authorizeExecution(context);
      const accountId = this.accountValue(context, 'account_id');
      const runId = this.readUuid(postData.runId ?? postData.run_id ?? postData.id, 'runId');
      const { data, error } = await client.rpc('planning_cancel_supply_run', {
        p_account_id: accountId,
        p_run_id: runId
      });
      if (error) throw new BadRequestException(error.message);
      const canceled = this.requireRecord(data, 'Planning cancellation returned an invalid result.');
      const triggerRunId = this.readOptionalString(canceled.triggerRunId);
      let triggerCancellationError: string | undefined;
      if (triggerRunId && this.triggerClient) {
        try {
          await this.triggerClient.cancelRun(triggerRunId);
        } catch (cancelError) {
          triggerCancellationError = cancelError instanceof Error
            ? cancelError.message
            : String(cancelError);
        }
      }
      return {
        ...canceled,
        ...(triggerCancellationError ? { triggerCancellationError } : {})
      };
    }

    if (method === 'getPlanningRunDetail') {
      const { client } = await this.authorizeExecution(context);
      const accountId = this.accountValue(context, 'account_id');
      const runId = this.readUuid(postData.runId ?? postData.run_id ?? postData.id, 'runId');
      const { data, error } = await client.rpc('planning_get_run_detail', {
        p_account_id: accountId,
        p_run_id: runId
      });
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    if (method === 'listRelationOptions') {
      const relation = this.resolveResource(postData);
      const ctx = await this.createCrudContext('list', postData, context, relation);
      await this.assertPermission(ctx);
      const client = ctx.client;

      const businessField = this.readOptionalString(postData.labelField ?? postData.label_field);
      const relationModel = PLANNING_MODEL_BY_KEY.get(relation.name);
      const labelField = businessField || relationModel?.labelField ||
        relationModel?.businessKey || 'id';
      const fallbackField = relationModel?.businessKey || 'id';
      this.assertIdentifier(labelField, 'labelField');
      this.assertIdentifier(fallbackField, 'fallbackField');
      const filters = this.readRecord(postData.filters);
      const excludeId = this.readOptionalString(postData.excludeId ?? postData.exclude_id);
      let query = client
        .from(relation.config.tableName)
        .select('*')
        .eq(
          relation.config.accountField ?? 'account_id',
          this.accountValue(context, relation.config.accountField ?? 'account_id')
        );
      query = this.applyListItemsFilters(query, filters);
      if (excludeId) {
        this.assertIdentifier(relation.config.primaryKey ?? 'id', 'primaryKey');
        query = query.neq(relation.config.primaryKey ?? 'id', excludeId);
      }
      const { data, error } = await query
        .order(labelField, { ascending: true })
        .limit(1000);
      if (error) throw new BadRequestException(error.message);
      const options = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
          id: row.id,
          label: String(row[labelField] ?? row[fallbackField] ?? row.id ?? ''),
          parentId: row.parent_id ?? null
        }));
      return this.readBoolean(postData.tree, false)
        ? this.buildRelationOptionTree(options)
        : options.map(({ parentId: _parentId, ...option }) => option);
    }

    if (method === 'listPlanningConsoleVersions') {
      const { client } = await this.authorizeConsoleRead(context);
      const accountId = this.accountValue(context, 'account_id');
      const scenarioId = this.readOptionalString(postData.scenarioId ?? postData.scenario_id);
      let query = client
        .from('planning_plan_version')
        .select('id,code,name,status,scenario_id,is_current,version_no')
        .eq('account_id', accountId)
        .order('is_current', { ascending: false })
        .order('version_no', { ascending: false, nullsFirst: false })
        .limit(1000);
      if (scenarioId) query = query.eq('scenario_id', scenarioId);
      const { data, error } = await query;
      if (error) throw new BadRequestException(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        ...row,
        label: `${String(row.code ?? row.id)}${row.is_current ? ' · 当前' : ''}`
      }));
    }

    if (method === 'getPlanningParameter') {
      const name = this.readOptionalString(postData.name);
      if (!name) throw new BadRequestException('name is required.');
      const parameter = this.resolveResource({ resource: 'planning_parameter' });
      const ctx = await this.createCrudContext('list', postData, context, parameter);
      await this.assertPermission(ctx);
      const { data, error } = await ctx.client
        .from(parameter.config.tableName)
        .select('name,value,description,updated_at')
        .eq('account_id', this.accountValue(context, 'account_id'))
        .eq('name', name)
        .maybeSingle();
      if (error) throw new BadRequestException(error.message);
      return data ?? null;
    }

    if (method === 'syncSalesOrderDemands') {
      const relation = this.resolveResource({ resource: 'planning_demand' });
      const ctx = await this.createCrudContext('update', postData, context, relation);
      await this.assertPermission(ctx);
      const lineIds = Array.isArray(postData.lineIds ?? postData.line_ids)
        ? (postData.lineIds ?? postData.line_ids) as unknown[]
        : [];
      const normalizedLineIds = lineIds
        .map((value) => this.readOptionalString(value))
        .filter(Boolean);
      const { data, error } = await ctx.client.rpc('planning_resync_sales_orders', {
        p_account_id: this.accountValue(context, 'account_id'),
        p_line_ids: normalizedLineIds.length ? normalizedLineIds : null
      });
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    if (method === 'publishPlanVersion') {
      const relation = this.resolveResource({ resource: 'planning_plan_version' });
      const ctx = await this.createCrudContext('update', postData, context, relation);
      await this.assertPermission(ctx);
      const versionId = this.readOptionalString(
        postData.id ?? postData.versionId ?? postData.version_id
      );
      if (!versionId) throw new BadRequestException('id is required.');
      const { data, error } = await ctx.client.rpc('planning_publish_plan_version', {
        p_account_id: this.accountValue(context, 'account_id'),
        p_version_id: versionId
      });
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    return super.executeAction(method, postData, context);
  }

  private async attachRelationLabels(
    rows: Record<string, unknown>[],
    model: PlanningModelDefinition,
    context: ServiceContext
  ) {
    const relationFields = model.fields.filter(
      (field) => field.kind === 'relation' && field.relation
    );
    if (!relationFields.length) return;

    const { client } = await getCurrentUser(context);
    const fieldsByTarget = new Map<string, typeof relationFields>();
    for (const field of relationFields) {
      const labelField = field.relationLabelField ??
        PLANNING_MODEL_BY_KEY.get(field.relation!)?.labelField ??
        PLANNING_MODEL_BY_KEY.get(field.relation!)?.businessKey ??
        'id';
      const targetKey = `${field.relation!}:${labelField}`;
      const current = fieldsByTarget.get(targetKey) ?? [];
      current.push(field);
      fieldsByTarget.set(targetKey, current);
    }

    const labelsByTarget = new Map<string, Map<string, string>>();
    await Promise.all([...fieldsByTarget.entries()].map(async ([mapKey, fields]) => {
      const targetKey = fields[0]?.relation;
      if (!targetKey) return;
      const target = PLANNING_MODEL_BY_KEY.get(targetKey);
      if (!target) return;
      const ids = [...new Set(
        rows.flatMap((row) => fields.map((field) => this.readOptionalString(row[field.name])))
          .filter(Boolean)
      )];
      if (!ids.length) return;

      const labelField = fields[0]?.relationLabelField ??
        target.labelField ?? target.businessKey ?? 'id';
      const { data, error } = await client
        .from(target.key)
        .select('*')
        .eq('account_id', this.accountValue(context, 'account_id'))
        .in('id', ids)
        .limit(1000);
      if (error) throw new BadRequestException(error.message);
      labelsByTarget.set(mapKey, new Map(
        ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => [
          String(row.id ?? ''),
          String(row[labelField] ?? row[target.businessKey ?? 'id'] ?? row.id ?? '')
        ])
      ));
    }));

    for (const row of rows) {
      for (const field of relationFields) {
        const id = this.readOptionalString(row[field.name]);
        const labelField = field.relationLabelField ??
          PLANNING_MODEL_BY_KEY.get(field.relation!)?.labelField ??
          PLANNING_MODEL_BY_KEY.get(field.relation!)?.businessKey ??
          'id';
        const mapKey = `${field.relation!}:${labelField}`;
        row[`${field.name}_label`] = id
          ? labelsByTarget.get(mapKey)?.get(id) ?? id
          : '';
      }
    }
  }

  private buildRelationOptionTree(
    options: Array<{ id: unknown; label: string; parentId: unknown }>
  ): Array<{ id: unknown; label: string; children?: unknown[] }> {
    const byId = new Map(options.map((option) => [String(option.id ?? ''), {
      id: option.id,
      label: option.label,
      children: [] as unknown[]
    }]));
    const roots: Array<{ id: unknown; label: string; children: unknown[] }> = [];
    for (const option of options) {
      const node = byId.get(String(option.id ?? ''));
      if (!node) continue;
      const parent = option.parentId ? byId.get(String(option.parentId)) : undefined;
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    }
    type RelationOptionNode = { id: unknown; label: string; children?: RelationOptionNode[] };
    const compact = (node: { id: unknown; label: string; children: unknown[] }): RelationOptionNode => ({
      id: node.id,
      label: node.label,
      ...(node.children.length ? { children: node.children.map((child) => compact(child as typeof node)) } : {})
    });
    return roots.map(compact);
  }

  private async authorizeExecution(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: context.accountId
    });
    if (!hasRequiredPermission(authorization, PLANNING_MANAGE_PERMISSION)) {
      throw new ForbiddenException('planning.models.manage permission is required.');
    }
    this.accountValue(context, 'account_id');
    return { client, user };
  }

  private async readPlanningWorkerStatus(_accountId?: string) {
    if (!this.triggerCredentials) {
      return {
        online: null as boolean | null,
        reason: 'Trigger.dev worker status is unavailable.'
      };
    }
    const status = await this.triggerCredentials.getDevPresenceStatus();
    return {
      online: status.connected,
      checkedAt: new Date().toISOString(),
      ...(status.error ? { reason: status.error } : {})
    };
  }

  private async authorizeConsoleRead(context: ServiceContext) {
    if (context.internal) {
      assertWorkflowInternalCapability(
        context,
        'planning.getPlanningConsoleOptions'
      );
      this.accountValue(context, 'account_id');
      return {
        client: createSupabaseClient('admin', context),
        user: undefined
      };
    }
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: context.accountId
    });
    if (!hasRequiredPermission(authorization, PLANNING_VIEW_PERMISSION)) {
      throw new ForbiddenException('planning.models.view permission is required.');
    }
    this.accountValue(context, 'account_id');
    return { client, user };
  }

  private async runPreflightSupplyPlan(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    await this.authorizeExecution(context);
    this.assertSupplyPlan(postData);
    const accountId = this.accountValue(context, 'account_id');
    const overrides = this.readJsonObject(postData.overrides, 'overrides');
    const pool = createPlanningPool();
    try {
      const snapshot = await new PlanningDataLoader(pool).load(accountId);
      const report = preflightPlanningData(snapshot);
      let buildError: string | undefined;
      let parameters: ReturnType<typeof resolvePlanningParameters> | undefined;
      if (report.ok) {
        try {
          parameters = resolvePlanningParameters(snapshot, overrides);
          buildFreppleInput(snapshot, parameters);
        } catch (error) {
          buildError = error instanceof Error ? error.message : String(error);
        }
      }
      return {
        ...report,
        ok: report.ok && !buildError,
        ...(buildError ? { buildError } : {}),
        inputSnapshot: {
          counts: snapshot.counts,
          hash: snapshot.hash,
          loadedAt: snapshot.loadedAt
        },
        ...(parameters ? { parameters } : {})
      };
    } finally {
      await pool.end();
    }
  }

  private assertSupplyPlan(postData: Record<string, unknown>) {
    const jobType = this.readOptionalString(
      postData.jobType ?? postData.job_type ?? postData.planningJobType
    ) ?? 'supply_plan';
    if (jobType !== 'supply_plan') {
      throw new BadRequestException(`Unsupported planning job type: ${jobType}.`);
    }
  }

  private readJsonObject(value: unknown, field: string) {
    if (value === undefined || value === null || value === '') return {};
    if (!this.isRecord(value)) throw new BadRequestException(`${field} must be a JSON object.`);
    return value;
  }

  private readUuid(value: unknown, field: string) {
    const result = this.readOptionalString(value);
    if (!result || !UUID_PATTERN.test(result)) {
      throw new BadRequestException(`${field} must be a UUID.`);
    }
    return result;
  }

  private requireRecord(value: unknown, message: string) {
    if (!this.isRecord(value)) throw new BadRequestException(message);
    return value;
  }

  private requireTriggerClient() {
    if (!this.triggerClient) {
      throw new ServiceUnavailableException('Trigger.dev client is unavailable.');
    }
    return this.triggerClient;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
