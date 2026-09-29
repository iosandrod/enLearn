import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../common/utils/env';
import type {
  CreateDownloadUrlInput,
  CreateDownloadUrlResult,
  CreateUploadUrlInput,
  CreateUploadUrlResult,
  FileStorageDriver,
  StoredObjectHead,
  UploadObjectInput,
  UploadObjectResult
} from './storage-driver';

const execFileAsync = promisify(execFile);

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

function encodeObjectPath(value: string) {
  return value.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function readSupabaseUrl() {
  const env = getEnv();
  const value = String(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!value) {
    throw new BadRequestException('SUPABASE_URL is required for file uploads.');
  }
  return value;
}

function readServiceRoleKey() {
  const env = getEnv();
  const value = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!value) {
    throw new BadRequestException(
      'SUPABASE_SERVICE_ROLE_KEY is required for server-side file uploads.'
    );
  }
  return value;
}

function storageAuthHeaders() {
  const serviceRoleKey = readServiceRoleKey();
  return {
    accept: 'application/json',
    apikey: serviceRoleKey,
    authorization: 'Bearer ' + serviceRoleKey
  };
}

function signedUploadEndpoint(input: CreateUploadUrlInput) {
  return readSupabaseUrl() + '/storage/v1/object/upload/sign/' +
    encodeURIComponent(input.bucket) + '/' + encodeObjectPath(input.objectKey);
}

function normalizeSignedUploadResult(
  input: CreateUploadUrlInput,
  payload: { url?: string; signedUrl?: string; signedURL?: string; path?: string; token?: string }
): CreateUploadUrlResult {
  const rawUrl = payload.signedUrl ?? payload.signedURL ?? payload.url;
  if (!rawUrl) {
    throw new BadRequestException('Storage provider did not return an upload URL.');
  }
  const storageBase = readSupabaseUrl() + '/storage/v1';
  const signedUrl = rawUrl.startsWith('/') ? storageBase + rawUrl : rawUrl;
  return {
    adapter: 'supabase',
    bucket: input.bucket,
    objectKey: payload.path ?? input.objectKey,
    signedUrl,
    token: payload.token,
    expiresAt: input.expiresInSeconds
      ? expiresAt(input.expiresInSeconds)
      : undefined
  };
}

async function createSignedUploadWithFetch(input: CreateUploadUrlInput) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(signedUploadEndpoint(input), {
        method: 'POST',
        headers: storageAuthHeaders(),
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        throw new Error(
          'Create signed upload URL failed (' + response.status + '): ' +
          await readUploadError(response)
        );
      }
      const payload = await response.json() as {
        url?: string;
        signedUrl?: string;
        signedURL?: string;
        path?: string;
        token?: string;
      };
      return normalizeSignedUploadResult(input, payload);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 300 * attempt));
      }
    }
  }
  throw lastError;
}

async function createSignedUploadWithCurl(input: CreateUploadUrlInput) {
  const headers = storageAuthHeaders();
  const marker = '__ENLEARN_STATUS__';
  try {
    const result = await execFileAsync(process.env.CURL_BIN || 'curl', [
      '--silent',
      '--show-error',
      '--http1.1',
      '--retry',
      '2',
      '--retry-all-errors',
      '--request',
      'POST',
      '--header',
      'apikey: ' + headers.apikey,
      '--header',
      'Authorization: ' + headers.authorization,
      '--write-out',
      marker + '%{http_code}',
      signedUploadEndpoint(input)
    ], {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 60_000
    });
    const markerIndex = result.stdout.lastIndexOf(marker);
    const responseBody = markerIndex >= 0
      ? result.stdout.slice(0, markerIndex)
      : result.stdout;
    const status = markerIndex >= 0
      ? Number(result.stdout.slice(markerIndex + marker.length))
      : 0;
    if (status < 200 || status >= 300) {
      throw new Error(
        'Create signed upload URL failed (' + status + '): ' + responseBody
      );
    }
    return normalizeSignedUploadResult(input, JSON.parse(responseBody));
  } catch (error) {
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '').trim()
      : '';
    throw new Error(stderr || 'curl could not create the signed upload URL.');
  }
}

async function createSignedUpload(input: CreateUploadUrlInput) {
  try {
    return await createSignedUploadWithFetch(input);
  } catch (fetchError) {
    try {
      return await createSignedUploadWithCurl(input);
    } catch (curlError) {
      const fetchMessage = fetchError instanceof Error
        ? fetchError.message
        : String(fetchError);
      const curlMessage = curlError instanceof Error
        ? curlError.message
        : String(curlError);
      throw new BadRequestException(
        'Could not create signed upload URL. fetch: ' + fetchMessage +
        '; curl: ' + curlMessage
      );
    }
  }
}

async function readUploadError(response: Response) {
  const body = await response.text().catch(() => '');
  if (!body) return response.statusText || 'Unknown storage error';
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message || parsed.error || body;
  } catch {
    return body;
  }
}

async function putWithFetch(url: string, input: UploadObjectInput) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'content-type': input.contentType || 'application/octet-stream'
        },
        body: input.body,
        signal: AbortSignal.timeout(120_000)
      });
      if (!response.ok) {
        throw new Error(
          'Storage upload failed (' + response.status + '): ' +
          await readUploadError(response)
        );
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 300 * attempt));
      }
    }
  }
  throw lastError;
}

async function putWithCurl(url: string, input: UploadObjectInput) {
  const filePath = resolve(tmpdir(), 'enlearn-upload-' + randomUUID() + '.bin');
  await writeFile(filePath, input.body);
  try {
    const args = [
      '--silent',
      '--show-error',
      '--fail-with-body',
      '--http1.1',
      '--retry',
      '2',
      '--retry-all-errors',
      '--request',
      'PUT',
      '--header',
      'content-type: ' + (input.contentType || 'application/octet-stream'),
      '--data-binary',
      '@' + filePath,
      url
    ];
    try {
      await execFileAsync(process.env.CURL_BIN || 'curl', args, {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        timeout: 150_000
      });
    } catch (error) {
      const stderr = typeof error === 'object' && error !== null && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr ?? '').trim()
        : '';
      throw new Error(stderr || 'curl could not upload the file.');
    }
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}

@Injectable()
export class SupabaseStorageDriver implements FileStorageDriver {
  readonly adapter = 'supabase';

  constructor(private readonly client: SupabaseClient) {}

  async createUploadUrl(
    input: CreateUploadUrlInput
  ): Promise<CreateUploadUrlResult> {
    return createSignedUpload(input);
  }

  async uploadObject(input: UploadObjectInput): Promise<UploadObjectResult> {
    const upload = await this.createUploadUrl({
      bucket: input.bucket,
      objectKey: input.objectKey,
      contentType: input.contentType
    });

    try {
      await putWithFetch(upload.signedUrl, input);
    } catch (fetchError) {
      try {
        await putWithCurl(upload.signedUrl, input);
      } catch (curlError) {
        const fetchMessage = fetchError instanceof Error
          ? fetchError.message
          : String(fetchError);
        const curlMessage = curlError instanceof Error
          ? curlError.message
          : String(curlError);
        throw new BadRequestException(
          'Storage upload failed. fetch: ' + fetchMessage + '; curl: ' + curlMessage
        );
      }
    }

    const supabaseUrl = readSupabaseUrl();
    return {
      adapter: this.adapter,
      bucket: input.bucket,
      objectKey: input.objectKey,
      objectUrl:
        supabaseUrl + '/storage/v1/object/authenticated/' +
        encodeURIComponent(input.bucket) + '/' + encodeObjectPath(input.objectKey)
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
