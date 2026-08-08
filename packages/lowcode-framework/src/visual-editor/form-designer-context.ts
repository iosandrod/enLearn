import type { InjectionKey, Ref } from 'vue';
import type { LowCodeOption } from '../types/lowcode';

export const formDesignerPageDataKey: InjectionKey<Readonly<Ref<unknown>>> = Symbol(
  'formDesignerPageData',
);

export const formDesignerTableFieldOptionsKey: InjectionKey<
  Readonly<Ref<LowCodeOption[]>>
> = Symbol('formDesignerTableFieldOptions');
