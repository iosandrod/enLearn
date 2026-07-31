import { inject, provide } from 'vue';
const visualEditorPersistenceKey = Symbol('visualEditorPersistence');
export function provideVisualEditorPersistence(persistence) {
    provide(visualEditorPersistenceKey, persistence);
}
export function useVisualEditorPersistence() {
    return inject(visualEditorPersistenceKey, {});
}
