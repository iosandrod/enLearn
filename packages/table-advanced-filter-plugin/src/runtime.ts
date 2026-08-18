import { normalizePluginOptions, type ResolvedAdvancedFilterOptions } from './options.js'
import type { AdvancedFilterPluginOptions } from './types.js'

const tableOptions = new WeakMap<object, ResolvedAdvancedFilterOptions>()

export function bindAdvancedFilterRuntime(
  $table: object,
  options: AdvancedFilterPluginOptions
) {
  tableOptions.set($table, normalizePluginOptions(options))
}

export function configureAdvancedFilterRuntime(
  $table: object,
  options: AdvancedFilterPluginOptions = {}
) {
  const current = tableOptions.get($table) ?? normalizePluginOptions()
  tableOptions.set($table, normalizePluginOptions({
    ...current,
    ...options,
    text: {
      ...current.text,
      ...options.text,
      operators: {
        ...current.text.operators,
        ...options.text?.operators
      }
    }
  }))
}

export function getAdvancedFilterRuntime(
  $table: object,
  fallback: AdvancedFilterPluginOptions = {}
) {
  return tableOptions.get($table) ?? normalizePluginOptions(fallback)
}

export function unbindAdvancedFilterRuntime($table: object) {
  tableOptions.delete($table)
}
