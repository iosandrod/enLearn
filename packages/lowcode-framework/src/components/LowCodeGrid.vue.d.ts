import type {
  LowCodeGridRowAction,
  LowCodeGridSchema,
} from '../types/lowcode';

type GridRow = Record<string, unknown>;
type LowCodeGridProps = {
  schema: LowCodeGridSchema;
  rows: GridRow[];
  loading?: boolean;
  fill?: boolean;
};

declare function validate(): Promise<boolean>;
declare function clearValidation(): Promise<void>;
declare function setCurrentRow(row: GridRow | null): Promise<void>;

declare const __VLS_export: import('vue').DefineComponent<LowCodeGridProps, {
  validate: typeof validate;
  clearValidation: typeof clearValidation;
  setCurrentRow: typeof setCurrentRow;
}, {}, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {
  toolbar: (code: string) => any;
  edit: (row: GridRow) => any;
  delete: (row: GridRow) => any;
  rowAction: (payload: { action: LowCodeGridRowAction; row: GridRow }) => any;
  rowCurrentChange: (payload: { row: GridRow | null; rawEvent: GridRow }) => any;
  rowDblclick: (payload: { row: GridRow; rawEvent: GridRow }) => any;
  cellDblclick: (payload: { row: GridRow; rawEvent: GridRow }) => any;
  gridEvent: (payload: {
    key: string;
    row?: GridRow;
    actionCode?: string;
    rawEvent: GridRow;
  }) => any;
}, string, import('vue').PublicProps, Readonly<LowCodeGridProps> & Readonly<{
  onToolbar?: (code: string) => any;
  onEdit?: (row: GridRow) => any;
  onDelete?: (row: GridRow) => any;
  onRowAction?: (payload: { action: LowCodeGridRowAction; row: GridRow }) => any;
  onRowCurrentChange?: (payload: { row: GridRow | null; rawEvent: GridRow }) => any;
  onRowDblclick?: (payload: { row: GridRow; rawEvent: GridRow }) => any;
  onCellDblclick?: (payload: { row: GridRow; rawEvent: GridRow }) => any;
  onGridEvent?: (payload: {
    key: string;
    row?: GridRow;
    actionCode?: string;
    rawEvent: GridRow;
  }) => any;
}>, {}, {}, {}, {}, string, import('vue').ComponentProvideOptions, false, {}, any>;

declare const _default: typeof __VLS_export;
export default _default;
