import { Native } from '@hippy/vue-next';
import { reactive } from '@vue/runtime-core';

export type MobileNetworkStatus = 'online' | 'offline' | 'unknown';

export const mobileNetwork = reactive<{
  status: MobileNetworkStatus;
  type: string;
  initialized: boolean;
}>({
  status: 'unknown',
  type: 'unknown',
  initialized: false,
});

let removeNativeListener: (() => void) | null = null;
let removeBrowserListeners: (() => void) | null = null;

function normalizedNetworkType(value: unknown) {
  if (typeof value === 'string') return value.trim().toLowerCase() || 'unknown';
  if (value && typeof value === 'object') {
    const record = value as { network_info?: unknown; networkInfo?: unknown; type?: unknown };
    return normalizedNetworkType(record.network_info ?? record.networkInfo ?? record.type);
  }
  return 'unknown';
}

export function isOfflineNetworkType(value: unknown) {
  const type = normalizedNetworkType(value);
  return ['none', 'offline', 'disconnected', 'no_network', 'unknown_offline'].includes(type);
}

export function networkStatusFromType(value: unknown): MobileNetworkStatus {
  return isOfflineNetworkType(value) ? 'offline' : 'online';
}

function applyNetworkType(value: unknown) {
  const type = normalizedNetworkType(value);
  mobileNetwork.type = type;
  mobileNetwork.status = networkStatusFromType(type);
  mobileNetwork.initialized = true;
}

export async function refreshMobileNetworkStatus() {
  if (__PLATFORM__ === 'web') {
    applyNetworkType(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online');
    return mobileNetwork.status;
  }

  try {
    applyNetworkType(await Native.NetInfo.fetch());
  } catch {
    mobileNetwork.status = 'unknown';
    mobileNetwork.type = 'unknown';
    mobileNetwork.initialized = true;
  }
  return mobileNetwork.status;
}

export function startMobileNetworkMonitor() {
  if (__PLATFORM__ === 'web') {
    if (!removeBrowserListeners && typeof window !== 'undefined') {
      const online = () => applyNetworkType('online');
      const offline = () => applyNetworkType('offline');
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      removeBrowserListeners = () => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      };
    }
  } else if (!removeNativeListener) {
    try {
      const revoker = Native.NetInfo.addEventListener('networkStatusDidChange', applyNetworkType);
      removeNativeListener = () => Native.NetInfo.removeEventListener('networkStatusDidChange', revoker);
    } catch {
      removeNativeListener = () => undefined;
    }
  }

  void refreshMobileNetworkStatus();
  return () => {
    removeBrowserListeners?.();
    removeBrowserListeners = null;
    removeNativeListener?.();
    removeNativeListener = null;
  };
}
