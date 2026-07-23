type ServiceGatewayResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  serviceName?: string;
  serviceMethod?: string;
};

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);
  const authorization = getHeader(event, 'authorization');
  const requestId = getHeader(event, 'x-request-id');
  const apiBaseUrl = String(config.apiBaseUrl || 'http://localhost:3002/api').replace(
    /\/+$/,
    ''
  );

  try {
    const response = await $fetch<ServiceGatewayResponse>(`${apiBaseUrl}/service`, {
      method: 'POST',
      body,
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        ...(requestId ? { 'x-request-id': requestId } : {})
      }
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
