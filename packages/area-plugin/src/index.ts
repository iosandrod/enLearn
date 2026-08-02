import { registerExtendCellAreaHook } from './hook'
import type { ExtendCellAreaOptions, VxeUILike } from './types'

export * from './types'

export function install (VxeUI: VxeUILike, options?: ExtendCellAreaOptions) {
  registerExtendCellAreaHook(VxeUI, options)
}

export const ExtendCellArea = {
  install
}

export default ExtendCellArea
