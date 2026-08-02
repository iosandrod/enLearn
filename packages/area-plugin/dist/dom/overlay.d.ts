import type { CellAreaRange } from '../types';
export interface CellAreaAnchorOffsetPosition {
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
}
export declare function hideCellAreaOverlays($table: any): void;
export declare function showCellArea($table: any, area: CellAreaRange, startCell: HTMLElement, endCell?: HTMLElement): boolean;
export declare function showInactiveCellArea($table: any, startCell: HTMLElement, endCell?: HTMLElement): boolean;
export declare function showCellAreaByAnchorOffset($table: any, area: CellAreaRange, anchorCell: HTMLElement, position: CellAreaAnchorOffsetPosition): boolean;
export declare function showInactiveCellAreaByAnchorOffset($table: any, anchorCell: HTMLElement, position: CellAreaAnchorOffsetPosition): boolean;
export declare function showSingleCellArea($table: any, area: CellAreaRange, cell: HTMLElement): void;
//# sourceMappingURL=overlay.d.ts.map