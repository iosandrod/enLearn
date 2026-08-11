import type { ResourceConfigMap } from '../common/base.service';

export const MES_VIEW_PERMISSION = 'mes.execution.view';
export const MES_MANAGE_PERMISSION = 'mes.execution.manage';

const readOnlyActions = ['create', 'update', 'delete', 'action'] as const;

export function mesResources(): ResourceConfigMap {
  const readOnlyResource = (
    tableName: string,
    defaultSorts: Array<{ field: string; direction: 'asc' | 'desc' }>,
    searchFields: string[] = []
  ) => ({
    tableName,
    primaryKey: 'id',
    accountField: 'account_id',
    internalActions: [...readOnlyActions],
    permissions: {
      list: [MES_VIEW_PERMISSION, MES_MANAGE_PERMISSION]
    },
    list: {
      defaultSorts,
      searchFields,
      defaultPageSize: 100,
      maxPageSize: 1000
    }
  });

  return {
    mes_work_order: readOnlyResource(
      'mes_work_order',
      [{ field: 'created_at', direction: 'desc' }],
      ['work_order_no', 'status', 'batch']
    ),
    mes_work_order_operation: readOnlyResource(
      'mes_work_order_operation',
      [{ field: 'sequence_no', direction: 'asc' }],
      ['operation_code', 'operation_name', 'status']
    ),
    mes_work_order_component: readOnlyResource(
      'mes_work_order_component',
      [{ field: 'created_at', direction: 'asc' }],
      ['requirement_type']
    ),
    mes_production_transaction: readOnlyResource(
      'mes_production_transaction',
      [{ field: 'occurred_at', direction: 'desc' }],
      ['transaction_type', 'device_id', 'reason_code']
    ),
    mes_material_transaction: readOnlyResource(
      'mes_material_transaction',
      [{ field: 'occurred_at', direction: 'desc' }],
      ['transaction_type', 'lot_no', 'serial_no', 'device_id']
    ),
    mes_work_order_runtime_view: readOnlyResource(
      'mes_work_order_runtime_view',
      [{ field: 'created_at', direction: 'desc' }],
      ['work_order_no', 'item_name', 'status', 'batch']
    ),
    mes_work_order_operation_runtime_view: readOnlyResource(
      'mes_work_order_operation_runtime_view',
      [{ field: 'sequence_no', direction: 'asc' }],
      ['work_order_no', 'operation_code', 'operation_name', 'status']
    ),
    mes_work_order_component_runtime_view: readOnlyResource(
      'mes_work_order_component_runtime_view',
      [{ field: 'created_at', direction: 'asc' }],
      ['work_order_no', 'operation_name', 'item_name', 'requirement_type']
    ),
    mes_production_transaction_runtime_view: readOnlyResource(
      'mes_production_transaction_runtime_view',
      [{ field: 'occurred_at', direction: 'desc' }],
      ['work_order_no', 'operation_name', 'transaction_type', 'reason_code', 'device_id']
    ),
    mes_material_transaction_runtime_view: readOnlyResource(
      'mes_material_transaction_runtime_view',
      [{ field: 'occurred_at', direction: 'desc' }],
      ['work_order_no', 'operation_name', 'item_name', 'transaction_type', 'lot_no', 'serial_no', 'reason_code']
    )
  };
}
