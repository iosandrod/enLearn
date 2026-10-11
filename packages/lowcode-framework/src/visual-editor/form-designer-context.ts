import type { InjectionKey, Ref } from 'vue';
import type { LowCodeOption, LowCodeSearchQueryRule } from '../types/lowcode';
import type { VisualEditorPage } from './visual-editor.utils';

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

export const formDesignerQueryLogicKey: InjectionKey<{
  getFields: (page: VisualEditorPage) => Array<{ field: string; label: string }>;
}> = Symbol('formDesignerQueryLogic');
