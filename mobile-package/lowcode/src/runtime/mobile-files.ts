import type { MobileServiceApi } from './service-api';
import { uploadMobileAsset, type MobileNativeAsset } from './native-capabilities';

type MobileFileObject = {
  id: string;
  originalName?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  status?: string;
  [key: string]: unknown;
};

type MobileUploadIntent = {
  file: MobileFileObject;
  upload: {
    signedUrl: string;
    [key: string]: unknown;
  };
};

export async function uploadMesMobileAsset(
  serviceApi: MobileServiceApi,
  asset: MobileNativeAsset,
  options: Record<string, unknown> = {},
) {
  const fileName = asset.name?.trim() || `mes-upload-${Date.now()}`;
  const intent = await serviceApi.invoke<MobileUploadIntent>('files', 'runAction', {
    resource: 'file_objects',
    operation: 'createUploadIntent',
    originalName: fileName,
    mimeType: asset.mimeType ?? null,
    sizeBytes: asset.size ?? 0,
    visibility: options.visibility ?? 'private',
    metadata: options.metadata ?? {},
    ...(typeof options.bucket === 'string' ? { bucket: options.bucket } : {}),
    ...(typeof options.folderPath === 'string' ? { folderPath: options.folderPath } : {}),
  });
  if (!intent.file?.id || !intent.upload?.signedUrl) {
    throw new Error('文件服务未返回完整的上传凭据。');
  }

  try {
    await uploadMobileAsset(asset, intent.upload.signedUrl);
    const confirmed = await serviceApi.invoke<{ file: MobileFileObject }>('files', 'runAction', {
      resource: 'file_objects',
      operation: 'confirmUpload',
      fileId: intent.file.id,
      status: 'ready',
    });
    return confirmed.file;
  } catch (error) {
    await serviceApi.invoke('files', 'runAction', {
      resource: 'file_objects',
      operation: 'confirmUpload',
      fileId: intent.file.id,
      status: 'rejected',
    }).catch(() => undefined);
    throw error;
  }
}
