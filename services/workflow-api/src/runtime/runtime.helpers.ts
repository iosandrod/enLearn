import type { RuntimeActor, WorkflowTaskCandidateRecord, WorkflowTaskRecord } from './runtime.types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function inferVariableType(value: unknown) {
  if (value instanceof Date) return 'datetime';
  if (typeof value === 'string') return Number.isNaN(Date.parse(value)) ? 'string' : 'datetime';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'json';
}

export function canActorSeeTask(
  task: WorkflowTaskRecord,
  candidates: WorkflowTaskCandidateRecord[],
  actor: RuntimeActor
) {
  if (!actor.userId) return true;
  if (task.assigneeId === actor.userId) return true;

  return candidates.some(
    (candidate) => candidate.candidateType !== 'user' || candidate.candidateId === actor.userId
  );
}

export function canActorOperateTask(
  task: WorkflowTaskRecord,
  candidates: WorkflowTaskCandidateRecord[],
  actor: RuntimeActor,
  options: { allowUnassigned?: boolean } = {}
) {
  if (!actor.userId) return true;
  if (task.assigneeId) return task.assigneeId === actor.userId;

  if (options.allowUnassigned) {
    return candidates.some(
      (candidate) => candidate.candidateType !== 'user' || candidate.candidateId === actor.userId
    );
  }

  return candidates.some(
    (candidate) => candidate.candidateType === 'user' && candidate.candidateId === actor.userId
  );
}

export function toIso(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
