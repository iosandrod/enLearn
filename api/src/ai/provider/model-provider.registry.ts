import { Inject, Injectable } from '@nestjs/common';
import { getEnv } from '../../common/utils/env';
import type { AiProvider } from './ai-provider';
import { MockAiProvider } from './mock.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class ModelProviderRegistry {
  constructor(
    @Inject(MockAiProvider) private readonly mock: MockAiProvider,
    @Inject(OpenAiCompatibleProvider) private readonly openAi: OpenAiCompatibleProvider
  ) {}

  getActive(): AiProvider {
    const provider = String(getEnv().AI_PROVIDER ?? 'mock').trim().toLowerCase();
    if (provider === 'mock') return this.mock;
    if (provider === 'openai' || provider === 'openai-compatible') return this.openAi;
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }
}

