import { task, wait } from '@trigger.dev/sdk';

export const TRIGGER_WAITPOINT_DIAGNOSTIC_TASK_ID = 'trigger-waitpoint-diagnostic';

type WaitpointDiagnosticPayload = {
  tokenId: string;
  testId: string;
};

type WaitpointDiagnosticOutput = {
  testId: string;
  tokenId: string;
  data: Record<string, unknown>;
};

export const waitpointDiagnosticTask = task({
  id: TRIGGER_WAITPOINT_DIAGNOSTIC_TASK_ID,
  run: async (payload: WaitpointDiagnosticPayload): Promise<WaitpointDiagnosticOutput> => {
    const result = await wait.forToken<Record<string, unknown>>(payload.tokenId);
    if (!result.ok) throw result.error;

    return {
      testId: payload.testId,
      tokenId: payload.tokenId,
      data: result.output
    };
  }
});
