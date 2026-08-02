import type { ExtendCellAreaStore } from '../types'

const tableStoreMap = new WeakMap<object, ExtendCellAreaStore>()

export function createStore (): ExtendCellAreaStore {
  return {
    cellAreas: [],
    activeArea: null,
    copyArea: null,
    extendArea: null,
    isSelecting: false,
    isExtending: false
  }
}

export function getStore ($table: object): ExtendCellAreaStore {
  let store = tableStoreMap.get($table)
  if (!store) {
    store = createStore()
    tableStoreMap.set($table, store)
  }
  return store
}

export function clearStore ($table: object) {
  const store = getStore($table)
  store.cellAreas = []
  store.activeArea = null
  store.copyArea = null
  store.extendArea = null
  store.isSelecting = false
  store.isExtending = false
}
