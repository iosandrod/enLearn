import { registerTableSearchPanelHook } from './hook.js'
import './augmentations.js'
import type { TableSearchPanelOptions, VxeUILike } from './types.js'

export * from './types.js'

const installedVxeUIs = new WeakSet<object>()

function normalizeOptions(
  options?: TableSearchPanelOptions | TableSearchPanelOptions[]
): TableSearchPanelOptions {
  if (Array.isArray(options)) return options[0] ?? {}
  return options ?? {}
}

export function install(
  VxeUI: VxeUILike,
  options?: TableSearchPanelOptions | TableSearchPanelOptions[]
) {
  if (installedVxeUIs.has(VxeUI as object)) return
  registerTableSearchPanelHook(VxeUI, normalizeOptions(options))
  installedVxeUIs.add(VxeUI as object)
}

export const TableSearchPanel = { install }

export default TableSearchPanel
