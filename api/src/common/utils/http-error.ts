import { HttpException } from '@nestjs/common';

export function readHttpErrorStatus(error: unknown) {
  if (error instanceof HttpException) return error.getStatus();
  if (typeof error !== 'object' || error === null) return undefined;

  const statusCode = 'statusCode' in error ? error.statusCode : undefined;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600
    ? statusCode
    : undefined;
}
