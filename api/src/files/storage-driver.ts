export type CreateUploadUrlInput = {
  bucket: string;
  objectKey: string;
  contentType?: string | null;
  expiresInSeconds?: number;
};

export type CreateUploadUrlResult = {
  adapter: string;
  bucket: string;
  objectKey: string;
  signedUrl: string;
  token?: string;
  expiresAt?: string;
};

export type CreateDownloadUrlInput = {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
};

export type CreateDownloadUrlResult = {
  adapter: string;
  bucket: string;
  objectKey: string;
  signedUrl: string;
  expiresAt: string;
};

export type StoredObjectHead = {
  exists: boolean;
  size?: number | null;
  mimeType?: string | null;
  updatedAt?: string | null;
};

export interface FileStorageDriver {
  readonly adapter: string;
  createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<CreateDownloadUrlResult>;
  deleteObject(bucket: string, objectKey: string): Promise<void>;
  headObject(bucket: string, objectKey: string): Promise<StoredObjectHead>;
}
