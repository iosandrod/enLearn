export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertRecord(value: unknown, message: string): JsonRecord {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

export function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readRequiredString(value: unknown, name: string) {
  const result = readString(value);
  if (!result) throw new Error(`${name} is required.`);
  return result;
}

export function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (isRecord(current)) return current[segment];
    if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)];
    return undefined;
  }, value);
}

export function setPath(target: JsonRecord, path: string, value: unknown) {
  const segments = path.split('.').map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return;
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!isRecord(next)) current[segment] = {};
    current = current[segment] as JsonRecord;
  }
  current[segments.at(-1)!] = cloneJson(value);
}

export function interpolateValue(value: unknown, scope: JsonRecord): unknown {
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, scope));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateValue(item, scope)])
    );
  }
  if (typeof value !== 'string') return value;

  const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (exact) return cloneJson(getPath(scope, exact[1]));

  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => {
    const resolved = getPath(scope, path.trim());
    if (resolved === undefined || resolved === null) return '';
    return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  });
}

export function applyOutputMapping(
  output: unknown,
  mapping: Record<string, string> | undefined
) {
  if (!mapping) return output;
  return Object.fromEntries(
    Object.entries(mapping).map(([target, source]) => [target, getPath(output, source)])
  );
}

export function parseIsoDurationSeconds(duration: unknown) {
  const value = readString(duration);
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) throw new Error('Wait duration must use ISO-8601, for example PT10S.');
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}
