import { inject, provide, type InjectionKey } from 'vue';

export type VisualEditorPersistence = {
  saveProject?: () => Promise<void> | void;
};

const visualEditorPersistenceKey: InjectionKey<VisualEditorPersistence> = Symbol(
  'visualEditorPersistence'
);

export function provideVisualEditorPersistence(persistence: VisualEditorPersistence) {
  provide(visualEditorPersistenceKey, persistence);
}

export function useVisualEditorPersistence() {
  return inject(visualEditorPersistenceKey, {});
}
