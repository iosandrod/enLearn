import type { ResourceConfigMap } from '../common/base.service';
import { DEFAULT_BUCKET } from './files.helpers';

export function fileResources(): ResourceConfigMap {
  return {
    files: {
      code: 'file_objects',
      tableName: 'file_objects',
      ownerField: 'owner_id',
      defaults: {
        bucket: DEFAULT_BUCKET,
        visibility: 'private',
        status: 'created',
        locked: false,
        metadata: {}
      },
      list: {
        defaultFilters: { deleted_at: null },
        defaultSorts: [{ field: 'created_at', direction: 'desc' }]
      },
      create: {
        allowedFields: [
          'id',
          'bucket',
          'object_key',
          'original_name',
          'mime_type',
          'size_bytes',
          'checksum',
          'owner_id',
          'visibility',
          'status',
          'locked',
          'metadata',
          'upload_expires_at'
        ],
        requiredFields: ['object_key', 'original_name'],
        userFields: { owner: 'owner_id' }
      },
      update: {
        allowedFields: [
          'bucket',
          'object_key',
          'original_name',
          'mime_type',
          'size_bytes',
          'checksum',
          'visibility',
          'status',
          'locked',
          'metadata',
          'upload_expires_at',
          'deleted_at'
        ]
      },
      delete: {
        softDelete: true,
        statusField: 'status',
        deletedStatus: 'deleted'
      }
    },
    folders: {
      code: 'file_folders',
      tableName: 'file_folders',
      ownerField: 'owner_id',
      defaults: {
        bucket: DEFAULT_BUCKET,
        metadata: {}
      },
      list: {
        defaultFilters: { deleted_at: null },
        defaultSorts: [{ field: 'path', direction: 'asc' }]
      },
      create: {
        allowedFields: ['bucket', 'owner_id', 'name', 'path', 'parent_path', 'metadata', 'deleted_at'],
        requiredFields: ['name', 'path'],
        userFields: { owner: 'owner_id' }
      },
      update: {
        allowedFields: ['bucket', 'name', 'path', 'parent_path', 'metadata', 'deleted_at']
      },
      delete: {
        softDelete: true
      }
    },
    usages: {
      code: 'file_usages',
      tableName: 'file_usages',
      list: {
        defaultSorts: [{ field: 'created_at', direction: 'desc' }]
      },
      create: {
        allowedFields: ['file_id', 'entity_type', 'entity_id', 'purpose', 'metadata', 'created_by'],
        requiredFields: ['file_id', 'entity_type', 'entity_id'],
        timestamp: false,
        userFields: { createdBy: 'created_by' }
      },
      update: {
        allowedFields: ['entity_type', 'entity_id', 'purpose', 'metadata'],
        timestamp: false
      }
    }
  };
}
