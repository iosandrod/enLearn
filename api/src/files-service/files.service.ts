import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BaseService,
  type HookContext,
  type ResourceConfigMap,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  getCurrentUser,
  requireAdmin
} from '../common/utils/supabase';
import { SupabaseStorageDriver } from './supabase-storage.driver';
import type { FileStorageDriver } from './storage-driver';
import type {
  FileFolderRow,
  FileObjectRow
} from './files.types';
import {
  buildObjectKey,
  fileMetadataRequiredMessage,
  isMissingFileTable,
  normalizeFile,
  normalizeFolder,
  normalizeFolderPath,
  readBoolean,
  readJsonObject,
  readNumber,
  readOptionalString,
  readStatus,
  readString,
  readVisibility,
  resolveAdminClient,
  resolveConfig,
  sanitizeFolderSegment
} from './files.helpers';
import { fileResources } from './files.resources';

type PostData = Record<string, unknown>;

function asListRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

const STORAGE_ENTITY_DEFINITIONS = [
  {
    code: 'file_objects',
    title: '文件对象',
    table_name: 'public.file_objects',
    route_path: '/dashboard/system/file-entities/file-objects',
    description: '记录文件元数据、对象存储路径、状态、可见性与锁定状态。',
    primary_key: 'id',
    module: '文件存储',
    sort_order: 10,
    field_rows: [
      { field_name: 'id', label: '文件ID', data_type: 'uuid', required: true, description: '文件元数据主键。' },
      { field_name: 'bucket', label: '存储桶', data_type: 'text', required: true, description: '对象存储 bucket。' },
      { field_name: 'object_key', label: '对象路径', data_type: 'text', required: true, description: 'Storage 内部对象 key。' },
      { field_name: 'original_name', label: '原始文件名', data_type: 'text', required: true, description: '用户上传时的文件名。' },
      { field_name: 'mime_type', label: 'MIME 类型', data_type: 'text', required: false, description: '文件内容类型。' },
      { field_name: 'size_bytes', label: '文件大小', data_type: 'bigint', required: false, description: '文件字节数。' },
      { field_name: 'checksum', label: '校验和', data_type: 'text', required: false, description: '文件内容校验值。' },
      { field_name: 'owner_id', label: '拥有者', data_type: 'uuid', required: true, description: '文件所属用户。' },
      { field_name: 'visibility', label: '可见性', data_type: 'text', required: true, description: 'private/public。' },
      { field_name: 'status', label: '状态', data_type: 'text', required: true, description: '上传、可用、删除等生命周期状态。' },
      { field_name: 'locked', label: '锁定', data_type: 'boolean', required: true, description: '锁定后禁止删除。' },
      { field_name: 'metadata', label: '扩展元数据', data_type: 'jsonb', required: true, description: '业务扩展信息。' },
      { field_name: 'created_at', label: '创建时间', data_type: 'timestamptz', required: true, description: '元数据创建时间。' },
      { field_name: 'updated_at', label: '更新时间', data_type: 'timestamptz', required: true, description: '元数据更新时间。' },
      { field_name: 'deleted_at', label: '删除时间', data_type: 'timestamptz', required: false, description: '软删除时间。' }
    ]
  },
  {
    code: 'file_folders',
    title: '文件夹',
    table_name: 'public.file_folders',
    route_path: '/dashboard/system/file-entities/file-folders',
    description: '记录可持久化的文件夹树，支持空文件夹展示和删除。',
    primary_key: 'id',
    module: '文件存储',
    sort_order: 20,
    field_rows: [
      { field_name: 'id', label: '文件夹ID', data_type: 'uuid', required: true, description: '文件夹主键。' },
      { field_name: 'bucket', label: '存储桶', data_type: 'text', required: true, description: '关联对象存储 bucket。' },
      { field_name: 'owner_id', label: '拥有者', data_type: 'uuid', required: true, description: '文件夹所属用户。' },
      { field_name: 'name', label: '文件夹名', data_type: 'text', required: true, description: '当前层级名称。' },
      { field_name: 'path', label: '完整路径', data_type: 'text', required: true, description: '用户可见的目录路径。' },
      { field_name: 'parent_path', label: '父级路径', data_type: 'text', required: false, description: '父文件夹路径。' },
      { field_name: 'metadata', label: '扩展元数据', data_type: 'jsonb', required: true, description: '业务扩展信息。' },
      { field_name: 'created_at', label: '创建时间', data_type: 'timestamptz', required: true, description: '文件夹创建时间。' },
      { field_name: 'updated_at', label: '更新时间', data_type: 'timestamptz', required: true, description: '文件夹更新时间。' },
      { field_name: 'deleted_at', label: '删除时间', data_type: 'timestamptz', required: false, description: '软删除时间。' }
    ]
  },
  {
    code: 'file_usages',
    title: '文件引用',
    table_name: 'public.file_usages',
    route_path: '/dashboard/system/file-entities/file-usages',
    description: '记录文件与业务实体的绑定关系。',
    primary_key: 'id',
    module: '文件存储',
    sort_order: 30,
    field_rows: [
      { field_name: 'id', label: '引用ID', data_type: 'uuid', required: true, description: '文件引用主键。' },
      { field_name: 'file_id', label: '文件ID', data_type: 'uuid', required: true, description: '关联文件对象。' },
      { field_name: 'entity_type', label: '实体类型', data_type: 'text', required: true, description: '业务实体类型。' },
      { field_name: 'entity_id', label: '实体ID', data_type: 'text', required: true, description: '业务实体主键。' },
      { field_name: 'purpose', label: '用途', data_type: 'text', required: true, description: 'attachment/avatar/import 等用途。' },
      { field_name: 'metadata', label: '扩展元数据', data_type: 'jsonb', required: true, description: '业务扩展信息。' },
      { field_name: 'created_by', label: '创建人', data_type: 'uuid', required: false, description: '引用创建用户。' },
      { field_name: 'created_at', label: '创建时间', data_type: 'timestamptz', required: true, description: '引用创建时间。' }
    ]
  }
] as const;

@Injectable()
export class FilesService extends BaseService {
  protected override resources(): ResourceConfigMap {
    return fileResources();
  }

  protected override hooks(): ServiceHooks {
    return {
      files: {
        action: (ctx) => this.runFilesAction(ctx),
        beforeDelete: (ctx) => this.prepareFileDelete(ctx),
        afterDelete: (ctx) => {
          ctx.result = {
            success: true,
            purged: ctx.meta.purge === true,
            file: normalizeFile(ctx.meta.deletedFile as FileObjectRow)
          };
        }
      },
      folders: {
        action: (ctx) => this.runFoldersAction(ctx)
      }
    };
  }

  private async runFilesAction(ctx: HookContext) {
    const operation = readOptionalString(ctx.input.operation ?? ctx.input.actionName ?? ctx.input.action);
    switch (operation) {
      case 'createUploadIntent':
      case 'createUploadUrl':
        ctx.result = await this.createUploadIntent(ctx.input, ctx.context);
        return;
      case 'confirmUpload':
        ctx.result = await this.confirmUpload(ctx.input, ctx.context);
        return;
      case 'getDownloadUrl':
        ctx.result = await this.getDownloadUrl(ctx.input, ctx.context);
        return;
      case 'listStorageEntities':
        ctx.result = await this.listStorageEntities(ctx.context);
        return;
      default:
        throw new BadRequestException(`Unsupported files action: ${operation || 'unknown'}`);
    }
  }

  private async runFoldersAction(ctx: HookContext) {
    const operation = readOptionalString(ctx.input.operation ?? ctx.input.actionName ?? ctx.input.action);
    switch (operation) {
      case 'createFolder':
      case 'create':
        ctx.result = await this.createFolder(ctx.input, ctx.context);
        return;
      case 'deleteFolder':
      case 'delete':
        ctx.result = await this.deleteFolder(ctx.input, ctx.context);
        return;
      default:
        throw new BadRequestException(`Unsupported folders action: ${operation || 'unknown'}`);
    }
  }

  private createStorageDriver(client: SupabaseClient): FileStorageDriver {
    const config = resolveConfig();
    if (config.driver !== 'supabase') {
      throw new BadRequestException(
        `Unsupported FILE_STORAGE_DRIVER "${config.driver}". Only "supabase" is implemented.`
      );
    }

    return new SupabaseStorageDriver(client);
  }

  private async getFileById(context: ServiceContext, id: string): Promise<FileObjectRow> {
    const rows = asListRows<FileObjectRow>(await this.listItems({
      tableName: 'file_objects',
      filters: { id, deleted_at: null },
      limit: 1
    }, context));

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('File not found.');
    }

    return row;
  }

  private assertCanRead(row: FileObjectRow, userId: string) {
    if (row.visibility === 'public' || row.owner_id === userId) return;
    throw new ForbiddenException('You do not have access to this file.');
  }

  private assertCanManage(row: FileObjectRow, userId: string) {
    if (row.owner_id === userId) return;
    throw new ForbiddenException('You do not have permission to manage this file.');
  }

  private async createUploadIntent(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const storageClient = resolveAdminClient(client);
    const storage = this.createStorageDriver(storageClient);
    const config = resolveConfig();

    const id = randomUUID();
    const originalName = readString(
      postData.originalName ?? postData.original_name ?? postData.fileName,
      'originalName'
    );
    const mimeType = readOptionalString(postData.mimeType ?? postData.mime_type) || null;
    const sizeBytes = readNumber(postData.sizeBytes ?? postData.size_bytes, 'sizeBytes');
    const visibility = readVisibility(postData.visibility);
    const metadata = readJsonObject(postData.metadata);
    const folderPath = normalizeFolderPath(
      postData.folderPath ?? postData.folder_path
    );
    const bucket = readOptionalString(postData.bucket) || config.bucket;
    const ttlSeconds = readNumber(
      postData.expiresInSeconds,
      'expiresInSeconds',
      config.uploadTtlSeconds
    );

    if (sizeBytes < 0 || sizeBytes > config.maxUploadBytes) {
      throw new BadRequestException(
        `File size must be between 0 and ${config.maxUploadBytes} bytes.`
      );
    }

    const objectKey =
      readOptionalString(postData.objectKey ?? postData.object_key) ||
      buildObjectKey(user.id, id, originalName, folderPath);
    const uploadExpiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const file = await this.createItem({
      resource: 'files',
      data: {
        id,
        bucket,
        object_key: objectKey,
        original_name: originalName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        owner_id: user.id,
        visibility,
        status: 'uploading',
        metadata,
        upload_expires_at: uploadExpiresAt
      }
    }, context) as FileObjectRow;

    const upload = await storage.createUploadUrl({
      bucket,
      objectKey,
      contentType: mimeType,
      expiresInSeconds: ttlSeconds
    });

    return {
      file: normalizeFile(file),
      upload: {
        ...upload,
        expiresAt: upload.expiresAt ?? uploadExpiresAt
      }
    };
  }

  private async confirmUpload(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const storageClient = resolveAdminClient(client);
    const storage = this.createStorageDriver(storageClient);
    const id = readString(postData.id ?? postData.fileId, 'id');
    const checksum = readOptionalString(postData.checksum) || null;
    const status = readStatus(postData.status) ?? 'ready';

    if (!['uploaded', 'ready', 'rejected'].includes(status)) {
      throw new BadRequestException('status must be "uploaded", "ready", or "rejected".');
    }

    const row = await this.getFileById(context, id);
    this.assertCanManage(row, user.id);

    const objectHead = await storage.headObject(row.bucket, row.object_key);
    if (!objectHead.exists && status !== 'rejected') {
      throw new BadRequestException('Uploaded object was not found in storage.');
    }

    const patch: Partial<FileObjectRow> = {
      status,
      checksum,
      mime_type: objectHead.mimeType ?? row.mime_type,
      size_bytes: objectHead.size ?? row.size_bytes
    };

    const file = await this.updateItem({
      resource: 'files',
      id,
      data: patch
    }, context) as FileObjectRow;

    return {
      file: normalizeFile(file),
      object: objectHead
    };
  }

  private async getDownloadUrl(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const storageClient = resolveAdminClient(client);
    const storage = this.createStorageDriver(storageClient);
    const config = resolveConfig();
    const id = readString(postData.id ?? postData.fileId, 'id');
    const expiresInSeconds = readNumber(
      postData.expiresInSeconds,
      'expiresInSeconds',
      config.downloadTtlSeconds
    );

    const row = await this.getFileById(context, id);
    this.assertCanRead(row, user.id);

    if (!['uploaded', 'ready'].includes(row.status)) {
      throw new BadRequestException('File is not ready for download.');
    }

    const download = await storage.createDownloadUrl({
      bucket: row.bucket,
      objectKey: row.object_key,
      expiresInSeconds
    });

    return {
      file: normalizeFile(row),
      download
    };
  }

  private async listStorageEntities(context: ServiceContext) {
    await requireAdmin(context, [
      'admin.entities.manage',
      'lowcode.pages.manage'
    ]);

    const countResults = await Promise.all(
      STORAGE_ENTITY_DEFINITIONS.map(async (entity) => {
        const tableName = entity.code;
        try {
          const result = await this.listItems({
            tableName,
            select: 'id',
            clientMode: 'admin',
            withCount: true,
            responseMode: 'page',
            limit: 1
          }, context) as { total?: number };

          return [tableName, result.total ?? 0] as const;
        } catch {
          return [tableName, 0] as const;
        }
      })
    );
    const countByCode = new Map(countResults);

    return STORAGE_ENTITY_DEFINITIONS.map((entity) => ({
      ...entity,
      status: 'active',
      status_label: '启用',
      field_count: entity.field_rows.length,
      row_count: countByCode.get(entity.code) ?? 0,
      field_rows: entity.field_rows.map((field, index) => ({
        id: `${entity.code}.${field.field_name}`,
        entity_code: entity.code,
        entity_title: entity.title,
        sort_order: index + 1,
        required_label: field.required ? '是' : '否',
        ...field
      }))
    }));
  }

  private async createFolder(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const config = resolveConfig();
    const parentPath = normalizeFolderPath(
      postData.parentPath ?? postData.parent_path
    );
    const name = sanitizeFolderSegment(
      readString(postData.name ?? postData.folderName, 'name')
    );
    const path = parentPath ? `${parentPath}/${name}` : name;
    const metadata = readJsonObject(postData.metadata);
    const bucket = readOptionalString(postData.bucket) || config.bucket;
    const payload = {
      bucket,
      owner_id: user.id,
      name,
      path,
      parent_path: parentPath || null,
      metadata,
      deleted_at: null
    };
    const existingRows = asListRows<FileFolderRow>(await this.listItems({
      tableName: 'file_folders',
      filters: { bucket, owner_id: user.id, path },
      limit: 1
    }, context));
    const folder = existingRows[0]
      ? await this.updateItem({ resource: 'folders', id: existingRows[0].id, data: payload }, context) as FileFolderRow
      : await this.createItem({ resource: 'folders', data: payload }, context) as FileFolderRow;

    return {
      folder: normalizeFolder(folder)
    };
  }

  private async deleteFolder(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const path = normalizeFolderPath(postData.path ?? postData.folderPath);

    if (!path) {
      throw new BadRequestException('Cannot delete the root folder.');
    }

    const folderPrefix = `users/${user.id}/folders/${path}/`;
    const [childFolders, childFiles] = await Promise.all([
      this.listItems({
        tableName: 'file_folders',
        select: 'id',
        filters: {
          owner_id: user.id,
          deleted_at: null,
          path: { op: 'startsWith', value: `${path}/` }
        },
        limit: 1
      }, context).then(asListRows<{ id: string }>),
      this.listItems({
        tableName: 'file_objects',
        select: 'id',
        filters: {
          owner_id: user.id,
          deleted_at: null,
          object_key: { op: 'startsWith', value: folderPrefix }
        },
        limit: 1
      }, context).then(asListRows<{ id: string }>)
    ]);

    if ((childFolders?.length ?? 0) > 0 || (childFiles?.length ?? 0) > 0) {
      throw new BadRequestException('Folder must be empty before it can be deleted.');
    }

    await this.updateItem({
      resource: 'folders',
      filters: { path },
      data: { deleted_at: new Date().toISOString() }
    }, context);

    return { success: true, path };
  }

  private async prepareFileDelete(ctx: HookContext) {
    const user = ctx.user ?? (await getCurrentUser(ctx.context)).user;
    const storageClient = resolveAdminClient(ctx.client);
    const storage = this.createStorageDriver(storageClient);
    const id = readString(ctx.id ?? ctx.input.fileId, 'id');
    const purge = readBoolean(ctx.input.purge, false);
    const row = await this.getFileById(ctx.context, id);
    this.assertCanManage(row, user.id);

    if (row.locked) {
      throw new BadRequestException('Locked files cannot be deleted.');
    }

    if (purge) {
      await storage.deleteObject(row.bucket, row.object_key);
    }

    ctx.id = id;
    ctx.meta.purge = purge;
    ctx.meta.deletedFile = {
      ...row,
      status: 'deleted',
      deleted_at: new Date().toISOString()
    } satisfies FileObjectRow;
  }
}
