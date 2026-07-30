export type WorkflowApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function ok<T>(data: T): WorkflowApiResponse<T> {
  return {
    success: true,
    data
  };
}
