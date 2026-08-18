import {
  readMobileStorageValue,
  removeMobileStorageValue,
  writeMobileStorageValue,
} from '../config';
import { getMobilePushToken } from './native-capabilities';
import type { MobileServiceApi } from './service-api';

const PUSH_REGISTRATION_PREFIX = 'enlearn_mobile_push_registration';

function registrationKey(userId: string, accountId: string) {
  return `${PUSH_REGISTRATION_PREFIX}:${userId.trim()}:${accountId.trim()}`;
}

export async function registerMobilePushDevice(
  serviceApi: MobileServiceApi,
  userId: string,
  accountId: string,
) {
  if (__PLATFORM__ === 'web' || !userId.trim() || !accountId.trim()) return null;
  const device = await getMobilePushToken();
  const fingerprint = JSON.stringify(device);
  const key = registrationKey(userId, accountId);
  if (await readMobileStorageValue(key) === fingerprint) return device;
  await serviceApi.invoke('notification', 'registerPushDevice', device);
  await writeMobileStorageValue(key, fingerprint);
  return device;
}

export async function unregisterMobilePushDevice(
  serviceApi: MobileServiceApi,
  userId: string,
  accountId: string,
) {
  if (__PLATFORM__ === 'web' || !userId.trim() || !accountId.trim()) return;
  const key = registrationKey(userId, accountId);
  const value = await readMobileStorageValue(key);
  if (value) {
    try {
      const device = JSON.parse(value) as { token?: string; platform?: string };
      if (device.token) await serviceApi.invoke('notification', 'unregisterPushDevice', device);
    } catch {
      // A malformed local registration should not block local sign-out.
    }
  }
  await removeMobileStorageValue(key);
}
