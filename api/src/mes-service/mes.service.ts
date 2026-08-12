import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BaseService,
  type ResourceConfigMap,
  type ServicePostData
} from '../common/base.service';
import { fingerprintServiceWrite } from '../common/request-idempotency';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission
} from '../common/utils/supabase';
import {
  MES_MANAGE_PERMISSION,
  MES_VIEW_PERMISSION,
  mesResources
} from './mes.resources';

type JsonRecord = Record<string, unknown>;

type MesActor = {
  accountId: string;
  client: SupabaseClient;
  userId: string;
};

type MesCommandEnvelope = {
  commandId: string;
  deviceId: string | null;
  localSequence: number | null;
  occurredAt: string | null;
};

@Injectable()
export class MesService extends BaseService {
  protected override resources(): ResourceConfigMap {
    return mesResources();
  }

  protected override async executeAction(
    method: string,
    postData: JsonRecord,
    context: ServiceContext
  ) {
    switch (method) {
      case 'getCapabilities':
        return this.getCapabilities(context);
      case 'getWorkOrderDetail':
        return this.getWorkOrderDetail(postData, context);
      case 'listReleaseCandidates':
        return this.listReleaseCandidates(context);
      case 'releaseWorkOrder':
        return this.releaseWorkOrder(postData, context);
      case 'startOperation':
        return this.startOperation(postData, context);
      case 'pauseOperation':
        return this.pauseOperation(postData, context);
      case 'resumeOperation':
        return this.resumeOperation(postData, context);
      case 'reportProduction':
        return this.reportProduction(postData, context);
      case 'issueMaterial':
        return this.issueMaterial(postData, context);
      case 'returnMaterial':
        return this.returnMaterial(postData, context);
      case 'completeOperation':
        return this.completeOperation(postData, context);
      case 'reverseProduction':
      case 'reverseProductionReport':
      case 'undoProductionReport':
        return this.reverseProduction(postData, context);
      case 'reverseMaterial':
      case 'reverseMaterialTransaction':
        return this.reverseMaterial(postData, context);
      case 'reverseTransaction':
        return this.reverseTransaction(postData, context);
      default:
        return super.executeAction(method, postData, context);
    }
  }

  private async getCapabilities(context: ServiceContext) {
    const actor = await this.authorize(context, false);
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: actor.accountId
    });
    return {
      canView: true,
      canManage: hasRequiredPermission(authorization, MES_MANAGE_PERMISSION),
      commandModel: 'versioned-idempotent',
      planningRelease: true,
      immutableLedgers: ['production', 'material'],
      outbox: true,
      compensationCommands: [
        'pauseOperation',
        'resumeOperation',
        'returnMaterial',
        'reverseProduction',
        'reverseMaterial'
      ]
    };
  }

  private async getWorkOrderDetail(postData: JsonRecord, context: ServiceContext) {
    const { accountId, client } = await this.authorize(context, false);
    const workOrderId = this.readUuid(
      postData.workOrderId ?? postData.work_order_id ?? postData.id,
      'workOrderId'
    );

    const [workOrderResult, operationsResult, componentsResult, productionResult, materialResult] =
      await Promise.all([
        client
          .from('mes_work_order')
          .select('*')
          .eq('account_id', accountId)
          .eq('id', workOrderId)
          .maybeSingle(),
        client
          .from('mes_work_order_operation')
          .select('*')
          .eq('account_id', accountId)
          .eq('work_order_id', workOrderId)
          .order('sequence_no', { ascending: true }),
        client
          .from('mes_work_order_component')
          .select('*')
          .eq('account_id', accountId)
          .eq('work_order_id', workOrderId)
          .order('created_at', { ascending: true }),
        client
          .from('mes_production_transaction')
          .select('*')
          .eq('account_id', accountId)
          .eq('work_order_id', workOrderId)
          .order('occurred_at', { ascending: false })
          .limit(500),
        client
          .from('mes_material_transaction')
          .select('*')
          .eq('account_id', accountId)
          .eq('work_order_id', workOrderId)
          .order('occurred_at', { ascending: false })
          .limit(500)
      ]);

    for (const result of [
      workOrderResult,
      operationsResult,
      componentsResult,
      productionResult,
      materialResult
    ]) {
      if (result.error) this.throwDatabaseError(result.error);
    }
    if (!workOrderResult.data) throw new NotFoundException('MES work order not found.');

    return {
      workOrder: workOrderResult.data,
      operations: operationsResult.data ?? [],
      components: componentsResult.data ?? [],
      productionTransactions: productionResult.data ?? [],
      materialTransactions: materialResult.data ?? []
    };
  }

  private async listReleaseCandidates(context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const client = createSupabaseClient('admin', context);
    const versionsResult = await client
      .from('planning_plan_version')
      .select('id, code, name')
      .eq('account_id', actor.accountId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1000);
    if (versionsResult.error) this.throwDatabaseError(versionsResult.error);

    const versionRows = versionsResult.data ?? [];
    const versionIds = versionRows.map((row) => String(row.id));
    if (!versionIds.length) return [];

    const plansResult = await client
      .from('planning_operationplan')
      .select('id, reference, name, type, status, quantity, item_id, location_id, plan_version_id, startdate, enddate, batch')
      .eq('account_id', actor.accountId)
      .in('plan_version_id', versionIds)
      .in('type', ['MO', 'WO'])
      .in('status', ['proposed', 'approved', 'confirmed'])
      .order('startdate', { ascending: true })
      .limit(1000);
    if (plansResult.error) this.throwDatabaseError(plansResult.error);

    const plans = plansResult.data ?? [];
    if (!plans.length) return [];
    const planIds = plans.map((row) => String(row.id));
    const itemIds = [...new Set(plans.map((row) => row.item_id).filter(Boolean).map(String))];
    const locationIds = [...new Set(plans.map((row) => row.location_id).filter(Boolean).map(String))];

    const [releasedResult, itemsResult, locationsResult] = await Promise.all([
      client
        .from('mes_work_order')
        .select('source_operationplan_id, planned_quantity, status')
        .eq('account_id', actor.accountId)
        .in('source_operationplan_id', planIds)
        .neq('status', 'canceled'),
      itemIds.length
        ? client.from('planning_item').select('id, name, uom').eq('account_id', actor.accountId).in('id', itemIds)
        : Promise.resolve({ data: [], error: null }),
      locationIds.length
        ? client.from('planning_location').select('id, name').eq('account_id', actor.accountId).in('id', locationIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    for (const result of [releasedResult, itemsResult, locationsResult]) {
      if (result.error) this.throwDatabaseError(result.error);
    }

    const releasedByPlan = new Map<string, number>();
    for (const row of releasedResult.data ?? []) {
      const planId = String(row.source_operationplan_id ?? '');
      releasedByPlan.set(
        planId,
        (releasedByPlan.get(planId) ?? 0) + Number(row.planned_quantity ?? 0)
      );
    }
    const versions = new Map(versionRows.map((row) => [String(row.id), row]));
    const items = new Map((itemsResult.data ?? []).map((row) => [String(row.id), row]));
    const locations = new Map((locationsResult.data ?? []).map((row) => [String(row.id), row]));

    return plans.flatMap((row) => {
      const quantity = Number(row.quantity ?? 0);
      const releasedQuantity = releasedByPlan.get(String(row.id)) ?? 0;
      const remainingQuantity = quantity - releasedQuantity;
      if (!(remainingQuantity > 0)) return [];
      const item = items.get(String(row.item_id ?? ''));
      const location = locations.get(String(row.location_id ?? ''));
      const version = versions.get(String(row.plan_version_id ?? ''));
      return [{
        ...row,
        item_name: item?.name ?? null,
        uom: item?.uom ?? null,
        location_name: location?.name ?? null,
        plan_version_code: version?.code ?? null,
        plan_version_name: version?.name ?? null,
        released_quantity: releasedQuantity,
        remaining_quantity: remainingQuantity
      }];
    });
  }

  private async releaseWorkOrder(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const operationPlanId = this.readUuid(
      postData.operationPlanId ?? postData.operationplanId ?? postData.operationplan_id,
      'operationPlanId'
    );
    const quantity = this.readOptionalDecimal(postData.quantity, 'quantity', true);
    const workOrderNo = this.readNullableString(
      postData.workOrderNo ?? postData.work_order_no,
      'workOrderNo',
      120
    );
    const payload = {
      operationPlanId,
      quantity,
      workOrderNo,
      ...envelope
    };

    return this.callCommand(actor, 'mes_release_work_order', {
      p_account_id: actor.accountId,
      p_operationplan_id: operationPlanId,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('ReleaseWorkOrder', actor, payload),
      p_user_id: actor.userId,
      p_work_order_no: workOrderNo,
      p_quantity: quantity,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt
    });
  }

  private async startOperation(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const operationId = this.readUuid(
      postData.operationId ?? postData.operation_id ?? postData.id,
      'operationId'
    );
    const expectedVersion = this.readVersion(postData);
    const payload = { operationId, expectedVersion, ...envelope };

    return this.callCommand(actor, 'mes_start_operation', {
      p_account_id: actor.accountId,
      p_operation_id: operationId,
      p_expected_version: expectedVersion,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('StartOperation', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt
    });
  }

  private async pauseOperation(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const operationId = this.readUuid(
      postData.operationId ?? postData.operation_id ?? postData.id,
      'operationId'
    );
    const expectedVersion = this.readVersion(postData);
    const reasonCode = this.readRequiredString(
      postData.reasonCode ?? postData.reason_code,
      'reasonCode',
      120
    );
    const payload = { operationId, expectedVersion, reasonCode, ...envelope };

    return this.callCommand(actor, 'mes_pause_operation', {
      p_account_id: actor.accountId,
      p_operation_id: operationId,
      p_expected_version: expectedVersion,
      p_reason_code: reasonCode,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('PauseOperation', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt
    });
  }

  private async resumeOperation(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const operationId = this.readUuid(
      postData.operationId ?? postData.operation_id ?? postData.id,
      'operationId'
    );
    const expectedVersion = this.readVersion(postData);
    const reasonCode = this.readNullableString(
      postData.reasonCode ?? postData.reason_code,
      'reasonCode',
      120
    );
    const payload = { operationId, expectedVersion, reasonCode, ...envelope };

    return this.callCommand(actor, 'mes_resume_operation', {
      p_account_id: actor.accountId,
      p_operation_id: operationId,
      p_expected_version: expectedVersion,
      p_reason_code: reasonCode,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('ResumeOperation', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt
    });
  }

  private async reportProduction(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const operationId = this.readUuid(
      postData.operationId ?? postData.operation_id ?? postData.id,
      'operationId'
    );
    const expectedVersion = this.readVersion(postData);
    const goodQuantity = this.readDecimal(
      postData.goodQuantity ?? postData.good_quantity ?? 0,
      'goodQuantity',
      false
    );
    const scrapQuantity = this.readDecimal(
      postData.scrapQuantity ?? postData.scrap_quantity ?? 0,
      'scrapQuantity',
      false
    );
    if (goodQuantity === '0' && scrapQuantity === '0') {
      throw new BadRequestException('goodQuantity and scrapQuantity cannot both be zero.');
    }
    const metadata = this.readJsonRecord(postData.metadata, 'metadata');
    const payload = {
      operationId,
      expectedVersion,
      goodQuantity,
      scrapQuantity,
      metadata,
      ...envelope
    };

    return this.callCommand(actor, 'mes_report_production', {
      p_account_id: actor.accountId,
      p_operation_id: operationId,
      p_expected_version: expectedVersion,
      p_good_quantity: goodQuantity,
      p_scrap_quantity: scrapQuantity,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('ReportProduction', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt,
      p_metadata: metadata
    });
  }

  private async issueMaterial(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const componentId = this.readUuid(
      postData.componentId ?? postData.component_id ?? postData.id,
      'componentId'
    );
    const expectedVersion = this.readVersion(postData, 'expectedOperationVersion');
    const quantity = this.readDecimal(postData.quantity, 'quantity', true);
    const lotNo = this.readNullableString(postData.lotNo ?? postData.lot_no, 'lotNo', 200);
    const serialNo = this.readNullableString(
      postData.serialNo ?? postData.serial_no,
      'serialNo',
      200
    );
    const metadata = this.readJsonRecord(postData.metadata, 'metadata');
    const payload = {
      componentId,
      expectedVersion,
      quantity,
      lotNo,
      serialNo,
      metadata,
      ...envelope
    };

    return this.callCommand(actor, 'mes_issue_material', {
      p_account_id: actor.accountId,
      p_component_id: componentId,
      p_expected_operation_version: expectedVersion,
      p_quantity: quantity,
      p_lot_no: lotNo,
      p_serial_no: serialNo,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('IssueMaterial', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt,
      p_metadata: metadata
    });
  }

  private async returnMaterial(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const componentId = this.readUuid(
      postData.componentId ?? postData.component_id ?? postData.id,
      'componentId'
    );
    const expectedVersion = this.readVersion(postData, 'expectedOperationVersion');
    const quantity = this.readDecimal(postData.quantity, 'quantity', true);
    const lotNo = this.readNullableString(postData.lotNo ?? postData.lot_no, 'lotNo', 200);
    const serialNo = this.readNullableString(
      postData.serialNo ?? postData.serial_no,
      'serialNo',
      200
    );
    const reasonCode = this.readRequiredString(
      postData.reasonCode ?? postData.reason_code,
      'reasonCode',
      120
    );
    const metadata = this.readJsonRecord(postData.metadata, 'metadata');
    const payload = {
      componentId,
      expectedVersion,
      quantity,
      lotNo,
      serialNo,
      reasonCode,
      metadata,
      ...envelope
    };

    return this.callCommand(actor, 'mes_return_material', {
      p_account_id: actor.accountId,
      p_component_id: componentId,
      p_expected_operation_version: expectedVersion,
      p_quantity: quantity,
      p_lot_no: lotNo,
      p_serial_no: serialNo,
      p_reason_code: reasonCode,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('ReturnMaterial', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt,
      p_metadata: metadata
    });
  }

  private async completeOperation(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const operationId = this.readUuid(
      postData.operationId ?? postData.operation_id ?? postData.id,
      'operationId'
    );
    const expectedVersion = this.readVersion(postData);
    const payload = { operationId, expectedVersion, ...envelope };

    return this.callCommand(actor, 'mes_complete_operation', {
      p_account_id: actor.accountId,
      p_operation_id: operationId,
      p_expected_version: expectedVersion,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('CompleteOperation', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt
    });
  }

  private async reverseProduction(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const transactionId = this.readUuid(
      postData.transactionId
        ?? postData.transaction_id
        ?? postData.originalTransactionId
        ?? postData.original_transaction_id
        ?? postData.id,
      'transactionId'
    );
    const expectedVersion = this.readVersion(postData, 'expectedOperationVersion');
    const reasonCode = this.readRequiredString(
      postData.reasonCode ?? postData.reason_code,
      'reasonCode',
      120
    );
    const metadata = this.readJsonRecord(postData.metadata, 'metadata');
    const payload = {
      transactionId,
      expectedVersion,
      reasonCode,
      metadata,
      ...envelope
    };

    return this.callCommand(actor, 'mes_reverse_production', {
      p_account_id: actor.accountId,
      p_transaction_id: transactionId,
      p_expected_operation_version: expectedVersion,
      p_reason_code: reasonCode,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('ReverseProduction', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt,
      p_metadata: metadata
    });
  }

  private async reverseMaterial(postData: JsonRecord, context: ServiceContext) {
    const actor = await this.authorize(context, true);
    const envelope = this.readCommandEnvelope(postData, context);
    const transactionId = this.readUuid(
      postData.transactionId
        ?? postData.transaction_id
        ?? postData.originalTransactionId
        ?? postData.original_transaction_id
        ?? postData.id,
      'transactionId'
    );
    const expectedVersion = this.readVersion(postData, 'expectedOperationVersion');
    const reasonCode = this.readRequiredString(
      postData.reasonCode ?? postData.reason_code,
      'reasonCode',
      120
    );
    const metadata = this.readJsonRecord(postData.metadata, 'metadata');
    const payload = {
      transactionId,
      expectedVersion,
      reasonCode,
      metadata,
      ...envelope
    };

    return this.callCommand(actor, 'mes_reverse_material', {
      p_account_id: actor.accountId,
      p_transaction_id: transactionId,
      p_expected_operation_version: expectedVersion,
      p_reason_code: reasonCode,
      p_command_id: envelope.commandId,
      p_request_hash: this.commandHash('ReverseMaterial', actor, payload),
      p_user_id: actor.userId,
      p_device_id: envelope.deviceId,
      p_local_sequence: envelope.localSequence,
      p_occurred_at: envelope.occurredAt,
      p_metadata: metadata
    });
  }

  private async reverseTransaction(postData: JsonRecord, context: ServiceContext) {
    const ledger = this.readRequiredString(
      postData.ledger ?? postData.ledgerType ?? postData.ledger_type,
      'ledger',
      40
    ).toLowerCase();
    if (['production', 'report', 'production-report'].includes(ledger)) {
      return this.reverseProduction(postData, context);
    }
    if (['material', 'issue', 'return', 'consume'].includes(ledger)) {
      return this.reverseMaterial(postData, context);
    }
    throw new BadRequestException('ledger must be production or material.');
  }

  private async authorize(context: ServiceContext, manage: boolean): Promise<MesActor> {
    const accountId = this.accountValue(context, 'account_id');
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id, { accountId });
    const required = manage
      ? MES_MANAGE_PERMISSION
      : [MES_VIEW_PERMISSION, MES_MANAGE_PERMISSION];
    if (!hasRequiredPermission(authorization, required)) {
      throw new ForbiddenException(
        `${manage ? MES_MANAGE_PERMISSION : MES_VIEW_PERMISSION} permission is required.`
      );
    }
    return { accountId, client, userId: user.id };
  }

  private async callCommand(actor: MesActor, rpcName: string, params: JsonRecord) {
    const { data, error } = await actor.client.rpc(rpcName, params);
    if (error) this.throwDatabaseError(error);
    if (!this.isRecord(data)) {
      throw new BadRequestException(`MES command ${rpcName} returned an invalid result.`);
    }
    return data;
  }

  private readCommandEnvelope(
    postData: JsonRecord,
    context: ServiceContext
  ): MesCommandEnvelope {
    const explicitCommandId = this.readOptionalString(
      postData.commandId ?? postData.command_id
    );
    const requestCommandId = this.readOptionalString(context.requestId);
    if (
      explicitCommandId
      && requestCommandId
      && this.normalizeCommandId(explicitCommandId) !== this.normalizeCommandId(requestCommandId)
    ) {
      throw new BadRequestException('commandId must match X-Request-Id when both are supplied.');
    }
    const rawCommandId = this.readOptionalString(
      explicitCommandId || requestCommandId
    );
    if (!rawCommandId) {
      throw new BadRequestException('commandId or X-Request-Id is required for MES commands.');
    }
    const commandId = this.normalizeCommandId(rawCommandId);
    const deviceId = this.readNullableString(
      postData.deviceId ?? postData.device_id,
      'deviceId',
      200
    );
    const localSequenceValue = postData.localSequence ?? postData.local_sequence;
    const localSequence = localSequenceValue === undefined || localSequenceValue === null || localSequenceValue === ''
      ? null
      : this.readNonNegativeInteger(localSequenceValue, 'localSequence');
    if ((deviceId === null) !== (localSequence === null)) {
      throw new BadRequestException('deviceId and localSequence must be supplied together.');
    }
    const occurredAt = this.readTimestamp(
      postData.occurredAt ?? postData.occurred_at,
      'occurredAt'
    );
    return { commandId, deviceId, localSequence, occurredAt };
  }

  private normalizeCommandId(value: string) {
    return UUID_PATTERN.test(value)
      ? value.toLowerCase()
      : this.deterministicUuid(value);
  }

  private readVersion(postData: JsonRecord, preferredField = 'expectedVersion') {
    const value = preferredField === 'expectedOperationVersion'
      ? postData.expectedOperationVersion
        ?? postData.expected_operation_version
        ?? postData.expectedVersion
        ?? postData.expected_version
      : postData.expectedVersion ?? postData.expected_version;
    return this.readNonNegativeInteger(value, preferredField);
  }

  private readNonNegativeInteger(value: unknown, field: string) {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new BadRequestException(`${field} must be a non-negative safe integer.`);
    }
    return parsed;
  }

  private readUuid(value: unknown, field: string) {
    const result = this.readOptionalString(value);
    if (!UUID_PATTERN.test(result)) {
      throw new BadRequestException(`${field} must be a UUID.`);
    }
    return result.toLowerCase();
  }

  private readOptionalDecimal(value: unknown, field: string, positive: boolean) {
    if (value === undefined || value === null || value === '') return null;
    return this.readDecimal(value, field, positive);
  }

  private readDecimal(value: unknown, field: string, positive: boolean) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException(`${field} must be a decimal number.`);
    }
    const raw = String(value).trim();
    if (!DECIMAL_PATTERN.test(raw)) {
      throw new BadRequestException(`${field} must be a decimal number.`);
    }
    const normalized = normalizeDecimal(raw);
    if (normalized.startsWith('-') || (positive && normalized === '0')) {
      throw new BadRequestException(`${field} must be ${positive ? 'positive' : 'non-negative'}.`);
    }
    const digits = normalized.replace(/[-.]/g, '');
    const fraction = normalized.split('.')[1] ?? '';
    if (digits.length > 30 || fraction.length > 8) {
      throw new BadRequestException(`${field} exceeds numeric(30,8).`);
    }
    return normalized;
  }

  private readNullableString(value: unknown, field: string, maxLength: number) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string.`);
    }
    const result = value.trim();
    if (!result) return null;
    if (result.length > maxLength) {
      throw new BadRequestException(`${field} must not exceed ${maxLength} characters.`);
    }
    return result;
  }

  private readRequiredString(value: unknown, field: string, maxLength: number) {
    const result = this.readNullableString(value, field, maxLength);
    if (!result) throw new BadRequestException(`${field} is required.`);
    return result;
  }

  private readTimestamp(value: unknown, field: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
      throw new BadRequestException(`${field} must be an ISO timestamp.`);
    }
    return new Date(value).toISOString();
  }

  private readJsonRecord(value: unknown, field: string) {
    if (value === undefined || value === null || value === '') return {};
    if (!this.isRecord(value)) {
      throw new BadRequestException(`${field} must be a JSON object.`);
    }
    return value;
  }

  private commandHash(commandType: string, actor: MesActor, payload: JsonRecord) {
    return fingerprintServiceWrite({
      commandType,
      accountId: actor.accountId,
      userId: actor.userId,
      payload
    });
  }

  private deterministicUuid(value: string) {
    const bytes = Buffer.from(createHash('sha256').update(value).digest().subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private throwDatabaseError(error: { code?: string; message?: string; details?: string | null }): never {
    const message = error.message || 'MES database operation failed.';
    const diagnostic = [error.message, error.details]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    if (
      diagnostic.includes('fetch failed')
      || diagnostic.includes('failed to fetch')
      || diagnostic.includes('upstream request timeout')
      || diagnostic.includes('timeout expired')
      || diagnostic.includes('timeouterror')
      || diagnostic.includes('timed out after')
      || diagnostic.includes('timed out acquiring connection')
      || diagnostic.includes('aborterror')
      || diagnostic.includes('operation was aborted')
      || diagnostic.includes('schema cache')
      || diagnostic.includes('econnreset')
      || diagnostic.includes('etimedout')
      || diagnostic.includes('socket hang up')
    ) {
      throw new ServiceUnavailableException(message);
    }
    if (error.code === 'P0002') throw new NotFoundException(message);
    if (['23505', '40001', '55P03', 'PT409'].includes(error.code ?? '')) {
      throw new ConflictException(message);
    }
    if (error.code === '42501') throw new ForbiddenException(message);
    throw new BadRequestException(message);
  }
}

function normalizeDecimal(value: string) {
  const negative = value.startsWith('-');
  const unsigned = value.replace(/^[+-]/, '');
  const [rawInteger = '0', rawFraction = ''] = unsigned.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/, '') || '0';
  const fraction = rawFraction.replace(/0+$/, '');
  const normalized = fraction ? `${integer}.${fraction}` : integer;
  return negative && normalized !== '0' ? `-${normalized}` : normalized;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
