import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AiAccessService } from './ai-access.service';
import { AiController } from './ai.controller';
import { AiModule } from './ai.module';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiRepository } from './ai.repository';
import { AiRunRegistryService } from './ai-run-registry.service';
import { PageProposalService } from './proposals/page-proposal.service';

async function main() {
  const application = await NestFactory.createApplicationContext(
    AiModule.forGateway('standalone'),
    { logger: false }
  );

  try {
    const controller = application.get(AiController) as unknown as {
      access?: AiAccessService;
      orchestrator?: AiOrchestratorService;
      runs?: AiRunRegistryService;
      repository?: AiRepository;
      proposals?: PageProposalService;
    };

    assert.ok(controller.access instanceof AiAccessService);
    assert.ok(controller.orchestrator instanceof AiOrchestratorService);
    assert.ok(controller.runs instanceof AiRunRegistryService);
    assert.ok(controller.repository instanceof AiRepository);
    assert.ok(controller.proposals instanceof PageProposalService);

    const run = controller.runs!.createOrGet({
      requestId: randomUUID(),
      accountId: randomUUID(),
      userId: randomUUID(),
      sessionId: randomUUID()
    }).run;
    let persistedStatus = '';
    const access = controller.access as unknown as { authenticate: (...args: unknown[]) => Promise<unknown> };
    const repository = controller.repository as unknown as {
      finishRun: (options: { status: string }) => Promise<void>;
    };
    const originalAuthenticate = access.authenticate;
    const originalFinishRun = repository.finishRun;
    access.authenticate = async () => ({
      context: { accountId: run.accountId, userId: run.userId, accountRole: 'owner' },
      permissionCodes: ['ai.assistant.use'],
      isLegacyAdmin: false
    });
    repository.finishRun = async (options) => { persistedStatus = options.status; };
    try {
      const result = await (controller as unknown as {
        cancelRun: (runId: string, authorization?: string, accountId?: string) => Promise<{ status: string }>;
      }).cancelRun(run.id, 'Bearer test', run.accountId);
      assert.equal(result.status, 'cancelled');
      assert.equal(persistedStatus, 'cancelled');
    } finally {
      access.authenticate = originalAuthenticate;
      repository.finishRun = originalFinishRun;
    }
  } finally {
    await application.close();
  }

  console.log('AI module runtime injection tests passed');
}

void main();
