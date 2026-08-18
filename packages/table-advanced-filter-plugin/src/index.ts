import { registerAdvancedFilterHook } from './hook.js'
import { registerAdvancedFilterRenderer } from './renderer.js'
import './augmentations.js'
import type { AdvancedFilterPluginOptions, VxeUILike } from './types.js'

export * from './types.js'
export * from './filter-engine.js'
export * from './column-adapter.js'

const installedVxeUIs = new WeakSet<object>()

function normalizeInstallOptions(
  options?: AdvancedFilterPluginOptions | AdvancedFilterPluginOptions[]
) {
  if (Array.isArray(options)) return options[0] ?? {}
  return options ?? {}
}

export function install(
  VxeUI: VxeUILike,
  options?: AdvancedFilterPluginOptions | AdvancedFilterPluginOptions[]
) {
  if (installedVxeUIs.has(VxeUI as object)) return
  const normalized = normalizeInstallOptions(options)
  registerAdvancedFilterRenderer(VxeUI, normalized)
  registerAdvancedFilterHook(VxeUI, normalized)
  installedVxeUIs.add(VxeUI as object)
}

export const AdvancedFilterPlugin = { install }

export default AdvancedFilterPlugin
