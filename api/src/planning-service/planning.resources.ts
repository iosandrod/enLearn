import type { ResourceConfigMap } from '../common/base.service';
import {
  PLANNING_MODEL_DEFINITIONS,
  planningDefaults,
  planningRequiredFields,
  planningWritableFields
} from './planning.models';

export const PLANNING_VIEW_PERMISSION = 'planning.models.view';
export const PLANNING_MANAGE_PERMISSION = 'planning.models.manage';

export function planningResources(): ResourceConfigMap {
  return Object.fromEntries(
    PLANNING_MODEL_DEFINITIONS.map((model) => {
      const writableFields = planningWritableFields(model);
      const requiredFields = planningRequiredFields(model);
      const defaults = planningDefaults(model);
      const searchFields = ['name', 'display_name', 'reference', 'description', 'category', 'subcategory']
        .filter((field) => model.fields.some((candidate) => candidate.name === field));
      const defaultSortField = model.businessKey ??
        (model.fields.some((field) => field.name === 'priority')
          ? 'priority'
          : model.fields.some((field) => field.name === 'snapshot_date')
            ? 'snapshot_date'
            : model.fields.some((field) => field.name === 'startdate')
              ? 'startdate'
              : model.fields.some((field) => field.name === 'submitted')
                ? 'submitted'
                : 'created_at');

      return [model.key, {
        tableName: model.key,
        primaryKey: 'id',
        accountField: 'account_id',
        ...(model.access === 'view'
          ? { internalActions: ['create' as const, 'update' as const, 'delete' as const] }
          : {}),
        permissions: {
          list: PLANNING_VIEW_PERMISSION,
          create: PLANNING_MANAGE_PERMISSION,
          update: PLANNING_MANAGE_PERMISSION,
          delete: PLANNING_MANAGE_PERMISSION
        },
        ...(Object.keys(defaults).length ? { defaults } : {}),
        list: {
          defaultSorts: [{ field: defaultSortField, direction: 'asc' as const }],
          searchFields,
          defaultPageSize: 100,
          maxPageSize: 1000
        },
        create: {
          allowedFields: writableFields,
          requiredFields,
          userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
        },
        update: {
          allowedFields: writableFields,
          userFields: { updatedBy: 'updated_by' }
        },
        delete: {}
      }];
    })
  );
}
