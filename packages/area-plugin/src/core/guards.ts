import type { ExtendCellAreaGuardParams, ExtendCellAreaOptions } from '../types'

export function isColumnAreaDisabled (params: ExtendCellAreaGuardParams, options: ExtendCellAreaOptions): boolean {
  const { column } = params
  if (!column) {
    return true
  }
  if (column.params && column.params.extendCellAreaDisabled) {
    return true
  }
  if (options.disabledMethod && options.disabledMethod(params)) {
    return true
  }
  return false
}
