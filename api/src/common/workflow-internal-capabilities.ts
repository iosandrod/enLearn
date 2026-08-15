import { ForbiddenException } from '@nestjs/common';
import type { ServiceContext } from './interfaces/service-executor';

export const WORKFLOW_INTERNAL_PRINCIPAL = 'trigger-workflow' as const;

export const WORKFLOW_INTERNAL_CAPABILITIES = [
  'planning.getPlanningConsoleOptions',
  'planning.listInventoryBuffers'
] as const;

export type WorkflowInternalCapability =
  (typeof WORKFLOW_INTERNAL_CAPABILITIES)[number];

const workflowInternalCapabilitySet = new Set<string>(
  WORKFLOW_INTERNAL_CAPABILITIES
);

export function assertWorkflowInternalServiceRequest(
  serviceName: string,
  serviceMethod: string,
  postData: Record<string, unknown>
): WorkflowInternalCapability {
  const capability = `${serviceName}.${serviceMethod}`;
  if (!workflowInternalCapabilitySet.has(capability)) {
    throw new ForbiddenException(
      `Workflow internal service capability is not allowed: ${capability}.`
    );
  }

  switch (capability as WorkflowInternalCapability) {
    case 'planning.getPlanningConsoleOptions':
      assertOnlyKeys(postData, ['optionType', 'option_type']);
      assertOneOf(
        postData.optionType ?? postData.option_type,
        ['scenario', 'item', 'resource', 'operation'],
        'optionType'
      );
      break;
    case 'planning.listInventoryBuffers':
      assertOnlyKeys(postData, [
        'itemId',
        'item_id',
        'locationId',
        'location_id',
        'limit'
      ]);
      assertOptionalString(postData.itemId ?? postData.item_id, 'itemId');
      assertOptionalString(postData.locationId ?? postData.location_id, 'locationId');
      assertOptionalInteger(postData.limit, 'limit', 1, 100);
      break;
  }

  return capability as WorkflowInternalCapability;
}

export function assertWorkflowInternalCapability(
  context: ServiceContext,
  capability: WorkflowInternalCapability
) {
  if (
    context.internal?.principal !== WORKFLOW_INTERNAL_PRINCIPAL ||
    context.internal.capability !== capability
  ) {
    throw new ForbiddenException(
      `Workflow internal capability is required: ${capability}.`
    );
  }
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
) {
  const allowed = new Set(allowedKeys);
  const invalid = Object.keys(value).find((key) => !allowed.has(key));
  if (invalid) {
    throw new ForbiddenException(
      `Workflow internal capability does not accept field: ${invalid}.`
    );
  }
}

function assertOneOf(
  value: unknown,
  allowed: readonly string[],
  field: string
) {
  if (typeof value !== 'string' || !allowed.includes(value.trim())) {
    throw new ForbiddenException(
      `${field} must be one of: ${allowed.join(', ')}.`
    );
  }
}

function assertOptionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ForbiddenException(`${field} must be a non-empty string.`);
  }
}

function assertOptionalInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
) {
  if (value === undefined || value === null || value === '') return;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ForbiddenException(
      `${field} must be an integer from ${minimum} to ${maximum}.`
    );
  }
}
