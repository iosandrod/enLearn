import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BaseService,
  type CrudContext,
  type ResourceConfigMap,
  type ServicePostData
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission
} from '../common/utils/supabase';
import { planningResources } from './planning.resources';
import { PLANNING_MANAGE_PERMISSION } from './planning.resources';
import {
  PLANNING_MODEL_BY_KEY,
  type PlanningModelDefinition
} from './planning.models';

@Injectable()
export class PlanningService extends BaseService {
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
      return {
        canManage: hasRequiredPermission(authorization, PLANNING_MANAGE_PERMISSION)
      };
    }

    if (method === 'listRelationOptions') {
      const relation = this.resolveResource(postData);
      const ctx = await this.createCrudContext('list', postData, context, relation);
      await this.assertPermission(ctx);
      const client = ctx.client;

      const businessField = this.readOptionalString(postData.labelField ?? postData.label_field);
      const labelField = businessField || 'id';
      this.assertIdentifier(labelField, 'labelField');
      let query = client
        .from(relation.config.tableName)
        .select('*')
        .eq(
          relation.config.accountField ?? 'account_id',
          this.accountValue(context, relation.config.accountField ?? 'account_id')
        )
        .order(labelField, { ascending: true })
        .limit(1000);
      const { data, error } = await query;
      if (error) throw new BadRequestException(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
          id: row.id,
          label: String(row[labelField] ?? row.id ?? '')
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
      const current = fieldsByTarget.get(field.relation!) ?? [];
      current.push(field);
      fieldsByTarget.set(field.relation!, current);
    }

    const labelsByTarget = new Map<string, Map<string, string>>();
    await Promise.all([...fieldsByTarget.entries()].map(async ([targetKey, fields]) => {
      const target = PLANNING_MODEL_BY_KEY.get(targetKey);
      if (!target) return;
      const ids = [...new Set(
        rows.flatMap((row) => fields.map((field) => this.readOptionalString(row[field.name])))
          .filter(Boolean)
      )];
      if (!ids.length) return;

      const labelField = target.businessKey ?? 'id';
      const { data, error } = await client
        .from(target.key)
        .select('*')
        .eq('account_id', this.accountValue(context, 'account_id'))
        .in('id', ids)
        .limit(1000);
      if (error) throw new BadRequestException(error.message);
      labelsByTarget.set(targetKey, new Map(
        ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => [
          String(row.id ?? ''),
          String(row[labelField] ?? row.id ?? '')
        ])
      ));
    }));

    for (const row of rows) {
      for (const field of relationFields) {
        const id = this.readOptionalString(row[field.name]);
        row[`${field.name}_label`] = id
          ? labelsByTarget.get(field.relation!)?.get(id) ?? id
          : '';
      }
    }
  }
}
