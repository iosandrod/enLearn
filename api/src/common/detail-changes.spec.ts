import assert from 'node:assert/strict';

import { AdminService } from '../admin-service/admin.service';
import type { CrudContext } from './base.service';
import type { ServiceContext } from './interfaces/service-executor';

type PreparedCall = {
  action: 'create' | 'update' | 'delete';
  operation: Record<string, unknown>;
};

class TestAdminService extends AdminService {
  preparedCall?: PreparedCall;
  dynamicConfig?: Record<string, unknown>;

  protected override async createCrudClient() {
    return {} as never;
  }

  protected override async tryReadCurrentUser() {
    return { id: '00000000-0000-4000-8000-000000000111' } as never;
  }

  protected override async assertPermission() {
    return undefined;
  }

  protected override async callDynamicCrudRpc(
    ctx: CrudContext,
    action: 'create' | 'update' | 'delete',
    operation: Record<string, unknown>,
  ) {
    this.dynamicConfig = this.buildDynamicCrudConfig(ctx);
    this.preparedCall = { action, operation };
    return operation;
  }
}

const context: ServiceContext = {
  authorization: 'Bearer test-token',
  accountId: '00000000-0000-4000-8000-000000000001',
};
const orderId = '00000000-0000-4000-8000-000000000010';
const updatedId = '00000000-0000-4000-8000-000000000020';
const deletedId = '00000000-0000-4000-8000-000000000030';
const deletedOptionId = '00000000-0000-4000-8000-000000000050';
const salesOrderLineRelation = {
  resource: 'sales_order_lines',
  foreignKey: 'order_id',
  parentKey: 'id',
  inheritFields: ['account_id'],
  updateMode: 'changes',
} as const;

async function main() {
  const service = new TestAdminService();
  await service.execute('updateItem', {
    resource: 'sales_orders',
    id: orderId,
    data: {
      remark: 'incremental detail update',
      __details: [{
        ...salesOrderLineRelation,
        mode: 'changes',
        created: [{
          id: 'new-local-id',
          account_id: 'forged-account',
          order_id: 'forged-parent',
          line_no: 2,
          item_code: 'ITEM-NEW',
          item_name: 'New item',
        }],
        updated: [{
          id: updatedId,
          account_id: 'forged-account',
          order_id: 'forged-parent',
          line_no: 1,
          item_code: 'ITEM-UPDATED',
        }],
        deleted: [deletedId],
      }],
    },
  }, context);

  assert.equal(service.preparedCall?.action, 'update');
  const dynamicRelations = service.dynamicConfig?.detail_relations as Record<
    string,
    Record<string, unknown>
  >;
  assert.deepEqual(dynamicRelations.sales_order_lines, {
    resource: 'sales_order_lines',
    foreign_key: 'order_id',
    parent_key: 'id',
    inherit_fields: ['account_id'],
    update_mode: 'changes',
  });
  const details = service.preparedCall?.operation.details as Array<Record<string, unknown>>;
  assert.equal(details.length, 1);
  assert.deepEqual(details[0].deleted, [deletedId]);
  const created = details[0].created as Array<Record<string, unknown>>;
  assert.equal(created[0].id, undefined);
  assert.equal(created[0].account_id, context.accountId);
  assert.equal(created[0].order_id, undefined);
  const updated = details[0].updated as Array<{ id: string; data: Record<string, unknown> }>;
  assert.equal(updated[0].id, updatedId);
  assert.equal(updated[0].data.id, undefined);
  assert.equal(updated[0].data.account_id, context.accountId);
  assert.equal(updated[0].data.order_id, undefined);

  const numericIdService = new TestAdminService();
  await numericIdService.execute('updateItem', {
    resource: 'sales_orders',
    id: orderId,
    data: {
      __details: [{
        ...salesOrderLineRelation,
        mode: 'changes',
        created: [],
        updated: [{ id: 101, item_name: 'Numeric primary key' }],
        deleted: [102],
      }],
    },
  }, context);
  const numericDetails = numericIdService.preparedCall?.operation.details as Array<{
    updated: Array<{ id: unknown }>;
    deleted: unknown[];
  }>;
  assert.equal(numericDetails[0].updated[0].id, 101);
  assert.deepEqual(numericDetails[0].deleted, [102]);

  const optionService = new TestAdminService();
  await optionService.execute('updateItem', {
    resource: 'system_option_sources',
    id: '00000000-0000-4000-8000-000000000040',
    data: {
      code: 'planning_plan_type',
      __details: [{
        resource: 'system_option_items',
        mode: 'changes',
        foreignKey: 'source_code',
        parentKey: 'code',
        inheritFields: [],
        updateMode: 'changes',
        created: [{ label: '生产单', value: 'MO' }],
        updated: [],
        deleted: [deletedOptionId],
      }],
    },
  }, context);
  const optionDetails = optionService.preparedCall?.operation.details as Array<{
    foreign_key: string;
    parent_key: string;
    created: Array<Record<string, unknown>>;
    deleted: string[];
  }>;
  assert.equal(optionDetails[0].foreign_key, 'source_code');
  assert.equal(optionDetails[0].parent_key, 'code');
  assert.equal(optionDetails[0].created[0].source_code, undefined);
  assert.equal(optionDetails[0].created[0].label, '生产单');
  assert.equal(optionDetails[0].created[0].value, 'MO');
  assert.equal(optionDetails[0].created[0].status, 'active');
  assert.deepEqual(optionDetails[0].deleted, [deletedOptionId]);

  const optionUpdatedService = new TestAdminService();
  await optionUpdatedService.execute('saveItem', {
    tableName: 'system_option_sources',
    id: '00000000-0000-4000-8000-000000000040',
    code: 'planning_plan_type',
    __details: [{
      resource: 'system_option_items',
      foreignKey: 'source_code',
      parentKey: 'code',
      inheritFields: [],
      updateMode: 'changes',
      mode: 'changes',
      created: [],
      updated: [{
        id: updatedId,
        source_code: 'forged-source',
        label: '更新后的生产单',
      }],
      deleted: [],
    }],
  }, context);
  const optionUpdatedDetails = optionUpdatedService.preparedCall?.operation.details as Array<{
    foreign_key: string;
    parent_key: string;
    updated: Array<{ id: string; data: Record<string, unknown> }>;
  }>;
  assert.equal(optionUpdatedDetails[0].foreign_key, 'source_code');
  assert.equal(optionUpdatedDetails[0].parent_key, 'code');
  assert.equal(optionUpdatedDetails[0].updated[0].id, updatedId);
  assert.equal(optionUpdatedDetails[0].updated[0].data.source_code, undefined);
  assert.equal(optionUpdatedDetails[0].updated[0].data.label, '更新后的生产单');

  // Compatibility with the payload emitted by older low-code clients:
  // identity in filters.id and a full rows array alongside updateMode=changes.
  // This must still update the header and replace its detail rows.
  const legacyService = new TestAdminService();
  await legacyService.execute('saveItem', {
    tableName: 'sales_orders',
    id: '',
    filters: { id: orderId },
    doc_no: 'SO-LEGACY',
    business_date: '',
    __details: [{
      resource: 'sales_order_lines',
      foreignKey: 'order_id',
      parentKey: 'id',
      inheritFields: ['account_id'],
      updateMode: 'changes',
      rows: [{
        line_no: 1,
        item_code: 'ITEM-LEGACY',
        item_name: 'Legacy row',
        delivery_date: '',
      }],
    }],
  }, context);
  assert.equal(legacyService.preparedCall?.action, 'update');
  const legacyDetails = legacyService.preparedCall?.operation.details as Array<Record<string, unknown>>;
  assert.equal(legacyService.preparedCall?.operation.data.business_date, '');
  assert.equal(legacyDetails[0].mode, 'replace');
  assert.equal((legacyDetails[0].rows as Array<Record<string, unknown>>)[0].item_code, 'ITEM-LEGACY');
  assert.equal((legacyDetails[0].rows as Array<Record<string, unknown>>)[0].delivery_date, '');

  await assert.rejects(
    () => new TestAdminService().execute('updateItem', {
      resource: 'sales_orders',
      id: orderId,
      data: {
        __details: [{
          ...salesOrderLineRelation,
          mode: 'changes',
          inserts: [{ item_name: 'Ambiguous alias' }],
          updated: [],
          deleted: [],
        }],
      },
    }, context),
    /must use created, updated, and deleted arrays/,
  );

  await assert.rejects(
    () => new TestAdminService().execute('updateItem', {
      resource: 'sales_orders',
      id: orderId,
      data: {
        __details: [{
          ...salesOrderLineRelation,
          mode: 'changes',
          created: [],
          updated: [{ id: updatedId, item_name: 'Updated' }],
          deleted: [updatedId],
        }],
      },
    }, context),
    /cannot be both updated and deleted/,
  );

  await assert.rejects(
    () => new TestAdminService().execute('updateItem', {
      resource: 'sales_orders',
      id: orderId,
      data: {
        __details: [{
          ...salesOrderLineRelation,
          mode: 'changes',
          created: [],
          updated: [],
          deleted: [deletedId, deletedId],
        }],
      },
    }, context),
    /Duplicate detail id/,
  );

  console.log('Incremental detail preparation tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
