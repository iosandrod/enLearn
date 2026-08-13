import type { AiProviderRequest, AiProviderTurn } from '../ai.types';

export interface AiProvider {
  readonly id: string;
  complete(request: AiProviderRequest): Promise<AiProviderTurn>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

