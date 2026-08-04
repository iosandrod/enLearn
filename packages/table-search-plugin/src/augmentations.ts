import type { OpenTableSearchPanelOptions } from './types.js'
import type {} from 'vxe-pc-ui/types/components/grid'
import type {} from 'vxe-pc-ui/types/components/table'

export interface VxeTableSearchPanelMethods {
  openTableSearchPanel(options?: OpenTableSearchPanelOptions): Promise<void>
  closeTableSearchPanel(): Promise<void>
  toggleTableSearchPanel(force?: boolean): Promise<void>
  isTableSearchPanelVisible(): boolean
}

declare module 'vxe-pc-ui/types/components/table' {
  interface VxeTableMethods<D = any> extends VxeTableSearchPanelMethods {}
}

declare module 'vxe-pc-ui/types/components/grid' {
  interface VxeGridMethods<D = any> extends VxeTableSearchPanelMethods {}
}
