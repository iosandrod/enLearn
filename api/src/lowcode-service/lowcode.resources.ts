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
  'view_name',
  'table_name',
  'relate_config',
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
  lowcode_node_actions: {
    tableName: 'lowcode_node_actions',
    clientMode: 'user',
    permissions: {
      create: 'lowcode.pages.manage',
      update: 'lowcode.pages.manage',
      delete: 'lowcode.pages.manage'
    },
    defaults: {
      parameters: [],
      applicable_when: {},
      limits: {},
      is_data_source_loader: false,
      enabled: true,
      is_system: false,
      sort_order: 0
    },
    list: { defaultSorts: [
      { field: 'node_type', direction: 'asc' },
      { field: 'sort_order', direction: 'asc' }
    ] },
    create: {
      allowedFields: [
        'node_type', 'node_label', 'node_icon', 'action_code', 'label',
        'description', 'source_code', 'parameters', 'returns',
        'insert_text_template', 'applicable_when', 'is_data_source_loader',
        'enabled', 'is_system', 'sort_order', 'limits'
      ],
      requiredFields: [
        'node_type', 'node_label', 'action_code', 'label', 'source_code'
      ],
      userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
    },
    update: {
      allowedFields: [
        'node_label', 'node_icon', 'label', 'description', 'source_code',
        'parameters', 'returns', 'insert_text_template', 'applicable_when',
        'is_data_source_loader', 'enabled', 'sort_order', 'limits'
      ],
      userFields: { updatedBy: 'updated_by' }
    }
  },
  lowcode_page_runtime: {
    tableName: 'lowcode_page_runtime',
    clientMode: 'user',
    permissions: {
      create: 'lowcode.pages.manage',
      update: 'lowcode.pages.manage',
      delete: 'lowcode.pages.manage'
    },
    defaults: {
      function_type: 'page_function',
      category: 'page_flow',
      execution_mode: 'script',
      parameters: [],
      runtime_spec: {},
      result_schema: {},
      capabilities: [],
      applicable_when: {},
      limits: { timeoutMs: 2000, maxApiCalls: 50, maxPayloadBytes: 26214400 },
      version: 1,
      status: 'draft',
      enabled: true,
      is_system: false,
      sort_order: 0
    },
    list: {
      defaultSorts: [
        { field: 'category', direction: 'asc' },
        { field: 'page_type', direction: 'asc' },
        { field: 'sort_order', direction: 'asc' }
      ]
    },
    create: {
      allowedFields: [
        'page_id', 'runtime_key', 'function_name', 'function_type', 'category',
        'page_type', 'node_type', 'label', 'description', 'execution_mode',
        'source_code', 'native_handler', 'runtime_spec', 'parameters',
        'result_schema', 'capabilities', 'applicable_when', 'limits',
        'version', 'status', 'enabled', 'is_system', 'sort_order'
      ],
      requiredFields: ['runtime_key', 'function_name', 'function_type', 'category', 'label'],
      userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
    },
    update: {
      allowedFields: [
        'page_id', 'function_name', 'function_type', 'category', 'page_type',
        'node_type', 'label', 'description', 'execution_mode', 'source_code',
        'native_handler', 'runtime_spec', 'parameters', 'result_schema',
        'capabilities', 'applicable_when', 'limits', 'version', 'status',
        'enabled', 'is_system', 'sort_order'
      ],
      userFields: { updatedBy: 'updated_by' }
    }
  },
  lowcode_form_definitions: {
    tableName: 'lowcode_form_definitions',
    clientMode: 'user',
    permissions: {
      create: 'lowcode.pages.manage',
      update: 'lowcode.pages.manage',
      delete: 'lowcode.pages.manage'
    },
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
  },
  lowcode_materials: {
    tableName: 'lowcode_materials',
    clientMode: 'user',
    permissions: {
      create: 'lowcode.pages.manage',
      update: 'lowcode.pages.manage',
      delete: 'lowcode.pages.manage'
    },
    defaults: {
      renderer_type: 'vue-sfc',
      material_version: '1.0.0',
      aliases: [],
      manifest: {},
      dependencies: [],
      status: 'draft',
      enabled: true,
      is_system: false,
      sort_order: 0
    },
    list: {
      defaultFilters: { enabled: true, status: 'published' },
      defaultSorts: [
        { field: 'material_kind', direction: 'asc' },
        { field: 'sort_order', direction: 'asc' },
        { field: 'code', direction: 'asc' }
      ],
      maxPageSize: 100
    },
    create: {
      allowedFields: [
        'material_kind', 'code', 'label', 'description', 'category',
        'renderer_type', 'source_path', 'source_text', 'source_hash',
        'material_version', 'aliases', 'sort_order', 'manifest',
        'dependencies', 'status', 'enabled', 'is_system'
      ],
      requiredFields: [
        'material_kind', 'code', 'label', 'category', 'renderer_type',
        'source_path', 'source_text', 'source_hash'
      ],
      userFields: { createdBy: 'created_by', updatedBy: 'updated_by' }
    },
    update: {
      allowedFields: [
        'label', 'description', 'category', 'renderer_type', 'source_path',
        'source_text', 'source_hash', 'material_version', 'aliases',
        'sort_order', 'manifest', 'dependencies', 'status', 'enabled'
      ],
      userFields: { updatedBy: 'updated_by' }
    }
  }
};
