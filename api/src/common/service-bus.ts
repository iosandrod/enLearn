import type { ServiceContext } from './interfaces/service-executor';

export const DOMAIN_SERVICE_CLIENT = 'DOMAIN_SERVICE_CLIENT';
export const SERVICE_EXECUTE_PATTERN = 'service.execute';

export type ServiceBusRequest = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
  context: ServiceContext;
};

export type ServiceBusResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};
