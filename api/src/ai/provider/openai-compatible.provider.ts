import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getEnv } from '../../common/utils/env';
import type {
  AiProviderRequest,
  AiProviderToolCall,
  AiProviderTurn
} from '../ai.types';
import type { AiProvider } from './ai-provider';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArguments(value: string) {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    throw new BadGatewayException('The model returned invalid tool arguments.');
  }
}

function providerErrorText(value: string) {
  if (!value.trim()) return '';
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed)) {
      const error = isRecord(parsed.error) ? parsed.error : parsed;
      const message = typeof error.message === 'string' ? error.message.trim() : '';
      if (message) return redactErrorText(message);
    }
  } catch {
    // Provider bodies can be plain text.
  }
  return redactErrorText(value);
}

function redactErrorText(value: string) {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._-]+/g, 'sk-[redacted]')
    .slice(0, 500);
}

function requiredSetting(env: Record<string, unknown>, name: string, fallbackName?: string) {
  const value = String(env[name] ?? (fallbackName ? env[fallbackName] : '') ?? '').trim();
  if (value) return value;
  throw new ServiceUnavailableException(`AI 服务未配置：缺少 ${name}。`);
}

function providerFailureMessage(error: unknown) {
  const detail = error instanceof Error && error.message
    ? redactErrorText(error.message)
    : '未知网络错误。';
  return `无法连接 AI 服务：${detail}`;
}

function normalizeBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceUnavailableException('AI_BASE_URL must be a valid absolute URL.');
  }
  if (url.username || url.password) {
    throw new ServiceUnavailableException('AI_BASE_URL must not include embedded credentials.');
  }
  const allowInsecure = String(getEnv().AI_ALLOW_INSECURE_BASE_URL ?? '').trim() === '1';
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecure && isLoopback)) {
    throw new ServiceUnavailableException(
      'AI_BASE_URL must use HTTPS; HTTP is allowed only for an explicitly enabled loopback provider.'
    );
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  const trimmed = url.toString().replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

@Injectable()
export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'openai-compatible';

  async complete(request: AiProviderRequest): Promise<AiProviderTurn> {
    const env = getEnv();
    const apiKey = requiredSetting(env, 'AI_API_KEY', 'OPENAI_API_KEY');
    const baseUrl = normalizeBaseUrl(
      requiredSetting(env, 'AI_BASE_URL', 'OPENAI_BASE_URL')
    );
    const model = requiredSetting(env, 'AI_MODEL', 'OPENAI_MODEL');
    const tools = request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.name ? { name: message.name } : {}),
            ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
            ...(message.toolCalls?.length
              ? {
                  tool_calls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.arguments) }
                  }))
                }
              : {})
          })),
          ...(tools.length ? { tools, tool_choice: 'auto' } : {})
        }),
        signal: request.signal
      });
    } catch (error) {
      if (request.signal.aborted) throw request.signal.reason ?? error;
      throw new ServiceUnavailableException(providerFailureMessage(error));
    }

    if (!response.ok || !response.body) {
      const errorText = providerErrorText(await response.text().catch(() => ''));
      throw new BadGatewayException(
        `AI 服务请求失败（HTTP ${response.status}）${errorText ? `：${errorText}` : '。'}`
      );
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    const toolParts = new Map<number, { id: string; name: string; arguments: string }>();
    let content = '';
    let buffer = '';
    let usage: AiProviderTurn['usage'];

    const consumeData = (data: string) => {
      if (!data || data === '[DONE]') return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(data) as Record<string, unknown>;
      } catch {
        throw new BadGatewayException('AI provider returned an invalid stream frame.');
      }
      if (isRecord(parsed.usage)) {
        usage = {
          promptTokens: Number(parsed.usage.prompt_tokens) || undefined,
          completionTokens: Number(parsed.usage.completion_tokens) || undefined,
          totalTokens: Number(parsed.usage.total_tokens) || undefined
        };
      }
      const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
      for (const choice of choices) {
        if (!isRecord(choice) || !isRecord(choice.delta)) continue;
        const delta = choice.delta;
        if (typeof delta.content === 'string' && delta.content) {
          content += delta.content;
          request.onDelta(delta.content);
        }
        const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
        for (const rawCall of toolCalls) {
          if (!isRecord(rawCall)) continue;
          const index = Number(rawCall.index) || 0;
          const current = toolParts.get(index) ?? { id: '', name: '', arguments: '' };
          const fn = isRecord(rawCall.function) ? rawCall.function : {};
          if (typeof rawCall.id === 'string') current.id = rawCall.id;
          if (typeof fn.name === 'string') current.name = fn.name;
          if (typeof fn.arguments === 'string') current.arguments += fn.arguments;
          toolParts.set(index, current);
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('data:')) consumeData(line.slice(5).trim());
        }
      }
      if (done) break;
    }
    for (const line of buffer.split(/\r?\n/)) {
      if (line.startsWith('data:')) consumeData(line.slice(5).trim());
    }

    const toolCalls: AiProviderToolCall[] = [...toolParts.values()].map((call) => {
      if (!call.name.trim()) throw new BadGatewayException('AI provider returned a tool call without a name.');
      return {
        id: call.id || `tool-${crypto.randomUUID()}`,
        name: call.name,
        arguments: readArguments(call.arguments || '{}')
      };
    });
    return { content, toolCalls, usage };
  }
}

export const openAiCompatibleProviderInternals = {
  normalizeBaseUrl,
  providerErrorText,
  providerFailureMessage,
  requiredSetting,
  readArguments
};
