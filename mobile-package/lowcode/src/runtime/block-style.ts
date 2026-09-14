import type { CSSProperties } from 'vue';

const spacingProperties = new Set([
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gap', 'minHeight', 'maxHeight', 'height',
]);

const safeProperties = new Set([
  ...spacingProperties,
  'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'opacity',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStyleValue(property: string, value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return spacingProperties.has(property) ? `${value}px` : value;
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.includes('url(') || normalized.includes('expression(')) {
    return undefined;
  }
  return normalized;
}

export function resolveMobileBlockStyle(value: unknown): CSSProperties {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([property, rawValue]) => {
      if (!safeProperties.has(property)) return [];
      const normalized = normalizeStyleValue(property, rawValue);
      return normalized === undefined ? [] : [[property, normalized]];
    }),
  ) as CSSProperties;
}
