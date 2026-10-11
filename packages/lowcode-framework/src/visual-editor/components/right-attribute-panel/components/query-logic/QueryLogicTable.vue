<template>
  <div class="query-logic-editor">
    <p>按表单字段配置查询条件。空值自动跳过；混合 AND/OR 按从上到下依次结合。</p>
    <p v-if="!rows.length" role="status">请先在表单中添加字段。</p>
    <div v-else class="query-logic-scroll">
      <table aria-label="查询逻辑">
        <thead><tr><th>字段</th><th>查询字段</th><th>与上一条</th><th>运算符</th><th>启用</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.inputField">
            <td><strong>{{ row.label }}</strong><small>{{ row.inputField }}</small></td>
            <td><input :aria-label="`${row.inputField} 查询字段`" :value="row.field"
              @input="update(index, 'field', ($event.target as HTMLInputElement).value)" /></td>
            <td><select :aria-label="`${row.inputField} 结合逻辑`" :value="row.logic" :disabled="index === 0"
              @change="update(index, 'logic', ($event.target as HTMLSelectElement).value)">
              <option value="and">AND（且）</option><option value="or">OR（或）</option>
            </select></td>
            <td><select :aria-label="`${row.inputField} 运算符`" :value="row.op"
              @change="update(index, 'op', ($event.target as HTMLSelectElement).value)">
              <option v-for="option in operatorOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select></td>
            <td><input type="checkbox" :aria-label="`${row.inputField} 启用`" :checked="row.enabled"
              @change="update(index, 'enabled', ($event.target as HTMLInputElement).checked)" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="rows.length">IN/NOT IN、区间条件使用数组值；为空/不为空条件无需输入值。查询字段默认与表单字段相同。</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LowCodeSearchQueryRule } from '../../../../../types/lowcode';
import { normalizeLowCodeSearchQueryLogic } from '../../../../../lowcode/search-query-logic';

const props = defineProps<{
  fields: Array<{ field: string; label?: string }>;
  modelValue: LowCodeSearchQueryRule[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: LowCodeSearchQueryRule[]] }>();
const operatorOptions = [
  { value: 'eq', label: '相等 (=)' }, { value: 'ne', label: '不相等 (≠)' },
  { value: 'like', label: '包含 (LIKE)' }, { value: 'ilike', label: '包含（忽略大小写）' },
  { value: 'notLike', label: '不包含 (NOT LIKE)' }, { value: 'notIlike', label: '不包含（忽略大小写）' },
  { value: 'gt', label: '大于 (>)' }, { value: 'gte', label: '大于等于 (≥)' },
  { value: 'lt', label: '小于 (<)' }, { value: 'lte', label: '小于等于 (≤)' },
  { value: 'in', label: '属于 (IN)' }, { value: 'notIn', label: '不属于 (NOT IN)' },
  { value: 'between', label: '区间 (BETWEEN)' },
  { value: 'startsWith', label: '开头匹配' }, { value: 'endsWith', label: '结尾匹配' },
  { value: 'isNull', label: '为空 (IS NULL)' }, { value: 'isNotNull', label: '不为空 (IS NOT NULL)' },
  { value: 'contains', label: '数组包含 (CONTAINS)' }, { value: 'containedBy', label: '数组被包含' },
  { value: 'overlaps', label: '数组重叠 (OVERLAPS)' },
];
const rows = computed(() => {
  const rules = new Map(normalizeLowCodeSearchQueryLogic(props.modelValue).map((rule) => [rule.inputField, rule]));
  const fields = new Map(props.fields.filter((field) => field.field).map((field) => [field.field, field]));
  return [...fields.values()].map((field) => ({
    inputField: field.field, field: field.field, logic: 'and', op: 'eq', enabled: true,
    ...rules.get(field.field), label: field.label || field.field,
  }));
});
function update(index: number, key: string, value: unknown) {
  const rules = rows.value.map(({ label: _label, ...row }, rowIndex) =>
    rowIndex === index ? { ...row, [key]: value } : row,
  );
  emit('update:modelValue', normalizeLowCodeSearchQueryLogic(rules));
}
</script>

<style scoped>
.query-logic-editor { width: 100%; min-width: 0; }
p { margin: 0 0 12px; color: #64748b; font-size: 12px; line-height: 1.6; }
.query-logic-scroll { overflow: auto; margin-bottom: 12px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { border: 1px solid #e2e8f0; padding: 6px; text-align: left; }
th { background: #f8fafc; white-space: nowrap; }
strong, small { display: block; }
small { color: #64748b; }
input:not([type=checkbox]), select { width: 116px; height: 30px; padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 4px; background: white; }
input[type=checkbox] { accent-color: #409eff; }
</style>
