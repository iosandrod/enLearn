import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

export class PrintError extends BadRequestException {
  constructor(code: string, message: string) {
    super({ code, message });
  }
}

export function printBadRequest(code: string, message: string): never {
  throw new PrintError(code, message);
}

export function printNotFound(message = 'Print job was not found.'): never {
  throw new NotFoundException({ code: 'PRINT_JOB_NOT_FOUND', message });
}

export function printForbidden(message = 'You do not have access to this print job.'): never {
  throw new ForbiddenException({ code: 'PRINT_JOB_FORBIDDEN', message });
}
