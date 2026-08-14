import type { VxeTableAdvancedFilterMethods } from './types.js'
import type {} from 'vxe-pc-ui/types/components/grid'
import type {} from 'vxe-pc-ui/types/components/table'

declare module 'vxe-pc-ui/types/components/table' {
  interface VxeTableMethods<D = any> extends VxeTableAdvancedFilterMethods {}
}

declare module 'vxe-pc-ui/types/components/grid' {
  interface VxeGridMethods<D = any> extends VxeTableAdvancedFilterMethods {}
}
