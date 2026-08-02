import type { CellAreaMergeOption, CellAreaMergeResult, CellAreaRange } from '../types';
export declare function createActiveCellAreaMergeOption($table: any, area?: CellAreaRange | null): CellAreaMergeOption | null;
export declare function canMergeActiveCellArea($table: any, area?: CellAreaRange | null): boolean;
export declare function getActiveCellAreaMergeCells($table: any, area?: CellAreaRange | null): any[];
export declare function mergeActiveCellArea($table: any, evnt?: Event): Promise<CellAreaMergeResult | false>;
export declare function splitActiveCellArea($table: any, evnt?: Event): Promise<any[]>;
//# sourceMappingURL=merge.d.ts.map