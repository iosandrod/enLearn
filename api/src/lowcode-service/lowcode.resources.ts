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
  'schema',
  'version',
  'published_at',
  'edit_page_id'
];

export const lowCodeResources: ResourceConfigMap = {
  pages: {
    tableName: 'lowcode_pages',
    clientMode: 'admin',
    permissions: crudPermissions('lowcode.pages.manage'),
    defaults: { layout: 'dashboard', status: 'draft', keep_alive: true, version: 1 },
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
  pageVersions: {
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
  }
};
