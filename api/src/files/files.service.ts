import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ServiceContext,
  ServiceExecutor
} from '../common/interfaces/service-executor';
import { createSupabaseClient, getCurrentUser } from '../common/utils/supabase';
import { getEnv } from '../common/utils/env';
import { SupabaseStorageDriver } from './supabase-storage.driver';
import type { FileStorageDriver } from './storage-driver';
import type {
  FileFolderRow,
  FileObjectRow,
  FileStatus,
  FileVisibility,
  JsonRecord
} from './files.types';

type PostData = Record<string, unknown>;

const DEFAULT_BUCKET = 'app-files';
const DEFAULT_UPLOAD_TTL_SECONDS = 60 * 15;
const DEFAULT_DOWNLOAD_TTL_SECONDS = 60 * 10;
const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 50;
const VISIBILITIES = new Set<FileVisibility>(['private', 'public']);
const STATUSES = new Set<FileStatus>([
  'created',
  'uploading',
  'uploaded',
  'ready',
  'rejected',
  'deleted'
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readString(value: unknown, name: string, fallback = '') {
  const optional = readOptionalString(value);
  if (optional) return optional;
  if (fallback) return fallback;
  throw new BadRequestException(`${name} is required.`);
}

function readNumber(value: unknown, name: string, fallback?: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (fallback !== undefined) return fallback;
  throw new BadRequestException(`${name} must be a number.`);
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function readJsonObject(value: unknown, fallback: JsonRecord = {}) {
  if (isRecord(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new BadRequestException('metadata must be valid JSON.');
    }
  }
  return fallback;
}

function readVisibility(value: unknown) {
  const visibility = readOptionalString(value) || 'private';
  if (!VISIBILITIES.has(visibility as FileVisibility)) {
    throw new BadRequestException('visibility must be "private" or "public".');
  }
  return visibility as FileVisibility;
}

function readStatus(value: unknown) {
  const status = readOptionalString(value);
  if (!STATUSES.has(status as FileStatus)) return undefined;
  return status as FileStatus;
}

function sanitizeFolderSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\]+/g, '/')
    .replace(/[^\w.\- \u4e00-\u9fa5]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new BadRequestException('Folder name is invalid.');
  }

  return sanitized;
}

function normalizeFolderPath(value: unknown) {
  const raw = readOptionalString(value);
  if (!raw) return '';

  return raw
    .replace(/[\\]+/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(sanitizeFolderSegment)
    .join('/');
}

function resolveConfig() {
  const env = getEnv();
  return {
    driver: (env.FILE_STORAGE_DRIVER || 'supabase').trim().toLowerCase(),
    bucket: (env.FILE_STORAGE_BUCKET || DEFAULT_BUCKET).trim(),
    uploadTtlSeconds: readNumber(
      env.FILE_UPLOAD_URL_TTL_SECONDS,
      'FILE_UPLOAD_URL_TTL_SECONDS',
      DEFAULT_UPLOAD_TTL_SECONDS
    ),
    downloadTtlSeconds: readNumber(
      env.FILE_DOWNLOAD_URL_TTL_SECONDS,
      'FILE_DOWNLOAD_URL_TTL_SECONDS',
      DEFAULT_DOWNLOAD_TTL_SECONDS
    ),
    maxUploadBytes: readNumber(
      env.FILE_MAX_UPLOAD_BYTES,
      'FILE_MAX_UPLOAD_BYTES',
      DEFAULT_MAX_UPLOAD_BYTES
    )
  };
}

function resolveAdminClient(fallback: SupabaseClient) {
  try {
    return createSupabaseClient('admin');
  } catch {
    return fallback;
  }
}

function sanitizeFileName(value: string) {
  const fallback = 'file';
  const name = value
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim();

  if (!name) return fallback;

  const sanitized = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return sanitized || fallback;
}

function buildObjectKey(
  userId: string,
  fileId: string,
  originalName: string,
  folderPath = ''
) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = sanitizeFileName(originalName);
  if (folderPath) {
    return `users/${userId}/folders/${folderPath}/${fileId}/${safeName}`;
  }
  return `users/${userId}/${year}/${month}/${fileId}/${safeName}`;
}

function normalizeFile(row: FileObjectRow) {
  return {
    id: row.id,
    bucket: row.bucket,
    objectKey: row.object_key,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    ownerId: row.owner_id,
    visibility: row.visibility,
    status: row.status,
    locked: row.locked === true,
    metadata: row.metadata ?? {},
    uploadExpiresAt: row.upload_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function normalizeFolder(row: FileFolderRow) {
  return {
    id: row.id,
    bucket: row.bucket,
    ownerId: row.owner_id,
    name: row.name,
    path: row.path,
    parentPath: row.parent_path,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function isMissingFileTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error?.code === 'PGRST205' ||
      error?.code === '42P01' ||
      error?.message?.includes('file_objects') ||
      error?.message?.includes('file_folders') ||
      error?.message?.includes('file_usages') ||
      error?.message?.includes('Could not find the table')
  );
}

function fileMetadataRequiredMessage() {
  return 'File metadata tables are not created yet. Run supabase/migrations/20260729090000_file_storage_system.sql first.';
}

@Injectable()
export class FilesService implements ServiceExecutor {
  async execute(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'createUploadIntent':
      case 'createUploadUrl':
        return this.createUploadIntent(postData, context);
      case 'confirmUpload':
        return this.confirmUpload(postData, context);
      case 'getDownloadUrl':
        return this.getDownloadUrl(postData, context);
      case 'list':
      case 'listFiles':
        return this.list(postData, context);
      case 'listFolders':
        return this.listFolders(context);
      case 'createFolder':
        return this.createFolder(postData, context);
      case 'deleteFolder':
        return this.deleteFolder(postData, context);
      case 'setFileLocked':
      case 'lockFile':
        return this.setFileLocked(postData, context);
      case 'attachToEntity':
        return this.attachToEntity(postData, context);
      case 'delete':
      case 'deleteFile':
        return this.deleteFile(postData, context);
      default:
        throw new BadRequestException(`Unsupported files method: ${method}`);
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

  private async getFileById(
    client: SupabaseClient,
    id: string
  ): Promise<FileObjectRow> {
    const { data, error } = await client
      .from('file_objects')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      if (isMissingFileTable(error)) {
        throw new BadRequestException(fileMetadataRequiredMessage());
      }
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('File not found.');
    }

    return data as FileObjectRow;
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
    const dataClient = resolveAdminClient(client);
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

    const { data, error } = await dataClient
      .from('file_objects')
      .insert({
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
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingFileTable(error)) {
        throw new BadRequestException(fileMetadataRequiredMessage());
      }
      throw new BadRequestException(error.message);
    }

    const upload = await storage.createUploadUrl({
      bucket,
      objectKey,
      contentType: mimeType,
      expiresInSeconds: ttlSeconds
    });

    return {
      file: normalizeFile(data as FileObjectRow),
      upload: {
        ...upload,
        expiresAt: upload.expiresAt ?? uploadExpiresAt
      }
    };
  }

  private async confirmUpload(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
    const storageClient = resolveAdminClient(client);
    const storage = this.createStorageDriver(storageClient);
    const id = readString(postData.id ?? postData.fileId, 'id');
    const checksum = readOptionalString(postData.checksum) || null;
    const status = readStatus(postData.status) ?? 'ready';

    if (!['uploaded', 'ready', 'rejected'].includes(status)) {
      throw new BadRequestException('status must be "uploaded", "ready", or "rejected".');
    }

    const row = await this.getFileById(dataClient, id);
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

    const { data, error } = await dataClient
      .from('file_objects')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      file: normalizeFile(data as FileObjectRow),
      object: objectHead
    };
  }

  private async getDownloadUrl(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
    const storageClient = resolveAdminClient(client);
    const storage = this.createStorageDriver(storageClient);
    const config = resolveConfig();
    const id = readString(postData.id ?? postData.fileId, 'id');
    const expiresInSeconds = readNumber(
      postData.expiresInSeconds,
      'expiresInSeconds',
      config.downloadTtlSeconds
    );

    const row = await this.getFileById(dataClient, id);
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

  private async list(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
    const limit = Math.min(
      Math.max(readNumber(postData.limit, 'limit', 50), 1),
      100
    );
    const offset = Math.max(readNumber(postData.offset, 'offset', 0), 0);
    const includeDeleted = readBoolean(postData.includeDeleted, false);
    const status = readStatus(postData.status);

    let query = dataClient
      .from('file_objects')
      .select('*', { count: 'exact' })
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;
    if (error) {
      if (isMissingFileTable(error)) {
        return { items: [], count: 0, limit, offset };
      }
      throw new BadRequestException(error.message);
    }

    return {
      items: ((data ?? []) as FileObjectRow[]).map(normalizeFile),
      count: count ?? 0,
      limit,
      offset
    };
  }

  private async listFolders(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);

    const { data, error } = await dataClient
      .from('file_folders')
      .select('*')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('path', { ascending: true });

    if (error) {
      if (isMissingFileTable(error)) return { items: [] };
      throw new BadRequestException(error.message);
    }

    return {
      items: ((data ?? []) as FileFolderRow[]).map(normalizeFolder)
    };
  }

  private async createFolder(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
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

    const { data, error } = await dataClient
      .from('file_folders')
      .upsert(
        {
          bucket,
          owner_id: user.id,
          name,
          path,
          parent_path: parentPath || null,
          metadata,
          deleted_at: null
        },
        { onConflict: 'bucket,owner_id,path' }
      )
      .select('*')
      .single();

    if (error) {
      if (isMissingFileTable(error)) {
        throw new BadRequestException(fileMetadataRequiredMessage());
      }
      throw new BadRequestException(error.message);
    }

    return {
      folder: normalizeFolder(data as FileFolderRow)
    };
  }

  private async deleteFolder(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
    const path = normalizeFolderPath(postData.path ?? postData.folderPath);

    if (!path) {
      throw new BadRequestException('Cannot delete the root folder.');
    }

    const folderPrefix = `users/${user.id}/folders/${path}/`;
    const [{ data: childFolders, error: childFolderError }, { data: childFiles, error: childFileError }] =
      await Promise.all([
        dataClient
          .from('file_folders')
          .select('id')
          .eq('owner_id', user.id)
          .is('deleted_at', null)
          .like('path', `${path}/%`)
          .limit(1),
        dataClient
          .from('file_objects')
          .select('id')
          .eq('owner_id', user.id)
          .is('deleted_at', null)
          .like('object_key', `${folderPrefix}%`)
          .limit(1)
      ]);

    if (childFolderError || childFileError) {
      const error = childFolderError ?? childFileError;
      if (isMissingFileTable(error)) {
        throw new BadRequestException(fileMetadataRequiredMessage());
      }
      throw new BadRequestException(error?.message ?? 'Failed to check folder.');
    }

    if ((childFolders?.length ?? 0) > 0 || (childFiles?.length ?? 0) > 0) {
      throw new BadRequestException('Folder must be empty before it can be deleted.');
    }

    const { error } = await dataClient
      .from('file_folders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('owner_id', user.id)
      .eq('path', path);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { success: true, path };
  }

  private async setFileLocked(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
    const id = readString(postData.id ?? postData.fileId, 'id');
    const locked = readBoolean(postData.locked, true);
    const row = await this.getFileById(dataClient, id);
    this.assertCanManage(row, user.id);

    const { data, error } = await dataClient
      .from('file_objects')
      .update({ locked })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      file: normalizeFile(data as FileObjectRow)
    };
  }

  private async attachToEntity(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
    const fileId = readString(postData.fileId ?? postData.file_id, 'fileId');
    const entityType = readString(
      postData.entityType ?? postData.entity_type,
      'entityType'
    );
    const entityId = readString(postData.entityId ?? postData.entity_id, 'entityId');
    const purpose = readString(postData.purpose, 'purpose', 'attachment');
    const metadata = readJsonObject(postData.metadata);
    const row = await this.getFileById(dataClient, fileId);
    this.assertCanManage(row, user.id);

    const { data, error } = await dataClient
      .from('file_usages')
      .insert({
        file_id: fileId,
        entity_type: entityType,
        entity_id: entityId,
        purpose,
        created_by: user.id,
        metadata
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingFileTable(error)) {
        throw new BadRequestException(fileMetadataRequiredMessage());
      }
      throw new BadRequestException(error.message);
    }

    return {
      file: normalizeFile(row),
      usage: data
    };
  }

  private async deleteFile(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const dataClient = resolveAdminClient(client);
    const storageClient = resolveAdminClient(client);
    const storage = this.createStorageDriver(storageClient);
    const id = readString(postData.id ?? postData.fileId, 'id');
    const purge = readBoolean(postData.purge, false);
    const row = await this.getFileById(dataClient, id);
    this.assertCanManage(row, user.id);

    if (row.locked) {
      throw new BadRequestException('Locked files cannot be deleted.');
    }

    if (purge) {
      await storage.deleteObject(row.bucket, row.object_key);
    }

    const { data, error } = await dataClient
      .from('file_objects')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      purged: purge,
      file: normalizeFile(data as FileObjectRow)
    };
  }
}
