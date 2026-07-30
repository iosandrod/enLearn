import { getWorkflowEnv } from '../common/env';

export type TriggerEngineStatus = {
  configured: boolean;
  apiUrl: string | null;
  projectRef: string | null;
  secretKeyConfigured: boolean;
  missing: string[];
};

export function getTriggerEngineStatus(): TriggerEngineStatus {
  const env = getWorkflowEnv();
  const apiUrl = normalizedValue(env.TRIGGER_API_URL);
  const projectRef = normalizedValue(env.TRIGGER_PROJECT_REF);
  const secretKey = normalizedValue(env.TRIGGER_SECRET_KEY);
  const missing = [
    apiUrl ? undefined : 'TRIGGER_API_URL',
    projectRef ? undefined : 'TRIGGER_PROJECT_REF',
    secretKey ? undefined : 'TRIGGER_SECRET_KEY'
  ].filter((value): value is string => Boolean(value));

  return {
    configured: missing.length === 0,
    apiUrl,
    projectRef,
    secretKeyConfigured: Boolean(secretKey),
    missing
  };
}

export function assertTriggerEngineConfigured() {
  const status = getTriggerEngineStatus();
  if (status.configured) {
    return;
  }

  throw new Error(
    `Trigger.dev engine is not configured. Missing ${status.missing.join(
      ', '
    )}. Run "pnpm triggerdev:bootstrap" from the enLearn repo.`
  );
}

function normalizedValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
