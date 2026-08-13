import { createHash } from 'node:crypto';
import type { AiProposal } from '../ai.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSort(value[key])]));
}

export function proposalContentHash(proposal: Pick<AiProposal,
  'accountId' | 'createdBy' | 'kind' | 'targetPageId' | 'baseVersion' |
  'baseSchemaHash' | 'baseSchema' | 'operations' | 'candidateSchema' | 'validationIssues'>) {
  return createHash('sha256').update(JSON.stringify(stableSort({
    accountId: proposal.accountId,
    createdBy: proposal.createdBy,
    kind: proposal.kind,
    targetPageId: proposal.targetPageId ?? null,
    baseVersion: proposal.baseVersion ?? null,
    baseSchemaHash: proposal.baseSchemaHash ?? null,
    baseSchema: proposal.baseSchema ?? null,
    operations: proposal.operations,
    candidateSchema: proposal.candidateSchema,
    validationIssues: proposal.validationIssues
  }))).digest('hex');
}
