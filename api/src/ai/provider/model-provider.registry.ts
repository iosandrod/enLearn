import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getEnv } from '../../common/utils/env';
import type { AiProvider } from './ai-provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class ModelProviderRegistry {
  constructor(
    @Inject(OpenAiCompatibleProvider) private readonly openAi: OpenAiCompatibleProvider
  ) {}

  getActive(): AiProvider {
    const provider = String(getEnv().AI_PROVIDER ?? '').trim().toLowerCase();
    if (!provider) {
      throw new ServiceUnavailableException(
        'AI provider is not configured. Set AI_PROVIDER=openai-compatible.'
      );
    }
    if (provider === 'openai' || provider === 'openai-compatible') return this.openAi;
    throw new ServiceUnavailableException(
      `Unsupported AI_PROVIDER: ${provider}. Only openai-compatible is supported.`
    );
  }
}
