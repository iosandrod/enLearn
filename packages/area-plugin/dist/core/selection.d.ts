import type { CellAreaInput, CellAreaRange, CellAreaSelectionInfo, ExtendCellAreaOptions } from '../types';
export declare function getCellAreaSelectionInfo($table: any, area?: CellAreaRange | null): CellAreaSelectionInfo | null;
export declare function getCellAreaRows($table: any, area?: CellAreaRange | null): any[];
export declare function getCellAreaColumns($table: any, area?: CellAreaRange | null): any[];
export declare function getCellAreaSelections($table: any): CellAreaSelectionInfo[];
export declare function setCellAreas($table: any, areas: CellAreaInput[], options?: ExtendCellAreaOptions): CellAreaRange[];
export declare function addCellArea($table: any, area: CellAreaInput, options?: ExtendCellAreaOptions): CellAreaRange | null;
export declare function removeCellArea($table: any, index: number): CellAreaRange | null;
interface RenderAreaOptions {
    keepVisibleOnMiss?: boolean;
}
export declare function repaintActiveCellArea($table: any, options?: RenderAreaOptions): boolean;
export declare function bindCellAreaScrollRepaint($table: any): void;
export declare function unbindCellAreaScrollRepaint($table: any): void;
export declare function handleCellAreaMousedown($table: any, options: ExtendCellAreaOptions, evnt: MouseEvent, params: any): void;
export {};
//# sourceMappingURL=selection.d.ts.map