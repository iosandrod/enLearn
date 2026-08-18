import { isRecord } from './lowcode.schema';

export function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function asRows(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function normalizeGeneratedStatus(value: unknown): 'draft' | 'published' | 'archived' {
  return value === 'draft' || value === 'archived' ? value : 'published';
}
