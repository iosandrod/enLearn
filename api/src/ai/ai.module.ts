import { DynamicModule, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiAccessService } from './ai-access.service';
import { AiContextService } from './ai-context.service';
import { AiController } from './ai.controller';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiRepository } from './ai.repository';
import { AiRunRegistryService } from './ai-run-registry.service';
import {
  AI_SERVICE_ROUTER,
  LazyAiServiceRouter,
  resolveAiRouterType
} from './ai-service-router';
import { ModelProviderRegistry } from './provider/model-provider.registry';
import { MockAiProvider } from './provider/mock.provider';
import { OpenAiCompatibleProvider } from './provider/openai-compatible.provider';
import { PageProposalService } from './proposals/page-proposal.service';
import { PageProposalValidator } from './proposals/page-proposal.validator';
import { AiToolRegistry } from './tools/ai-tool.registry';

@Module({})
export class AiModule {
  static forGateway(mode: 'gateway' | 'standalone'): DynamicModule {
    return {
      module: AiModule,
      controllers: [AiController],
      providers: [
        AiAccessService,
        AiContextService,
        AiOrchestratorService,
        AiRepository,
        AiRunRegistryService,
        AiToolRegistry,
        PageProposalService,
        PageProposalValidator,
        MockAiProvider,
        OpenAiCompatibleProvider,
        ModelProviderRegistry,
        {
          provide: AI_SERVICE_ROUTER,
          inject: [ModuleRef],
          useFactory: (moduleRef: ModuleRef) =>
            new LazyAiServiceRouter(moduleRef, resolveAiRouterType(mode))
        }
      ]
    };
  }
}

