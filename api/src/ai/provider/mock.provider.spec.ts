import assert from 'node:assert/strict';
import type { AiProviderRequest } from '../ai.types';
import { MockAiProvider } from './mock.provider';

async function completeButtonPrompt(message: string) {
  const provider = new MockAiProvider();
  const request: AiProviderRequest = {
    mode: 'generate_button',
    messages: [{ role: 'user', content: message }],
    tools: [],
    signal: new AbortController().signal,
    onDelta() {}
  };
  const result = await provider.complete(request);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.name, 'proposal.create_button');
  return result.toolCalls[0]!.arguments;
}

async function main() {
  const customLabel = await completeButtonPrompt(
    '添加一个测试按钮，功能是编辑当前行，跳转到编辑页面'
  );
  assert.equal(customLabel.builtinKey, 'record.edit');
  assert.equal(customLabel.code, 'custom-record-edit');
  assert.equal(customLabel.label, '测试');
  assert.equal(customLabel.summary, '新增“测试”按钮');

  const builtinLabel = await completeButtonPrompt('添加刷新按钮');
  assert.equal(builtinLabel.builtinKey, 'page.refresh');
  assert.equal(builtinLabel.code, undefined);
  assert.equal(builtinLabel.label, '刷新');

  const namedLabel = await completeButtonPrompt('添加一个名为“快速编辑”的按钮，用于编辑当前行');
  assert.equal(namedLabel.builtinKey, 'record.edit');
  assert.equal(namedLabel.label, '快速编辑');

  console.log('Mock AI provider button intent tests passed');
}

void main();
