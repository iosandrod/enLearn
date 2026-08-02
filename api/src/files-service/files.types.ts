export type FileVisibility = 'private' | 'public';
export type FileStatus =
  | 'created'
  | 'uploading'
  | 'uploaded'
  | 'ready'
  | 'rejected'
  | 'deleted';

export type JsonRecord = Record<string, unknown>;

export type FileObjectRow = {
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
  metadata: JsonRecord;
  upload_expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FileFolderRow = {
  id: string;
  bucket: string;
  owner_id: string;
  name: string;
  path: string;
  parent_path: string | null;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
