import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { createSupabaseClient } from '../common/utils/supabase';
import { getEnv } from '../common/utils/env';
import { SupabaseStorageDriver } from '../files-service/supabase-storage.driver';
import type { PrintArtifact, PrintContext, PrintFormat, RenderedFile } from './print.types';

function safeName(value: string) {
  const normalized = value.replace(/[\\\/]+/g, '-').replace(/[^\w\u4e00-\u9fff .-]+/g, '').trim();
  return normalized.slice(0, 120) || 'print-output';
}

function contentDisposition(filename: string) {
  const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
  return "attachment; filename=\"" + safeName(filename) + "\"; filename*=UTF-8''" + encoded;
}

@Injectable()
export class PrintArtifactStorage {
  private driver() {
    return new SupabaseStorageDriver(createSupabaseClient('admin'));
  }

  async upload(
    jobId: string,
    accountId: string,
    file: RenderedFile,
    requestedName?: string
  ): Promise<PrintArtifact> {
    const env = getEnv();
    const bucket = env.PRINT_STORAGE_BUCKET?.trim() || env.FILE_STORAGE_BUCKET?.trim() || 'app-files';
    const extension = file.name.split('.').pop() || 'bin';
    const base = safeName(requestedName || file.name.replace(/\.[^.]+$/, ''));
    const filename = base + '-' + randomUUID().slice(0, 8) + '.' + extension;
    const objectKey = 'print/' + accountId + '/' + jobId + '/' + filename;
    const driver = this.driver();
    await driver.uploadObject({
      bucket,
      objectKey,
      body: file.body,
      contentType: file.mimeType
    });
    const ttl = Number(env.PRINT_DOWNLOAD_TTL_SECONDS ?? 900);
    const download = await driver.createDownloadUrl({
      bucket,
      objectKey,
      expiresInSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 900
    });
    const format: PrintFormat = extension === 'pdf'
      ? 'pdf'
      : extension === 'jpg'
        ? 'jpeg'
        : extension === 'zip'
          ? 'zip'
          : 'png';
    return {
      artifactId: randomUUID(),
      storageKey: objectKey,
      format,
      mimeType: file.mimeType,
      sizeBytes: file.body.byteLength,
      sha256: createHash('sha256').update(file.body).digest('hex'),
      recordCount: 1,
      downloadUrl: download.signedUrl,
      expiresAt: download.expiresAt,
      contentDisposition: contentDisposition(filename)
    };
  }

  async refresh(
    _context: PrintContext,
    objectKey: string,
    mimeType: string,
    filename: string
  ) {
    const env = getEnv();
    const bucket = env.PRINT_STORAGE_BUCKET?.trim() || env.FILE_STORAGE_BUCKET?.trim() || 'app-files';
    const ttl = Number(env.PRINT_DOWNLOAD_TTL_SECONDS ?? 900);
    const download = await this.driver().createDownloadUrl({
      bucket,
      objectKey,
      expiresInSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 900
    });
    return {
      downloadUrl: download.signedUrl,
      expiresAt: download.expiresAt,
      contentDisposition: contentDisposition(filename),
      mimeType
    };
  }
}
