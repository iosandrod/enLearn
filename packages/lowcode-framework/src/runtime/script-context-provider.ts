import type { InjectionKey } from 'vue';
import type { LowCodeContextSource } from './lowcode-context';

export type LowCodeScriptContextProvider = {
  getSource(): LowCodeContextSource | undefined;
};

export const lowCodeScriptContextProviderKey: InjectionKey<LowCodeScriptContextProvider> =
  Symbol('lowCodeScriptContextProvider');
