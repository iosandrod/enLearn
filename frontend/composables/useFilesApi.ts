type FileVisibility = 'private' | 'public';
type FileStatus =
  | 'created'
  | 'uploading'
  | 'uploaded'
  | 'ready'
  | 'rejected'
  | 'deleted';

export type FileObject = {
  id: string;
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  ownerId: string;
  visibility: FileVisibility;
  status: FileStatus;
  locked: boolean;
  metadata: Record<string, unknown>;
  uploadExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FileFolder = {
  id: string;
  bucket: string;
  ownerId: string;
  name: string;
  path: string;
  parentPath: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SignedUpload = {
  adapter: string;
  bucket: string;
  objectKey: string;
  signedUrl: string;
  token?: string;
  expiresAt?: string;
};

type SignedDownload = {
  adapter: string;
  bucket: string;
  objectKey: string;
  signedUrl: string;
  expiresAt: string;
};

type CreateUploadIntentInput = {
  file: File;
  visibility?: FileVisibility;
  metadata?: Record<string, unknown>;
  bucket?: string;
  folderPath?: string;
  expiresInSeconds?: number;
};

type UploadProgress = {
  loaded: number;
  total: number;
  progress: number;
};

type UploadFileInput = CreateUploadIntentInput & {
  onProgress?: (progress: UploadProgress) => void;
};

type UploadIntentResponse = {
  file: FileObject;
  upload: SignedUpload;
};

type ConfirmUploadInput = {
  fileId: string;
  checksum?: string;
  status?: 'uploaded' | 'ready' | 'rejected';
};

type DownloadUrlResponse = {
  file: FileObject;
  download: SignedDownload;
};

type ListFilesInput = {
  limit?: number;
  offset?: number;
  status?: FileStatus;
  includeDeleted?: boolean;
};

type ListFilesResponse = {
  items: FileObject[];
  count: number;
  limit: number;
  offset: number;
};

type ListFoldersResponse = {
  items: FileFolder[];
};

type FileObjectRow = {
  id: string;
  bucket: string;
  object_key: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  checksum: string | null;
  owner_id: string;
  visibility: FileVisibility;
  status: FileStatus;
  locked: boolean;
  metadata: Record<string, unknown> | null;
  upload_expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type FileFolderRow = {
  id: string;
  bucket: string;
  owner_id: string;
  name: string;
  path: string;
  parent_path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ListItemsPageResponse<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

type AttachToEntityInput = {
  fileId: string;
  entityType: string;
  entityId: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
};

type FileUsageRow = {
  id: string;
  file_id: string;
  entity_type: string;
  entity_id: string;
  purpose: string;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

async function uploadFileToSignedUrl(
  file: File,
  upload: SignedUpload,
  onProgress?: (progress: UploadProgress) => void
) {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);

  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        progress: Math.min(100, Math.round((event.loaded / event.total) * 100))
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({
          loaded: file.size || 1,
          total: file.size || 1,
          progress: 100
        });
        resolve(xhr);
        return;
      }

      reject(new Error(xhr.responseText || `File upload failed with ${xhr.status}.`));
    };

    xhr.onerror = () => reject(new Error('File upload failed because the network request failed.'));
    xhr.onabort = () => reject(new Error('File upload was cancelled.'));

    xhr.open('PUT', upload.signedUrl);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.send(body);
  });
}

function normalizeFile(row: FileObjectRow): FileObject {
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

function normalizeFolder(row: FileFolderRow): FileFolder {
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

export function useFilesApi() {
  const serviceApi = useServiceApi();
  const { user } = useAuthState();

  async function createUploadIntent(input: CreateUploadIntentInput) {
    return serviceApi.invoke<UploadIntentResponse>('files', 'runAction', {
      resource: 'file_objects',
      operation: 'createUploadIntent',
      originalName: input.file.name,
      mimeType: input.file.type || null,
      sizeBytes: input.file.size,
      visibility: input.visibility ?? 'private',
      metadata: input.metadata ?? {},
      bucket: input.bucket,
      folderPath: input.folderPath,
      expiresInSeconds: input.expiresInSeconds
    });
  }

  async function confirmUpload(input: ConfirmUploadInput) {
    return serviceApi.invoke<{ file: FileObject; object: unknown }>(
      'files',
      'runAction',
      {
        resource: 'file_objects',
        operation: 'confirmUpload',
        fileId: input.fileId,
        checksum: input.checksum,
        status: input.status ?? 'ready'
      }
    );
  }

  async function upload(input: UploadFileInput) {
    const intent = await createUploadIntent(input);
    await uploadFileToSignedUrl(input.file, intent.upload, input.onProgress);
    return confirmUpload({
      fileId: intent.file.id,
      status: 'ready'
    });
  }

  async function getDownloadUrl(fileId: string, expiresInSeconds?: number) {
    return serviceApi.invoke<DownloadUrlResponse>('files', 'runAction', {
      resource: 'file_objects',
      operation: 'getDownloadUrl',
      fileId,
      expiresInSeconds
    });
  }

  async function list(input: ListFilesInput = {}) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);
    if (!user.value?.id) {
      return { items: [], count: 0, limit, offset } satisfies ListFilesResponse;
    }

    const filters: Record<string, unknown> = {};
    filters.owner_id = user.value.id;
    if (!input.includeDeleted) filters.deleted_at = null;
    if (input.status) filters.status = input.status;

    const result = await serviceApi.invoke<
      ListItemsPageResponse<FileObjectRow> | FileObjectRow[]
    >('files', 'listItems', {
      tableName: 'file_objects',
      filters,
      limit,
      offset,
      orderBy: 'created_at',
      orderDirection: 'desc',
      withCount: true,
      responseMode: 'page'
    });
    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result?.rows)
        ? result.rows
        : [];

    return {
      items: rows.map(normalizeFile),
      count: Array.isArray(result) ? result.length : Number(result?.total ?? rows.length),
      limit,
      offset
    } satisfies ListFilesResponse;
  }

  async function listFolders() {
    if (!user.value?.id) return { items: [] } satisfies ListFoldersResponse;

    const filters: Record<string, unknown> = { deleted_at: null };
    filters.owner_id = user.value.id;

    const rows = await serviceApi.invoke<FileFolderRow[]>('files', 'listItems', {
      tableName: 'file_folders',
      filters,
      limit: 300,
      orderBy: 'path',
      orderDirection: 'asc'
    });

    return {
      items: rows.map(normalizeFolder)
    } satisfies ListFoldersResponse;
  }

  async function createFolder(input: {
    name: string;
    parentPath?: string;
    metadata?: Record<string, unknown>;
  }) {
    return serviceApi.invoke<{ folder: FileFolder }>('files', 'runAction', {
      resource: 'file_folders',
      operation: 'createFolder',
      ...input
    });
  }

  async function deleteFolder(path: string) {
    return serviceApi.invoke<{ success: boolean; path: string }>('files', 'runAction', {
      resource: 'file_folders',
      operation: 'deleteFolder',
      path
    });
  }

  async function setFileLocked(fileId: string, locked: boolean) {
    const row = await serviceApi.invoke<FileObjectRow>('files', 'updateItem', {
      resource: 'file_objects',
      id: fileId,
      data: { locked }
    });

    return { file: normalizeFile(row) };
  }

  async function attachToEntity(input: AttachToEntityInput) {
    const fileRows = await serviceApi.invoke<FileObjectRow[]>('files', 'listItems', {
      tableName: 'file_objects',
      filters: { id: input.fileId },
      limit: 1
    });
    const fileRow = fileRows[0];
    if (!fileRow) throw new Error('File not found.');

    const usage = await serviceApi.invoke<FileUsageRow>('files', 'createItem', {
      resource: 'file_usages',
      data: {
        file_id: input.fileId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        purpose: input.purpose ?? 'attachment',
        metadata: input.metadata ?? {}
      }
    });

    return {
      file: normalizeFile(fileRow),
      usage
    };
  }

  async function remove(fileId: string, purge = false) {
    return serviceApi.invoke<{ success: boolean; purged: boolean; file: FileObject }>(
      'files',
      'deleteItem',
      {
        resource: 'file_objects',
        fileId,
        purge
      }
    );
  }

  return {
    createUploadIntent,
    uploadFileToSignedUrl,
    confirmUpload,
    upload,
    getDownloadUrl,
    list,
    listFolders,
    createFolder,
    deleteFolder,
    setFileLocked,
    attachToEntity,
    remove
  };
}
