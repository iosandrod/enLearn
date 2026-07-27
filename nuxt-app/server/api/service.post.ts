import { backendFetch } from '../utils/backend';

type ServiceGatewayResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  serviceName?: string;
  serviceMethod?: string;
};

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  try {
    const response = await backendFetch<ServiceGatewayResponse>(event, '/service', {
      method: 'POST',
      body
    });

    if (response.success === false) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Service gateway request failed'
      });
    }

    return response.data;
  } catch (error: unknown) {
    const fetchError = error as {
      status?: number;
      statusCode?: number;
      statusMessage?: string;
      data?: { message?: string; statusCode?: number; error?: string };
      message?: string;
    };
    const statusCode =
      fetchError.data?.statusCode ?? fetchError.statusCode ?? fetchError.status ?? 502;
    const statusMessage =
      fetchError.data?.message ??
      fetchError.statusMessage ??
      fetchError.message ??
      'Service gateway unavailable';

    throw createError({
      statusCode,
      statusMessage
    });
  }
});
