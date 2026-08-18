import type { InjectionKey, Ref } from 'vue';
import type { LowCodeOption } from '../types/lowcode';

export type FormDesignerMode = 'search' | 'edit';

export const formDesignerPageDataKey: InjectionKey<Readonly<Ref<unknown>>> = Symbol(
  'formDesignerPageData',
);

export const formDesignerTableFieldOptionsKey: InjectionKey<
  Readonly<Ref<LowCodeOption[]>>
> = Symbol('formDesignerTableFieldOptions');

export const formDesignerModeKey: InjectionKey<Readonly<Ref<FormDesignerMode>>> = Symbol(
  'formDesignerMode',
);
