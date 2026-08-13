import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { openAiCompatibleProviderInternals } from './openai-compatible.provider';

const { normalizeBaseUrl, providerErrorText, readArguments } = openAiCompatibleProviderInternals;

assert.equal(normalizeBaseUrl('https://api.openai.com'), 'https://api.openai.com/v1');
assert.equal(normalizeBaseUrl('https://example.test/custom/v1/'), 'https://example.test/custom/v1');
assert.throws(
  () => normalizeBaseUrl('https://user:password@example.test'),
  (error: unknown) => error instanceof ServiceUnavailableException &&
    /embedded credentials/.test(error.message)
);
assert.throws(
  () => normalizeBaseUrl('http://example.test'),
  (error: unknown) => error instanceof ServiceUnavailableException && /must use HTTPS/.test(error.message)
);
assert.deepEqual(readArguments('{"page":"orders"}'), { page: 'orders' });
assert.throws(() => readArguments('{invalid'), /invalid tool arguments/);
assert.equal(
  providerErrorText('request rejected: Bearer secret-token'),
  'request rejected: Bearer [redacted]'
);

console.log('OpenAI-compatible provider validation tests passed');
