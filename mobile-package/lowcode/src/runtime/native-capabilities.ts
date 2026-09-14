import { Native } from '@hippy/vue-next';

export type MobileNativeCapability = 'scan' | 'camera' | 'gallery' | 'file';
export type MobilePushToken = {
  token: string;
  platform: 'android' | 'ios' | 'web';
  provider?: string;
  appVersion?: string;
  deviceId?: string;
};

export type MobileNativeAsset = {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
};

export type MobileScanResult = {
  value: string;
  format?: string;
  metadata?: Record<string, unknown>;
};

type NativeResult = Record<string, unknown> | string | null | undefined;

const MODULE_NAME = 'EnLearnMES';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAsset(value: NativeResult): MobileNativeAsset {
  const record = isRecord(value) ? value : {};
  const uri = readString(record.uri ?? record.path ?? record.url);
  if (!uri) throw new Error('原生端没有返回可用的文件地址。');
  return {
    uri,
    name: readString(record.name ?? record.fileName) || undefined,
    mimeType: readString(record.mimeType ?? record.type) || undefined,
    size: typeof record.size === 'number' ? record.size : undefined,
    width: typeof record.width === 'number' ? record.width : undefined,
    height: typeof record.height === 'number' ? record.height : undefined,
    metadata: isRecord(record.metadata) ? record.metadata : undefined,
  };
}

export async function callMesNative(method: string, options: Record<string, unknown>) {
  if (__PLATFORM__ === 'web') {
    throw new Error('该功能需要 Android 或 iOS 的 MES 原生宿主。');
  }

  return (Native.callNativeWithPromise as unknown as (
    moduleName: string,
    methodName: string,
    input: Record<string, unknown>,
  ) => Promise<NativeResult>)(MODULE_NAME, method, options);
}

export async function scanMobileCode(options: Record<string, unknown> = {}) {
  if (__PLATFORM__ === 'web') {
    const value = typeof window !== 'undefined'
      ? window.prompt('输入扫码结果用于 Web 预览', '')?.trim() ?? ''
      : '';
    if (!value) throw new Error('未获取到扫码结果。');
    return { value, format: 'manual' } satisfies MobileScanResult;
  }

  const result = await callMesNative('scanCode', options);
  const record = isRecord(result) ? result : {};
  const value = readString(record.value ?? record.text ?? record.content ?? result);
  if (!value) throw new Error('未获取到扫码结果。');
  return {
    value,
    format: readString(record.format ?? record.type) || undefined,
    metadata: isRecord(record.metadata) ? record.metadata : undefined,
  } satisfies MobileScanResult;
}

function browserFile(accept: string, capture?: string) {
  return new Promise<MobileNativeAsset>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('未选择文件。'));
        return;
      }
      resolve({
        uri: URL.createObjectURL(file),
        name: file.name,
        mimeType: file.type,
        size: file.size,
        metadata: { webFile: file },
      });
    };
    input.click();
  });
}

export async function captureMobilePhoto(options: Record<string, unknown> = {}) {
  if (__PLATFORM__ === 'web') return browserFile('image/*', 'environment');
  return normalizeAsset(await callMesNative('capturePhoto', options));
}

export async function pickMobileAsset(
  capability: 'gallery' | 'file',
  options: Record<string, unknown> = {},
) {
  if (__PLATFORM__ === 'web') {
    return browserFile(capability === 'gallery' ? 'image/*' : String(options.accept ?? '*/*'));
  }
  return normalizeAsset(await callMesNative(
    capability === 'gallery' ? 'pickImage' : 'pickFile',
    options,
  ));
}

export async function invokeMobileNativeCapability(
  capability: MobileNativeCapability,
  options: Record<string, unknown> = {},
) {
  if (capability === 'scan') return scanMobileCode(options);
  if (capability === 'camera') return captureMobilePhoto(options);
  return pickMobileAsset(capability, options);
}

export function webFileFromAsset(asset: MobileNativeAsset) {
  const file = asset.metadata?.webFile;
  return typeof File !== 'undefined' && file instanceof File ? file : undefined;
}

export async function uploadMobileAsset(
  asset: MobileNativeAsset,
  signedUrl: string,
  headers: Record<string, string> = {},
) {
  const url = signedUrl.trim();
  if (!url) throw new Error('未返回有效的文件上传地址。');
  if (__PLATFORM__ !== 'web') {
    const result = await callMesNative('uploadFile', {
      uri: asset.uri,
      url,
      method: 'PUT',
      headers: { 'x-upsert': 'false', ...headers },
      fieldName: '',
      formData: { cacheControl: '3600' },
    });
    const record = isRecord(result) ? result : {};
    const status = typeof record.status === 'number'
      ? record.status
      : typeof record.statusCode === 'number'
        ? record.statusCode
        : 200;
    if (status < 200 || status >= 300) {
      throw new Error(readString(record.message) || `文件上传失败（${status}）。`);
    }
    return record;
  }

  const file = webFileFromAsset(asset);
  if (!file) throw new Error('Web 预览未保留可上传的文件对象。');
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'x-upsert': 'false', ...headers },
    body,
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `文件上传失败（${response.status}）。`);
  }
  return { status: response.status };
}

export async function getMobilePushToken(options: Record<string, unknown> = {}) {
  if (__PLATFORM__ === 'web') {
    throw new Error('推送注册需要 Android 或 iOS 的 MES 原生宿主。');
  }
  const result = await callMesNative('getPushToken', options);
  const record = isRecord(result) ? result : {};
  const token = readString(record.token ?? record.deviceToken ?? result);
  if (!token) throw new Error('原生端没有返回推送 Token。');
  return {
    token,
    platform: __PLATFORM__ === 'ios' ? 'ios' : 'android',
    provider: readString(record.provider) || undefined,
    appVersion: readString(record.appVersion) || undefined,
    deviceId: readString(record.deviceId) || undefined,
  } satisfies MobilePushToken;
}
