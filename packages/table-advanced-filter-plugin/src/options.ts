import type {
  AdvancedFilterPluginOptions,
  AdvancedFilterText
} from './types.js'

export const defaultAdvancedFilterText: AdvancedFilterText = {
  sortAscending: '升序',
  sortDescending: '降序',
  clearSort: '清除排序',
  freezeColumn: '冻结列',
  cancelFreeze: '取消冻结',
  freezeLeft: '冻结到左侧',
  freezeRight: '冻结到右侧',
  clearFilter: '清除筛选',
  textFilter: '文本筛选',
  numberFilter: '数字筛选',
  dateFilter: '日期筛选',
  booleanFilter: '值筛选',
  searchPlaceholder: '搜索',
  selectAll: '全选/取消',
  emptyValue: '暂无',
  apply: '筛选',
  reset: '重置',
  cancel: '取消',
  confirm: '确定',
  customFilter: '自定义筛选',
  and: '与',
  or: '或',
  noMatchingValues: '无匹配项',
  limitedValues: '仅显示前 {0} 项',
  conditionRequired: '请填写完整的筛选条件',
  addCondition: '添加条件',
  removeCondition: '删除条件',
  booleanTrue: '是',
  booleanFalse: '否',
  operators: {
    eq: '等于',
    ne: '不等于',
    gt: '大于',
    gte: '大于或等于',
    lt: '小于',
    lte: '小于或等于',
    between: '介于',
    startsWith: '开头是',
    endsWith: '结尾是',
    contains: '包含',
    notContains: '不包含',
    isEmpty: '为空',
    isNotEmpty: '不为空'
  }
}

export function normalizePluginOptions(
  options: AdvancedFilterPluginOptions = {}
): Required<Omit<AdvancedFilterPluginOptions, 'text' | 'tableEnabledMethod'>> &
  Pick<AdvancedFilterPluginOptions, 'tableEnabledMethod'> & {
    text: AdvancedFilterText
  } {
  return {
    autoEnable: options.autoEnable === true,
    caseSensitive: options.caseSensitive === true,
    maxVisibleOptions: Math.max(20, Math.trunc(options.maxVisibleOptions ?? 500)),
    locale: options.locale?.trim() || 'zh-CN',
    emptyLabel: options.emptyLabel ?? options.text?.emptyValue ?? '暂无',
    tableEnabledMethod: options.tableEnabledMethod,
    text: {
      ...defaultAdvancedFilterText,
      ...options.text,
      operators: {
        ...defaultAdvancedFilterText.operators,
        ...options.text?.operators
      }
    }
  }
}

export type ResolvedAdvancedFilterOptions = ReturnType<typeof normalizePluginOptions>
