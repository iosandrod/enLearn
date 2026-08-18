import type { LowCodePageRuntimeContext } from '../page-runtime.ts';
import type { LowCodeButtonDisabledFunction } from './types.ts';

function isScanMode(context: LowCodePageRuntimeContext) {
  return context.state.status.formMode === 'scan';
}

function isAddMode(context: LowCodePageRuntimeContext) {
  return context.state.status.formMode === 'add';
}

export const editButtonDisabledFunctions = {
  modify(context: LowCodePageRuntimeContext): boolean {
    return !isScanMode(context);
  },
  save(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  submit(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  saveAndClose(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  saveAndNew(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  create(context: LowCodePageRuntimeContext): boolean {
    // return isAddMode(context);
    return false;//
  },
  copy(context: LowCodePageRuntimeContext): boolean {
    return isAddMode(context);
  },
  addDetail(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  addLine(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  addRow(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  deleteDetail(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  deleteLine(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  deleteRow(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  removeDetail(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  removeLine(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  removeRow(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  moveDetail(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  moveLine(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  moveRow(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  copyDetail(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  copyLine(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  copyRow(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  detailAdd(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  lineAdd(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  rowAdd(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  detailDelete(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  lineDelete(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  rowDelete(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  detailRemove(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  lineRemove(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  rowRemove(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  detailMove(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  lineMove(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  rowMove(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  detailCopy(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  lineCopy(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
  rowCopy(context: LowCodePageRuntimeContext): boolean {
    return isScanMode(context);
  },
} satisfies Record<string, LowCodeButtonDisabledFunction>;
