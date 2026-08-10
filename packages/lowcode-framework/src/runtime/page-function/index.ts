import type { LowCodePageType } from '../../types/lowcode';
import { BUILTIN_LOW_CODE_EDIT_PAGE_FUNCTIONS } from './edit-page-function.ts';
import { BUILTIN_LOW_CODE_LIST_PAGE_FUNCTIONS } from './list-page-function.ts';
import type { BuiltinLowCodePageFunction } from './shared.ts';

export * from './shared.ts';
export * from './list-page-function.ts';
export * from './edit-page-function.ts';

/** 所有页面类型的系统内置函数，由各页面类型模块统一聚合。 */
export const BUILTIN_LOW_CODE_PAGE_FUNCTIONS: readonly BuiltinLowCodePageFunction[] = [
  ...BUILTIN_LOW_CODE_LIST_PAGE_FUNCTIONS,
  ...BUILTIN_LOW_CODE_EDIT_PAGE_FUNCTIONS,
];

/** 返回指定页面类型可以执行的全部系统内置函数。 */
export function getBuiltinLowCodePageFunctions(pageType: LowCodePageType | undefined) {
  return BUILTIN_LOW_CODE_PAGE_FUNCTIONS.filter((pageFunction) =>
    pageFunction.pageType === pageType,
  );
}

/** 按页面类型和函数名解析一个可执行的系统内置函数。 */
export function resolveBuiltinLowCodePageFunction(
  pageType: LowCodePageType | undefined,
  name: string,
) {
  return getBuiltinLowCodePageFunctions(pageType).find(
    (pageFunction) => pageFunction.name === name,
  );
}

/** 判断当前页面类型是否注册了系统内置函数。 */
export function hasBuiltinLowCodePageFunctions(pageType: LowCodePageType | undefined) {
  return getBuiltinLowCodePageFunctions(pageType).length > 0;
}
