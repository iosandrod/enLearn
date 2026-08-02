export interface ExtendCellAreaGuardParams {
    $table: any;
    row?: any;
    column: any;
    cell?: HTMLElement;
    $event?: Event;
}
export interface ExtendCellAreaSelectParams extends ExtendCellAreaGuardParams {
    type: 'body' | 'header';
}
export interface ExtendCellAreaExtendParams extends ExtendCellAreaGuardParams {
    area: CellAreaRange;
}
export interface ExtendCellAreaStructureParams {
    $table: any;
    area: CellAreaRange;
    selection: CellAreaSelectionInfo;
}
export interface ExtendCellAreaCreateRowParams extends ExtendCellAreaStructureParams {
    rowIndex: number;
    rowNumber: number;
    columns: any[];
}
export interface ExtendCellAreaCreateColumnParams extends ExtendCellAreaStructureParams {
    columnIndex: number;
    columnNumber: number;
    field: string;
    title: string;
    fixed: 'left' | 'right' | null;
    sourceColumn: any;
}
export interface ExtendCellAreaOptions {
    disabledMethod?: (params: ExtendCellAreaGuardParams) => boolean;
    beforeSelectMethod?: (params: ExtendCellAreaSelectParams) => boolean | void;
    beforeExtendMethod?: (params: ExtendCellAreaExtendParams) => boolean | void;
    createRowMethod?: (params: ExtendCellAreaCreateRowParams) => any;
    createColumnMethod?: (params: ExtendCellAreaCreateColumnParams) => any;
    fillMode?: 'copy' | 'series' | 'auto';
    allowMulti?: boolean;
    allowHeader?: boolean;
    allowBody?: boolean;
}
export interface CellAreaRange {
    type: 'body' | 'header';
    fixed: 'left' | 'right' | null;
    startRow: any | null;
    endRow: any | null;
    startColumn: any;
    endColumn: any;
    activeRow: any | null;
    activeColumn: any;
    rows: any[];
    columns: any[];
    startRowid: string | null;
    endRowid: string | null;
    activeRowid: string | null;
    startColumnId: string | null;
    endColumnId: string | null;
    activeColumnId: string | null;
    rowIds: string[];
    columnIds: string[];
    startRowIndex: number;
    endRowIndex: number;
    activeRowIndex: number;
    startColumnIndex: number;
    endColumnIndex: number;
    activeColumnIndex: number;
}
export interface CellAreaIndexRange {
    startIndex: number;
    endIndex: number;
}
export interface CellAreaSelectionInfo {
    area: CellAreaRange;
    rows: any[];
    columns: any[];
    rowIds: string[];
    columnIds: string[];
    rowRange: CellAreaIndexRange;
    columnRange: CellAreaIndexRange;
    startRow: any | null;
    endRow: any | null;
    startColumn: any;
    endColumn: any;
}
export interface CellAreaRangeInput {
    area?: CellAreaRange | null;
    type?: 'body' | 'header';
    fixed?: 'left' | 'right' | null;
    startRow?: any | null;
    endRow?: any | null;
    activeRow?: any | null;
    startColumn?: any;
    endColumn?: any;
    activeColumn?: any;
    rows?: any[];
    columns?: any[];
    startRowid?: string | number | null;
    endRowid?: string | number | null;
    activeRowid?: string | number | null;
    startColumnId?: string | number | null;
    endColumnId?: string | number | null;
    activeColumnId?: string | number | null;
    rowIds?: Array<string | number | null | undefined>;
    columnIds?: Array<string | number | null | undefined>;
    rowRange?: Partial<CellAreaIndexRange> | [number, number];
    columnRange?: Partial<CellAreaIndexRange> | [number, number];
    startRowIndex?: number;
    endRowIndex?: number;
    activeRowIndex?: number;
    startColumnIndex?: number;
    endColumnIndex?: number;
    activeColumnIndex?: number;
}
export type CellAreaInput = CellAreaRange | CellAreaSelectionInfo | CellAreaRangeInput;
export interface CellAreaMergeOption {
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
}
export interface CellAreaMergeResult {
    area: CellAreaRange;
    merge: CellAreaMergeOption;
    removedMerges: any[];
}
export interface ExtendCellAreaStore {
    cellAreas: CellAreaRange[];
    activeArea: CellAreaRange | null;
    copyArea: CellAreaRange | null;
    extendArea: CellAreaRange | null;
    isSelecting: boolean;
    isExtending: boolean;
}
export interface VxeUILike {
    hooks?: {
        add: (name: string, options: Record<string, any>) => void;
    };
    interceptor?: {
        add: (type: string, callback: (params: any) => any) => void;
    };
    contextMenu?: {
        open: (options: Record<string, any>) => void;
        close: () => void;
    };
}
//# sourceMappingURL=types.d.ts.map