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

type AttachToEntityInput = {
  fileId: string;
  entityType: string;
  entityId: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
};

async function uploadFileToSignedUrl(file: File, upload: SignedUpload) {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);

  const response = await fetch(upload.signedUrl, {
    method: 'PUT',
    headers: {
      'x-upsert': 'false'
    },
    body
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `File upload failed with ${response.status}.`);
  }

  return response;
}

export function useFilesApi() {
  const serviceApi = useServiceApi();

  async function createUploadIntent(input: CreateUploadIntentInput) {
    return serviceApi.invoke<UploadIntentResponse>('files', 'createUploadIntent', {
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
      'confirmUpload',
      {
        fileId: input.fileId,
        checksum: input.checksum,
        status: input.status ?? 'ready'
      }
    );
  }

  async function upload(input: CreateUploadIntentInput) {
    const intent = await createUploadIntent(input);
    await uploadFileToSignedUrl(input.file, intent.upload);
    return confirmUpload({
      fileId: intent.file.id,
      status: 'ready'
    });
  }

  async function getDownloadUrl(fileId: string, expiresInSeconds?: number) {
    return serviceApi.invoke<DownloadUrlResponse>('files', 'getDownloadUrl', {
      fileId,
      expiresInSeconds
    });
  }

  async function list(input: ListFilesInput = {}) {
    return serviceApi.invoke<ListFilesResponse>('files', 'list', input);
  }

  async function listFolders() {
    return serviceApi.invoke<ListFoldersResponse>('files', 'listFolders');
  }

  async function createFolder(input: {
    name: string;
    parentPath?: string;
    metadata?: Record<string, unknown>;
  }) {
    return serviceApi.invoke<{ folder: FileFolder }>('files', 'createFolder', input);
  }

  async function deleteFolder(path: string) {
    return serviceApi.invoke<{ success: boolean; path: string }>('files', 'deleteFolder', {
      path
    });
  }

  async function setFileLocked(fileId: string, locked: boolean) {
    return serviceApi.invoke<{ file: FileObject }>('files', 'setFileLocked', {
      fileId,
      locked
    });
  }

  async function attachToEntity(input: AttachToEntityInput) {
    return serviceApi.invoke<{ file: FileObject; usage: unknown }>(
      'files',
      'attachToEntity',
      input
    );
  }

  async function remove(fileId: string, purge = false) {
    return serviceApi.invoke<{ success: boolean; purged: boolean; file: FileObject }>(
      'files',
      'delete',
      {
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
