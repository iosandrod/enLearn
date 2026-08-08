import type { ResourceConfigMap } from '../common/base.service';

function crudPermissions(permission: string) {
  return { list: permission, create: permission, update: permission, delete: permission };
}

const pageFields = [
  'code',
  'route',
  'title',
  'description',
  'layout',
  'status',
  'keep_alive',
  'page_type',
  'schema',
  'version',
  'published_at',
  'edit_page_id'
];

export const lowCodeResources: ResourceConfigMap = {
  lowcode_pages: {
    tableName: 'lowcode_pages',
    clientMode: 'admin',
    transactionalHooks: true,
    databaseHooks: {
      beforeCreate: 'public.dynamic_crud_normalize_lowcode_page',
      beforeUpdate: 'public.dynamic_crud_normalize_lowcode_page'
    },
    permissions: crudPermissions('lowcode.pages.manage'),
    defaults: {
      layout: 'dashboard',
      status: 'draft',
      keep_alive: true,
      page_type: 'custom',
      version: 1
    },
    detailRelations: {
      lowcode_page_versions: {
        foreignKey: 'page_id',
        parentKey: 'id',
        updateMode: 'replace'
      }
    },
    afterSaveRelations: {
      lowcode_pages: {
        actions: ['update'],
        allowedFields: ['edit_page_id'],
        allowedWhereFields: ['id']
      }
    },
    list: { defaultSorts: [{ field: 'updated_at', direction: 'desc' }] },
    create: {
      allowedFields: pageFields,
      requiredFields: ['code', 'route', 'title'],
      userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
    },
    update: {
      allowedFields: pageFields,
      userFields: { updatedBy: 'updated_by' }
    }
  },
  lowcode_page_versions: {
    tableName: 'lowcode_page_versions',
    clientMode: 'admin',
    permissions: crudPermissions('lowcode.pages.manage'),
    list: { defaultSorts: [{ field: 'created_at', direction: 'desc' }] },
    create: {
      allowedFields: ['page_id', 'version', 'schema', 'published_at'],
      requiredFields: ['page_id', 'version', 'schema'],
      timestamp: false,
      userFields: { createdBy: 'created_by' }
    },
    update: {
      allowedFields: ['schema', 'published_at'],
      timestamp: false
    }
  },
  lowcode_form_definitions: {
    tableName: 'lowcode_form_definitions',
    clientMode: 'admin',
    permissions: crudPermissions('lowcode.pages.manage'),
    defaults: {
      enabled: true
    },
    list: { defaultSorts: [{ field: 'updated_at', direction: 'desc' }] },
    create: {
      allowedFields: ['code', 'name', 'description', 'schema', 'enabled'],
      requiredFields: ['code', 'name', 'schema'],
      userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
    },
    update: {
      allowedFields: ['name', 'description', 'schema', 'enabled'],
      userFields: { updatedBy: 'updated_by' }
    }
  }
};
