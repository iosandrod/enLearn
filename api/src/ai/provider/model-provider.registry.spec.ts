import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider } from './ai-provider';
import { ModelProviderRegistry } from './model-provider.registry';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

const openAi = { id: 'openai-compatible' } as AiProvider;
const registry = new ModelProviderRegistry(openAi as OpenAiCompatibleProvider);
const originalProvider = process.env.AI_PROVIDER;

try {
  process.env.AI_PROVIDER = 'openai-compatible';
  assert.equal(registry.getActive(), openAi);

  process.env.AI_PROVIDER = '';
  assert.throws(
    () => registry.getActive(),
    (error: unknown) => error instanceof ServiceUnavailableException &&
      /AI provider is not configured/.test(error.message)
  );

  process.env.AI_PROVIDER = 'mock';
  assert.throws(
    () => registry.getActive(),
    (error: unknown) => error instanceof ServiceUnavailableException &&
      /Only openai-compatible is supported/.test(error.message)
  );
} finally {
  if (typeof originalProvider === 'undefined') delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
}

console.log('AI model provider registry tests passed');
