import { createHash } from 'node:crypto';
import type {
  PlanningDataSnapshot,
  PlanningRow
} from './planning-execution.types';

export type PlanningSnapshotNormalization = {
  addedBuffers: PlanningRow[];
  snapshot: PlanningDataSnapshot;
};

export function normalizePlanningSnapshotForEngine(
  snapshot: PlanningDataSnapshot
): PlanningSnapshotNormalization {
  const operations = new Map(snapshot.rows.planning_operation.map((row) => [row.id, row]));
  const itemTypes = new Map(snapshot.rows.planning_item.map((row) => [
    row.id,
    stringValue(row.type) ?? 'make to stock'
  ]));
  const existing = new Set(snapshot.rows.planning_buffer.map((row) =>
    bufferKey(row.item_id, row.location_id, row.batch, itemTypes)
  ));
  const addedBuffers: PlanningRow[] = [];

  for (const flow of snapshot.rows.planning_operationmaterial) {
    if ((finiteValue(flow.quantity) ?? 0) >= 0) continue;
    const itemId = stringValue(flow.item_id);
    const operation = operations.get(stringValue(flow.operation_id) ?? '');
    const locationId = stringValue(flow.location_id) ?? stringValue(operation?.location_id);
    if (!itemId || !locationId) continue;
    const key = bufferKey(itemId, locationId, undefined, itemTypes);
    if (existing.has(key)) continue;
    existing.add(key);
    addedBuffers.push({
      account_id: snapshot.accountId,
      batch: null,
      category: 'engine compatibility',
      id: deterministicUuid(`${snapshot.accountId}:planning-buffer:${key}`),
      item_id: itemId,
      location_id: locationId,
      maximum: 0,
      minimum: 0,
      onhand: 0,
      source: 'engine-compatibility',
      subcategory: 'operation input buffer',
      type: 'default',
      updated_at: snapshot.loadedAt
    });
  }

  if (!addedBuffers.length) return { addedBuffers, snapshot };
  const rows = {
    ...snapshot.rows,
    planning_buffer: [...snapshot.rows.planning_buffer, ...addedBuffers]
  };
  const counts = {
    ...snapshot.counts,
    planning_buffer: rows.planning_buffer.length
  };
  return {
    addedBuffers,
    snapshot: {
      ...snapshot,
      counts,
      hash: createHash('sha256').update(stableStringify(rows)).digest('hex'),
      rows
    }
  };
}

function bufferKey(
  itemIdValue: unknown,
  locationIdValue: unknown,
  batchValue: unknown,
  itemTypes: Map<unknown, string>
) {
  const itemId = stringValue(itemIdValue);
  const locationId = stringValue(locationIdValue);
  if (!itemId || !locationId) return '';
  const batch = itemTypes.get(itemId) === 'make to order' ? stringValue(batchValue) ?? '' : '';
  return `${itemId}\u0000${batch}\u0000${locationId}`;
}

function deterministicUuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex');
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join('-');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
