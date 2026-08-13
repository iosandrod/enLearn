import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AiProviderMessage,
  AiProviderRequest,
  AiProviderToolCall,
  AiProviderTurn
} from '../ai.types';
import type { AiProvider } from './ai-provider';

function readUserMessage(messages: AiProviderMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
}

function readLastTool(messages: AiProviderMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'tool');
}

function toolCall(name: string, args: Record<string, unknown>): AiProviderTurn {
  return {
    content: '',
    toolCalls: [{ id: `mock-${randomUUID()}`, name, arguments: args }]
  };
}

function parseToolPayload(message?: AiProviderMessage) {
  if (!message?.content) return undefined;
  try {
    return JSON.parse(message.content) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || fallback;
}

function inferBuiltin(message: string) {
  if (/保存|save/i.test(message)) return { key: 'record.save', label: '保存' };
  if (/新增|创建|create/i.test(message)) return { key: 'record.create', label: '新增' };
  if (/编辑|修改|edit|modify/i.test(message)) return { key: 'record.edit', label: '编辑' };
  if (/打印|print/i.test(message)) return { key: 'print.page', label: '打印' };
  if (/退出|返回|exit|back/i.test(message)) return { key: 'page.exit', label: '退出' };
  if (/审核|approve/i.test(message)) return { key: 'record.approve', label: '审核' };
  return { key: 'page.refresh', label: '刷新' };
}

function inferButtonLabel(message: string, fallback: string) {
  const named = message.match(
    /(?:名为|叫做|名称(?:是|为)|名字(?:是|为))\s*[“"'「『]?([^“”"'「」『』，,。；;！？!?\r\n]{1,30}?)[”"'」』]?\s*(?:的)?按钮/u
  );
  const direct = message.match(
    /(?:添加|新增|创建|增加)\s*(?:一个|个)?\s*[“"'「『]?([^“”"'「」『』，,。；;！？!?\r\n]{1,30}?)[”"'」』]?\s*按钮/u
  );
  const label = (named?.[1] ?? direct?.[1] ?? '')
    .trim()
    .replace(/^(?:名为|叫做)\s*/, '')
    .replace(/\s*(?:的)?$/, '');
  return label && !['一', '一个', '个'].includes(label) ? label : fallback;
}

function inferButtonCode(label: string, builtin: { key: string; label: string }) {
  if (label === builtin.label) return undefined;
  const slug = slugify(label, 'custom');
  return `${slug}-${builtin.key.replace(/[^a-z0-9]+/gi, '-')}`.slice(0, 80);
}

function writeDelta(request: AiProviderRequest, content: string) {
  for (const chunk of content.match(/.{1,12}/gs) ?? []) request.onDelta(chunk);
}

@Injectable()
export class MockAiProvider implements AiProvider {
  readonly id = 'mock';

  async complete(request: AiProviderRequest): Promise<AiProviderTurn> {
    if (request.signal.aborted) throw request.signal.reason;
    const lastTool = readLastTool(request.messages);
    const lastToolPayload = parseToolPayload(lastTool);
    const userMessage = readUserMessage(request.messages);

    if (isRecord(lastToolPayload) && lastToolPayload.proposal) {
      const content = '方案已经生成并通过安全校验。请先查看差异，确认后再应用；我不会自动修改页面。';
      writeDelta(request, content);
      return { content, toolCalls: [], usage: { totalTokens: 96 } };
    }

    if (request.mode === 'ask') {
      if (!lastTool) return toolCall('current_page.describe', {});
      const content = '我已结合当前页面的结构、字段、数据源和按钮进行分析。当前上下文只包含页面元数据，不包含业务记录值。你可以继续让我解释字段、数据源或页面行为。';
      writeDelta(request, content);
      return { content, toolCalls: [], usage: { totalTokens: 112 } };
    }

    if (request.mode === 'create_page') {
      if (!lastTool) return toolCall('lowcode.list_table_options', {});
      if (lastTool.name === 'lowcode.list_table_options') {
        const rows = Array.isArray(lastToolPayload) ? lastToolPayload : [];
        const selected = rows.find((row) => {
          if (!isRecord(row)) return false;
          return [row.value, row.tableName, row.label, row.title]
            .some((value) => typeof value === 'string' && userMessage.toLowerCase().includes(value.toLowerCase()));
        }) ?? rows[0];
        const table = isRecord(selected)
          ? String(selected.value ?? selected.tableName ?? '')
          : '';
        if (!table) {
          const content = '当前没有可用于生成页面的数据库表，或你没有表元数据权限。';
          writeDelta(request, content);
          return { content, toolCalls: [] };
        }
        const base = slugify(table.split('.').at(-1) ?? table, 'generated-page');
        return toolCall('proposal.create_page', {
          tableName: table,
          code: `${base}-ai`,
          route: `/dashboard/${base}-ai`,
          title: isRecord(selected) ? String(selected.title ?? selected.label ?? base) : base,
          description: `根据“${userMessage.slice(0, 120)}”生成的页面草案。`
        });
      }
    }

    if (request.mode === 'generate_button') {
      const builtin = inferBuiltin(userMessage);
      const label = inferButtonLabel(userMessage, builtin.label);
      const code = inferButtonCode(label, builtin);
      return toolCall('proposal.create_button', {
        blockId: undefined,
        builtinKey: builtin.key,
        ...(code ? { code } : {}),
        label,
        summary: `新增“${label}”按钮`
      });
    }

    if (request.mode === 'generate_function') {
      const builtin = inferBuiltin(userMessage);
      const functionName = slugify(
        userMessage.match(/[A-Za-z_$][\w$]*/)?.[0] ?? builtin.key.replace('.', '_'),
        'aiGeneratedFunction'
      ).replace(/-/g, '_');
      return toolCall('proposal.create_page_function', {
        name: functionName,
        label: userMessage.slice(0, 40) || 'AI 页面函数',
        description: '由 AI 生成的受控页面函数。',
        builtinFunction: builtin.key === 'page.refresh' ? 'refresh' : builtin.key.split('.').at(-1)
      });
    }

    if (request.mode === 'edit_page') {
      return toolCall('proposal.patch_page', {
        summary: '更新当前页面说明',
        operations: [
          {
            type: 'updatePageInfo',
            description: `AI 修改建议：${userMessage.slice(0, 180)}`
          }
        ]
      });
    }

    const content = '我没有生成可应用的变更。请补充目标页面或具体需求。';
    writeDelta(request, content);
    return { content, toolCalls: [] };
  }
}
