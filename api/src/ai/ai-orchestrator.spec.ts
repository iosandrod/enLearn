import assert from 'node:assert/strict';
import { AiContextService } from './ai-context.service';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiRepository } from './ai.repository';
import { AiRunRegistryService } from './ai-run-registry.service';
import type {
  AiPrincipal,
  AiProviderRequest,
  AiProviderTurn,
  AiStartRunInput
} from './ai.types';
import type { AiProvider } from './provider/ai-provider';
import { ModelProviderRegistry } from './provider/model-provider.registry';
import { AiToolRegistry } from './tools/ai-tool.registry';

const principal: AiPrincipal = {
  context: {
    accountId: 'account-1',
    userId: 'user-1',
    accountRole: 'owner'
  },
  permissionCodes: ['ai.assistant.use', 'ai.page.propose', 'lowcode.pages.manage'],
  isLegacyAdmin: false
};

const input: AiStartRunInput = {
  requestId: 'request-1',
  mode: 'edit_page',
  message: 'Update the page title.',
  pageRef: { id: 'page-1', version: 1 }
};

type RepositoryDouble = {
  finishedStatuses: string[];
  ensureConversation: (options: { conversationId?: string }) => Promise<Record<string, unknown>>;
  createRun: () => Promise<void>;
  appendMessage: () => Promise<void>;
  listMessages: () => Promise<[]>;
  recordToolCall: () => Promise<void>;
  finishRun: (options: { status: string }) => Promise<void>;
};

function createRepositoryDouble(): RepositoryDouble {
  const repository: RepositoryDouble = {
    finishedStatuses: [],
    async ensureConversation(options) {
      return { id: options.conversationId ?? 'conversation-1' };
    },
    async createRun() {},
    async appendMessage() {},
    async listMessages() { return []; },
    async recordToolCall() {},
    async finishRun(options) { repository.finishedStatuses.push(options.status); }
  };
  return repository;
}

function createOrchestrator(options: {
  provider: AiProvider;
  executeTool: (name: string) => Promise<unknown>;
  repository: RepositoryDouble;
}) {
  const runs = new AiRunRegistryService();
  const contexts = {
    async assemble() { return { page: { id: 'page-1' } }; }
  } as unknown as AiContextService;
  const providers = {
    getActive() { return options.provider; }
  } as unknown as ModelProviderRegistry;
  const tools = {
    definitions() { return []; },
    execute(name: string) { return options.executeTool(name); }
  } as unknown as AiToolRegistry;
  const orchestrator = new AiOrchestratorService(
    contexts,
    options.repository as unknown as AiRepository,
    runs,
    providers,
    tools
  );
  return { orchestrator, runs };
}

async function testPersistedToolRowsAreNotReplayedToProvider() {
  let providerMessages: AiProviderRequest['messages'] = [];
  const provider: AiProvider = {
    id: 'history-test',
    async complete(request) {
      providerMessages = request.messages;
      return { content: 'Done', toolCalls: [] };
    }
  };
  const repository = createRepositoryDouble();
  repository.listMessages = async () => ([
    {
      id: 'user-message',
      conversationId: 'conversation-1',
      accountId: 'account-1',
      role: 'user',
      content: 'Question',
      createdAt: new Date().toISOString()
    },
    {
      id: 'orphan-tool-message',
      conversationId: 'conversation-1',
      accountId: 'account-1',
      role: 'tool',
      content: '{"result":"old"}',
      toolCallId: 'old-tool-call',
      createdAt: new Date().toISOString()
    }
  ]) as never;
  const { orchestrator } = createOrchestrator({
    provider,
    repository,
    async executeTool() { throw new Error('No tool should execute.'); }
  });

  const run = await orchestrator.start(principal, { ...input, requestId: 'request-history' });
  await run.completion;
  assert.equal(providerMessages.some((message) => message.role === 'tool'), false);
}

async function testOneProposalPerRun() {
  let executedTools = 0;
  const provider: AiProvider = {
    id: 'multi-proposal-test',
    async complete(): Promise<AiProviderTurn> {
      return {
        content: '',
        toolCalls: [
          { id: 'tool-1', name: 'proposal.first', arguments: {} },
          { id: 'tool-2', name: 'proposal.second', arguments: {} }
        ]
      };
    }
  };
  const repository = createRepositoryDouble();
  const { orchestrator } = createOrchestrator({
    provider,
    repository,
    async executeTool(name) {
      executedTools += 1;
      return {
        proposal: {
          id: `${name}-id`,
          status: 'awaiting_approval',
          validationIssues: []
        }
      };
    }
  });

  const run = await orchestrator.start(principal, input);
  await run.completion;

  assert.equal(executedTools, 1, 'a run must stop after its first proposal');
  assert.equal(run.events.filter((event) => event.type === 'proposal.created').length, 1);
  assert.equal(run.status, 'completed');
}

async function testSlowProviderCancellation() {
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let observedAbort = false;
  const provider: AiProvider = {
    id: 'slow-provider-test',
    complete(request: AiProviderRequest): Promise<AiProviderTurn> {
      markStarted();
      return new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => {
          observedAbort = true;
          reject(request.signal.reason);
        }, { once: true });
      });
    }
  };
  const repository = createRepositoryDouble();
  const { orchestrator, runs } = createOrchestrator({
    provider,
    repository,
    async executeTool() { throw new Error('No tool should execute.'); }
  });

  const run = await orchestrator.start(principal, { ...input, requestId: 'request-cancel' });
  await started;
  runs.cancel(run.id);
  await run.completion;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(observedAbort, true, 'cancelling a run must abort the provider request');
  assert.equal(run.status, 'cancelled');
  assert.equal(run.events.filter((event) => event.type === 'done').length, 1);
  assert.deepEqual(
    repository.finishedStatuses,
    [],
    'the authenticated cancel endpoint persists cancellation before aborting the provider'
  );
}

async function main() {
  await testOneProposalPerRun();
  await testSlowProviderCancellation();
  await testPersistedToolRowsAreNotReplayedToProvider();
  console.log('AI orchestrator proposal and cancellation tests passed');
}

void main();
