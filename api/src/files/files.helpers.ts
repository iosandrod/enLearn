import { BadRequestException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../common/utils/supabase';
import { getEnv } from '../common/utils/env';
import type {
  FileFolderRow,
  FileObjectRow,
  FileStatus,
  FileVisibility,
  JsonRecord
} from './files.types';

export const DEFAULT_BUCKET = 'app-files';
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

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function readString(value: unknown, name: string, fallback = '') {
  const optional = readOptionalString(value);
  if (optional) return optional;
  if (fallback) return fallback;
  throw new BadRequestException(`${name} is required.`);
}

export function readNumber(value: unknown, name: string, fallback?: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (fallback !== undefined) return fallback;
  throw new BadRequestException(`${name} must be a number.`);
}

export function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

export function readJsonObject(value: unknown, fallback: JsonRecord = {}) {
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

export function readVisibility(value: unknown) {
  const visibility = readOptionalString(value) || 'private';
  if (!VISIBILITIES.has(visibility as FileVisibility)) {
    throw new BadRequestException('visibility must be "private" or "public".');
  }
  return visibility as FileVisibility;
}

export function readStatus(value: unknown) {
  const status = readOptionalString(value);
  if (!STATUSES.has(status as FileStatus)) return undefined;
  return status as FileStatus;
}

export function sanitizeFolderSegment(value: string) {
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

export function normalizeFolderPath(value: unknown) {
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

export function resolveConfig() {
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

export function resolveAdminClient(fallback: SupabaseClient) {
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

export function buildObjectKey(
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

export function normalizeFile(row: FileObjectRow) {
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

export function normalizeFolder(row: FileFolderRow) {
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

export function isMissingFileTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error?.code === 'PGRST205' ||
      error?.code === '42P01' ||
      error?.message?.includes('file_objects') ||
      error?.message?.includes('file_folders') ||
      error?.message?.includes('file_usages') ||
      error?.message?.includes('Could not find the table')
  );
}

export function fileMetadataRequiredMessage() {
  return 'File metadata tables are not created yet. Run supabase/migrations/20260729090000_file_storage_system.sql first.';
}
