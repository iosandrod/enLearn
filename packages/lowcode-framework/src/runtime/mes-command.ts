const MES_WEB_DEVICE_ID_KEY = 'enlearn_mes_web_device_id';
const MES_WEB_LOCAL_SEQUENCE_KEY = 'enlearn_mes_web_local_sequence';
const MES_WEB_SEQUENCE_LOCK = 'enlearn-mes-web-local-sequence';

export const desktopMesCommandMethods = new Set([
  'releaseWorkOrder',
  'startOperation',
  'pauseOperation',
  'resumeOperation',
  'reportProduction',
  'issueMaterial',
  'returnMaterial',
  'completeOperation',
  'reverseProduction',
  'reverseProductionReport',
  'undoProductionReport',
  'reverseMaterial',
  'reverseMaterialTransaction',
  'reverseTransaction',
]);

export type DesktopMesCommandRequest = {
  requestId: string;
  postData: Record<string, unknown>;
};

let volatileDeviceId = '';
let volatileSequence = 0;
let sequenceReservation: Promise<number> | null = null;

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function createStableId(prefix: string) {
  const value = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function readStorage(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Volatile fallbacks keep command creation available when storage is blocked.
  }
}

export function isDesktopMesCommand(serviceName: string, serviceMethod: string) {
  return serviceName.trim() === 'mes' && desktopMesCommandMethods.has(serviceMethod.trim());
}

export function getDesktopMesDeviceId() {
  const stored = readString(readStorage(MES_WEB_DEVICE_ID_KEY));
  if (stored) {
    volatileDeviceId = stored;
    return stored;
  }
  if (volatileDeviceId) return volatileDeviceId;

  volatileDeviceId = createStableId('mes-web');
  writeStorage(MES_WEB_DEVICE_ID_KEY, volatileDeviceId);
  return volatileDeviceId;
}

function reserveDesktopMesLocalSequence() {
  const stored = Number(readStorage(MES_WEB_LOCAL_SEQUENCE_KEY));
  const current = Number.isSafeInteger(stored) && stored >= 0
    ? Math.max(stored, volatileSequence)
    : volatileSequence;
  const next = current + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error('MES desktop local sequence exceeded the safe integer range.');
  }

  volatileSequence = next;
  writeStorage(MES_WEB_LOCAL_SEQUENCE_KEY, String(next));
  return next;
}

async function reserveSequenceWithBrowserLock() {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) {
    return locks.request(MES_WEB_SEQUENCE_LOCK, () => reserveDesktopMesLocalSequence());
  }

  const previous = sequenceReservation ?? Promise.resolve(0);
  const reservation = previous
    .catch(() => 0)
    .then(() => reserveDesktopMesLocalSequence());
  sequenceReservation = reservation;
  try {
    return await reservation;
  } finally {
    if (sequenceReservation === reservation) sequenceReservation = null;
  }
}

function readLocalSequence(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('MES localSequence must be a non-negative safe integer.');
  }
  return parsed;
}

export async function prepareDesktopMesCommandRequest(
  postData: Record<string, unknown>,
): Promise<DesktopMesCommandRequest> {
  const suppliedCommandId = readString(postData.commandId ?? postData.command_id);
  const requestId = suppliedCommandId || createStableId('mes-web-command');
  const suppliedDeviceId = readString(postData.deviceId ?? postData.device_id);
  const suppliedSequence = readLocalSequence(
    postData.localSequence ?? postData.local_sequence,
  );

  if (Boolean(suppliedDeviceId) !== (suppliedSequence !== null)) {
    throw new Error('MES deviceId and localSequence must be supplied together.');
  }

  const deviceId = suppliedDeviceId || getDesktopMesDeviceId();
  const localSequence = suppliedSequence ?? await reserveSequenceWithBrowserLock();

  return {
    requestId,
    postData: {
      ...postData,
      commandId: requestId,
      deviceId,
      localSequence,
    },
  };
}

export function isTransientDesktopMesCommandError(error: unknown) {
  const status = Number((error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  })?.status
    ?? (error as { statusCode?: unknown })?.statusCode
    ?? (error as { response?: { status?: unknown } })?.response?.status
    ?? 0);
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

  return status === 408
    || status === 425
    || status === 429
    || status >= 500
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('econnreset')
    || message.includes('etimedout')
    || message.includes('socket hang up')
    || message.includes('operation was aborted')
    || message.includes('aborterror');
}

export async function invokeDesktopMesCommand<T>(
  invoke: () => Promise<T>,
  retryDelayMs = 150,
) {
  try {
    return await invoke();
  } catch (error) {
    if (!isTransientDesktopMesCommandError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return invoke();
  }
}
