import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { OpenAiCompatibleProvider, openAiCompatibleProviderInternals } from './openai-compatible.provider';

const {
  normalizeBaseUrl,
  providerErrorText,
  providerFailureMessage,
  requiredSetting,
  readArguments
} = openAiCompatibleProviderInternals;

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
assert.equal(
  providerErrorText('{"error":{"message":"invalid sk-secret-value"}}'),
  'invalid sk-[redacted]'
);
assert.equal(requiredSetting({ AI_MODEL: 'qwen-plus' }, 'AI_MODEL'), 'qwen-plus');
assert.throws(
  () => requiredSetting({}, 'AI_API_KEY'),
  (error: unknown) => error instanceof ServiceUnavailableException &&
    /缺少 AI_API_KEY/.test(error.message)
);
assert.equal(
  providerFailureMessage(new Error('connect ECONNREFUSED Bearer secret-token')),
  '无法连接 AI 服务：connect ECONNREFUSED Bearer [redacted]'
);

async function testMissingConfiguration() {
  const previous = process.env.AI_API_KEY;
  process.env.AI_API_KEY = '';
  try {
    await assert.rejects(
      new OpenAiCompatibleProvider().complete({
        mode: 'ask',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        signal: new AbortController().signal,
        onDelta() {}
      }),
      (error: unknown) => error instanceof ServiceUnavailableException &&
        /缺少 AI_API_KEY/.test(error.message)
    );
  } finally {
    if (typeof previous === 'undefined') delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = previous;
  }
}

void testMissingConfiguration().then(() => {
  console.log('OpenAI-compatible provider validation tests passed');
});
