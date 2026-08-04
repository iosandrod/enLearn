import { strict as assert } from 'node:assert';
import { NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';

async function main() {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const service = new AuthService();
    await assert.rejects(
      () => service.impersonateDevUser(
        {
          userId: '389388b0-d188-4a7a-adfb-9a3dc1d9c0b0',
          accountId: '00000000-0000-4000-8000-000000000001'
        },
        {}
      ),
      (error: unknown) => error instanceof NotFoundException
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }

  console.log('auth development impersonation guard tests passed');
}

void main();
