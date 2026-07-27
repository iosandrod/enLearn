import type { TriggerNodeType, TriggerWorkflowKind } from './types';

export type TriggerNodeDefinition = {
  type: TriggerNodeType;
  label: string;
  category: 'trigger' | 'control' | 'human' | 'task' | 'data' | 'ai' | 'terminal';
  description: string;
  icon: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  allowedKinds: TriggerWorkflowKind[];
  minOutgoing?: number;
  maxOutgoing?: number;
  allowIncoming: boolean;
  allowOutgoing: boolean;
};

export const triggerNodeDefinitions: TriggerNodeDefinition[] = [
  defineNode('start', 'Start', 'trigger', 'Entry point for a manually triggered run.', '▶', '#16a34a', ['approval', 'dataSync', 'aiAgent', 'custom'], false, true, 1, 1),
  defineNode('schedule', 'Schedule', 'trigger', 'Trigger.dev cron or scheduled task entry.', 'CRON', '#0f766e', ['dataSync', 'aiAgent', 'custom'], false, true, 1, 1),
  defineNode('webhook', 'Webhook', 'trigger', 'HTTP event entry for external systems.', 'HTTP', '#2563eb', ['approval', 'dataSync', 'aiAgent', 'custom'], false, true, 1, 1),
  defineNode('manualApproval', 'Approval', 'human', 'Human approval step using triggerAndWait semantics.', 'OK', '#7c3aed', ['approval', 'custom'], true, true, 1, 1),
  defineNode('condition', 'Condition', 'control', 'Route by payload, output, or expression.', 'IF', '#d97706', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 2),
  defineNode('parallel', 'Parallel', 'control', 'Fan out multiple task branches.', '||', '#dc2626', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 2),
  defineNode('task', 'Task', 'task', 'Trigger.dev task execution.', 'TASK', '#4f46e5', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('triggerAndWait', 'Trigger & Wait', 'task', 'Call another task and wait for completion.', 'WAIT', '#0891b2', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('batchTrigger', 'Batch', 'task', 'Fan out batchTriggerAndWait style work.', 'BATCH', '#be123c', ['dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('wait', 'Wait', 'control', 'Wait for duration, date, or token.', '⏱', '#db2777', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('dataSource', 'Source', 'data', 'Read from a database, API, file, or SaaS connector.', 'SRC', '#0284c7', ['dataSync', 'custom'], true, true, 1, 1),
  defineNode('transform', 'Transform', 'data', 'Map, clean, enrich, or filter records.', 'MAP', '#65a30d', ['dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('dataSink', 'Sink', 'data', 'Write results to a destination connector.', 'DST', '#c2410c', ['dataSync', 'custom'], true, true, 1, 1),
  defineNode('agent', 'Agent', 'ai', 'AI agent reasoning loop task.', 'AI', '#9333ea', ['aiAgent', 'custom'], true, true, 1, 1),
  defineNode('tool', 'Tool', 'ai', 'Callable agent tool backed by a Trigger.dev task.', 'TOOL', '#2563eb', ['aiAgent', 'custom'], true, true, 1, 1),
  defineNode('memory', 'Memory', 'ai', 'Read or write agent memory/context.', 'MEM', '#0d9488', ['aiAgent', 'custom'], true, true, 1, 1),
  defineNode('humanReview', 'Review', 'human', 'Human review for AI outputs or risky actions.', 'REV', '#a21caf', ['aiAgent', 'approval', 'custom'], true, true, 1, 1),
  defineNode('end', 'End', 'terminal', 'Terminal completion node.', 'END', '#475569', ['approval', 'dataSync', 'aiAgent', 'custom'], true, false, 0, 0)
];

export const triggerNodeDefinitionMap = new Map(triggerNodeDefinitions.map((definition) => [definition.type, definition]));

export function getTriggerNodeDefinition(type: TriggerNodeType) {
  return triggerNodeDefinitionMap.get(type);
}

export function isBuiltInTriggerNodeType(type: TriggerNodeType) {
  return triggerNodeDefinitionMap.has(type);
}

export function getTriggerNodeDefinitionsForKind(kind: TriggerWorkflowKind) {
  return triggerNodeDefinitions.filter((definition) => definition.allowedKinds.includes(kind) && definition.type !== 'start' && definition.type !== 'end');
}

function defineNode(
  type: TriggerNodeType,
  label: string,
  category: TriggerNodeDefinition['category'],
  description: string,
  icon: string,
  accent: string,
  allowedKinds: TriggerWorkflowKind[],
  allowIncoming: boolean,
  allowOutgoing: boolean,
  minOutgoing?: number,
  maxOutgoing?: number
): TriggerNodeDefinition {
  return {
    type,
    label,
    category,
    description,
    icon,
    accent,
    accentSoft: tint(accent, 0.92),
    accentBorder: tint(accent, 0.72),
    allowedKinds,
    allowIncoming,
    allowOutgoing,
    ...(minOutgoing !== undefined ? { minOutgoing } : {}),
    ...(maxOutgoing !== undefined ? { maxOutgoing } : {})
  };
}

function tint(hex: string, amount: number) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  const red = value >> 16;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(red)}, ${mix(green)}, ${mix(blue)})`;
}

