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
    _ctx: CrudContext,
    action: 'create' | 'update' | 'delete',
    operation: Record<string, unknown>,
  ) {
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

async function main() {
  const service = new TestAdminService();
  await service.execute('updateItem', {
    resource: 'sales_orders',
    id: orderId,
    data: {
      remark: 'incremental detail update',
      __details: [{
        resource: 'sales_order_lines',
        mode: 'changes',
        foreignKey: 'order_id',
        inheritFields: ['account_id'],
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
        resource: 'sales_order_lines',
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

  await assert.rejects(
    () => new TestAdminService().execute('updateItem', {
      resource: 'sales_orders',
      id: orderId,
      data: {
        __details: [{
          resource: 'sales_order_lines',
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
          resource: 'sales_order_lines',
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
          resource: 'sales_order_lines',
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
