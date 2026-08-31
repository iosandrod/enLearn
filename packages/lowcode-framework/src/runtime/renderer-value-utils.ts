export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function cloneRuntimeValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

export function cloneRuntimeValueWithFunctions<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneRuntimeValueWithFunctions(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneRuntimeValueWithFunctions(item)]),
    ) as T;
  }
  return value;
}

export function readPath(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, source);
}

export function appendRouteQuery(route: string, query: Record<string, unknown>) {
  const entries = Object.entries(query).filter(
    ([, value]) => typeof value !== 'undefined' && value !== null && value !== '',
  );
  if (!entries.length) return route;

  const [withoutHash, hash = ''] = route.split('#');
  const separator = withoutHash.includes('?') ? '&' : '?';
  const queryString = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return `${withoutHash}${separator}${queryString}${hash ? `#${hash}` : ''}`;
}
