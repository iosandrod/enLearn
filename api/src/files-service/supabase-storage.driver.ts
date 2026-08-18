import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateDownloadUrlInput,
  CreateDownloadUrlResult,
  CreateUploadUrlInput,
  CreateUploadUrlResult,
  FileStorageDriver,
  StoredObjectHead
} from './storage-driver';

type FileObject = {
  name?: string;
  updated_at?: string | null;
  created_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
    mimeType?: string;
    contentType?: string;
  } | null;
};

function expiresAt(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function splitObjectKey(objectKey: string) {
  const normalized = objectKey.replace(/^\/+|\/+$/g, '');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex === -1) {
    return { directory: '', fileName: normalized };
  }

  return {
    directory: normalized.slice(0, slashIndex),
    fileName: normalized.slice(slashIndex + 1)
  };
}

@Injectable()
export class SupabaseStorageDriver implements FileStorageDriver {
  readonly adapter = 'supabase';

  constructor(private readonly client: SupabaseClient) {}

  async createUploadUrl(
    input: CreateUploadUrlInput
  ): Promise<CreateUploadUrlResult> {
    const { data, error } = await this.client.storage
      .from(input.bucket)
      .createSignedUploadUrl(input.objectKey);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const result = data as {
      signedUrl?: string;
      path?: string;
      token?: string;
      signedURL?: string;
    } | null;
    const signedUrl = result?.signedUrl ?? result?.signedURL;

    if (!signedUrl) {
      throw new BadRequestException('Storage provider did not return an upload URL.');
    }

    return {
      adapter: this.adapter,
      bucket: input.bucket,
      objectKey: result?.path ?? input.objectKey,
      signedUrl,
      token: result?.token,
      expiresAt: input.expiresInSeconds
        ? expiresAt(input.expiresInSeconds)
        : undefined
    };
  }

  async createDownloadUrl(
    input: CreateDownloadUrlInput
  ): Promise<CreateDownloadUrlResult> {
    const { data, error } = await this.client.storage
      .from(input.bucket)
      .createSignedUrl(input.objectKey, input.expiresInSeconds);

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data?.signedUrl) {
      throw new BadRequestException('Storage provider did not return a download URL.');
    }

    return {
      adapter: this.adapter,
      bucket: input.bucket,
      objectKey: input.objectKey,
      signedUrl: data.signedUrl,
      expiresAt: expiresAt(input.expiresInSeconds)
    };
  }

  async deleteObject(bucket: string, objectKey: string) {
    const { error } = await this.client.storage.from(bucket).remove([objectKey]);
    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  async headObject(bucket: string, objectKey: string): Promise<StoredObjectHead> {
    const { directory, fileName } = splitObjectKey(objectKey);
    const { data, error } = await this.client.storage
      .from(bucket)
      .list(directory, {
        limit: 100,
        search: fileName
      });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const file = ((data ?? []) as FileObject[]).find((item) => item.name === fileName);
    if (!file) {
      return { exists: false };
    }

    return {
      exists: true,
      size: file.metadata?.size ?? null,
      mimeType:
        file.metadata?.mimetype ??
        file.metadata?.mimeType ??
        file.metadata?.contentType ??
        null,
      updatedAt: file.updated_at ?? file.created_at ?? null
    };
  }
}
