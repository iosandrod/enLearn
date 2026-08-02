import type { ExtendCellAreaOptions } from '../types';
export declare function canInsertCellAreaRows($table: any): boolean;
export declare function canRemoveCellAreaRows($table: any): boolean;
export declare function canInsertCellAreaColumns($table: any): boolean;
export declare function canRemoveCellAreaColumns($table: any): boolean;
export declare function insertCellAreaRows($table: any, options?: ExtendCellAreaOptions, evnt?: Event): Promise<any>;
export declare function removeCellAreaRows($table: any, evnt?: Event): Promise<any>;
export declare function insertCellAreaColumns($table: any, options?: ExtendCellAreaOptions, evnt?: Event): Promise<boolean> | Promise<{
    columns: Record<string, any>[];
    columnIndex: any;
}>;
export declare function removeCellAreaColumns($table: any, evnt?: Event): Promise<boolean> | Promise<{
    columns: any;
    columnIndex: any;
}>;
//# sourceMappingURL=structure.d.ts.map