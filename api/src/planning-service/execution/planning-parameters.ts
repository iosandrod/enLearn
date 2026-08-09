import type {
  PlanningDataSnapshot,
  PlanningSolverParameters
} from './planning-execution.types';

const DEFAULT_CONSTRAINTS = 4 + 16 + 32;

export function resolvePlanningParameters(
  snapshot: PlanningDataSnapshot,
  overrides: Record<string, unknown> = {},
  now = new Date()
): PlanningSolverParameters {
  const stored = new Map(
    snapshot.rows.planning_parameter.map((row) => [String(row.name ?? ''), row.value])
  );
  const read = (name: string, fallback: unknown) =>
    overrides[name] ?? overrides[toCamelCase(name)] ?? stored.get(name) ?? fallback;

  return {
    constraints: integer(read('constraints', DEFAULT_CONSTRAINTS), 'constraints', 0),
    planType: integer(read('plantype', 1), 'plantype', 0),
    logLevel: integer(read('plan.loglevel', 0), 'plan.loglevel', 0),
    lazyDelay: integer(read('lazydelay', 86_400), 'lazydelay', 0),
    minimumDelay: integer(read('plan.minimumdelay', 3_600), 'plan.minimumdelay', 0),
    rotateResources: booleanValue(read('plan.rotateResources', true), 'plan.rotateResources'),
    iterationMax: integer(read('plan.iterationmax', 0), 'plan.iterationmax', 0),
    resourceIterationMax: integer(
      read('plan.resourceiterationmax', 500),
      'plan.resourceiterationmax',
      0
    ),
    administrativeLeadtime: daysToSeconds(
      finiteNumber(read('plan.administrativeLeadtime', 0), 'plan.administrativeLeadtime')
    ),
    autoFence: daysToSeconds(
      finiteNumber(read('plan.autoFenceOperations', 0), 'plan.autoFenceOperations')
    ),
    algorithm: nonEmptyString(read('plan.solver', 'heuristic'), 'plan.solver').toLowerCase(),
    currentDate: currentDate(read('currentdate', 'now'), now),
    individualPoolResources: booleanValue(
      read('plan.individualPoolResources', false),
      'plan.individualPoolResources'
    ),
    moveApprovedEarly: integer(
      read('plan.move_approved_early', 0),
      'plan.move_approved_early',
      0
    )
  };
}

function integer(value: unknown, name: string, minimum: number) {
  const parsed = finiteNumber(value, name);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
}

function finiteNumber(value: unknown, name: string) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function booleanValue(value: unknown, name: string) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  throw new Error(`${name} must be a boolean value.`);
}

function nonEmptyString(value: unknown, name: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${name} must be a non-empty string.`);
}

function currentDate(value: unknown, now: Date) {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'now') {
    return now.toISOString();
  }
  const date = new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) throw new Error('currentdate must be now or a valid date-time.');
  return date.toISOString();
}

function daysToSeconds(days: number) {
  return days * 86_400;
}

function toCamelCase(value: string) {
  return value.replace(/[._]([a-z])/g, (_, character: string) => character.toUpperCase());
}
