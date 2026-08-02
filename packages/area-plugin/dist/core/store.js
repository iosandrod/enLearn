const tableStoreMap = new WeakMap();
export function createStore() {
    return {
        cellAreas: [],
        activeArea: null,
        copyArea: null,
        extendArea: null,
        isSelecting: false,
        isExtending: false
    };
}
export function getStore($table) {
    let store = tableStoreMap.get($table);
    if (!store) {
        store = createStore();
        tableStoreMap.set($table, store);
    }
    return store;
}
export function clearStore($table) {
    const store = getStore($table);
    store.cellAreas = [];
    store.activeArea = null;
    store.copyArea = null;
    store.extendArea = null;
    store.isSelecting = false;
    store.isExtending = false;
}
//# sourceMappingURL=store.js.map