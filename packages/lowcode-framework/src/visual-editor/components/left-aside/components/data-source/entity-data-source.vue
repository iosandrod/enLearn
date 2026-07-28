<template>
  <section class="entity-data-source">
    <div class="eds-toolbar">
      <vxe-button status="primary" @click="openEntityPicker">关联实体</vxe-button>
      <vxe-input v-model="keyword" placeholder="搜索实体 / 表名" clearable />
    </div>

    <div v-if="!entitySources.length" class="eds-empty">
      <div class="eds-empty__title">暂无实体数据源</div>
      <div class="eds-empty__desc">请从实体设计器中关联已有实体表</div>
      <vxe-button status="primary" @click="openEntityPicker">关联实体</vxe-button>
    </div>

    <div v-else class="eds-list">
      <button
        v-for="source in filteredSources"
        :key="source.key"
        class="eds-card"
        :class="{ 'is-active': selectedKey === source.key }"
        type="button"
        @click="selectSource(source.key)"
      >
        <span class="eds-card__main">
          <strong>{{ source.name }}</strong>
          <small>{{ source.tableName || source.entityCode || source.key }}</small>
        </span>
        <span class="eds-card__meta">
          {{ source.entitys?.length || 0 }} 字段 · {{ source.bindingCount || 0 }} 绑定
        </span>
      </button>
    </div>

    <div v-if="selectedSource" class="eds-detail">
      <div class="eds-detail__head">
        <div>
          <strong>{{ selectedSource.name }}</strong>
          <small>{{ selectedSource.tableName }}</small>
        </div>
        <div class="eds-detail__actions">
          <vxe-button size="mini" @click="applyToCurrentBlock">应用到组件</vxe-button>
          <vxe-button size="mini" @click="syncSelectedSource">同步字段</vxe-button>
        </div>
      </div>

      <div class="eds-info">
        <span>来源：Entity Designer</span>
        <span>状态：{{ selectedSource.syncStatus === 'changed' ? '已变更' : '正常' }}</span>
      </div>

      <div class="eds-fields">
        <div class="eds-field eds-field--header">
          <span>字段</span>
          <span>表格</span>
          <span>查询</span>
          <span>表单</span>
          <span>详情</span>
          <span>控件</span>
        </div>
        <div v-for="field in selectedSource.entitys" :key="field.key" class="eds-field">
          <span class="eds-field__name">
            <strong>{{ field.name || field.key }}</strong>
            <small>{{ field.key }} · {{ field.type }}</small>
          </span>
          <vxe-checkbox v-model="field.usage.tableColumn" @change="saveSelectedSource" />
          <vxe-checkbox v-model="field.usage.queryCondition" @change="saveSelectedSource" />
          <vxe-checkbox v-model="field.usage.formItem" @change="saveSelectedSource" />
          <vxe-checkbox v-model="field.usage.detailItem" @change="saveSelectedSource" />
          <vxe-select v-model="field.component.formControl" size="mini" @change="saveSelectedSource">
            <vxe-option v-for="item in controlOptions" :key="item.value" :label="item.label" :value="item.value" />
          </vxe-select>
        </div>
      </div>
    </div>

    <vxe-modal
      v-model="pickerVisible"
      title="关联实体表"
      width="min(720px, calc(100vw - 48px))"
      height="min(560px, calc(100vh - 80px))"
      show-footer
      resize
      transfer
    >
      <div class="eds-picker">
        <vxe-input v-model="pickerKeyword" placeholder="搜索实体名称 / 表名" clearable />
        <div v-if="pickerLoading" class="eds-picker__state">正在加载实体表...</div>
        <div v-else-if="!filteredTables.length" class="eds-picker__state">暂无可关联实体</div>
        <template v-else>
          <label
            v-for="table in filteredTables"
            :key="table.id"
            class="eds-picker-row"
            :class="{ 'is-linked': isLinked(table.id) }"
          >
            <input
              type="checkbox"
              :checked="pickedEntityIds.includes(table.id)"
              :disabled="isLinked(table.id)"
              @change="togglePickedEntity(table.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>
              <strong>{{ table.title || table.code }}</strong>
              <small>{{ table.full_name || table.table_name }} · {{ table.columns?.length || 0 }} 字段</small>
            </span>
            <em v-if="isLinked(table.id)">已关联</em>
          </label>
        </template>
      </div>
      <template #footer>
        <vxe-button @click="pickerVisible = false">取消</vxe-button>
        <vxe-button status="primary" @click="confirmLinkEntities">确认关联</vxe-button>
      </template>
    </vxe-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import { ElMessage } from '../../../common/designer-ui';
import { useVisualData } from '../../../../hooks/useVisualData';
import { useLowCodeHost } from '../../../../../core/host';

type EntityTable = Record<string, any>;
type EntitySource = Record<string, any>;

const { jsonData, currentBlock, incrementModel, updateModel } = useVisualData();
const host = useLowCodeHost();

const keyword = ref('');
const selectedKey = ref('');
const pickerVisible = ref(false);
const pickerLoading = ref(false);
const pickerKeyword = ref('');
const pickedEntityIds = ref<string[]>([]);
const entityTables = ref<EntityTable[]>([]);

const controlOptions = [
  { label: '输入框', value: 'input' },
  { label: '多行文本', value: 'textarea' },
  { label: '数字输入', value: 'number' },
  { label: '下拉框', value: 'select' },
  { label: '日期', value: 'date' },
  { label: '日期时间', value: 'datetime' },
  { label: '开关', value: 'switch' },
  { label: '上传', value: 'upload' },
];

const entitySources = computed<EntitySource[]>(() =>
  cloneDeep((jsonData.models || []).filter((item: any) => item.sourceType === 'entity')),
);

const filteredSources = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  if (!text) return entitySources.value;
  return entitySources.value.filter((source) =>
    [source.name, source.tableName, source.entityCode, source.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(text)),
  );
});

const selectedSource = computed<EntitySource | null>(() => {
  const key = selectedKey.value || filteredSources.value[0]?.key;
  return filteredSources.value.find((source) => source.key === key) || null;
});

const filteredTables = computed(() => {
  const text = pickerKeyword.value.trim().toLowerCase();
  if (!text) return entityTables.value;
  return entityTables.value.filter((table) =>
    [table.title, table.code, table.full_name, table.table_name, table.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(text)),
  );
});

function getServiceApi() {
  try {
    return host.getServiceApi();
  } catch {
    return null;
  }
}

function isLinked(entityId: string) {
  return entitySources.value.some((source) => source.entityId === entityId);
}

function togglePickedEntity(entityId: string, checked: boolean) {
  pickedEntityIds.value = checked
    ? Array.from(new Set([...pickedEntityIds.value, entityId]))
    : pickedEntityIds.value.filter((id) => id !== entityId);
}

function selectSource(key: string) {
  selectedKey.value = key;
}

async function loadEntityTables() {
  pickerLoading.value = true;
  try {
    const serviceApi = getServiceApi();
    const graph = await serviceApi?.invoke<any>('entityDesign', 'listDesign');
    entityTables.value = graph?.tables || [];
  } catch {
    ElMessage.warning('实体表加载失败，请确认实体设计器服务可用');
    entityTables.value = [];
  } finally {
    pickerLoading.value = false;
  }
}

function openEntityPicker() {
  pickedEntityIds.value = [];
  pickerKeyword.value = '';
  pickerVisible.value = true;
  void loadEntityTables();
}

function mapControl(column: any) {
  const name = String(column.column_name || '').toLowerCase();
  const type = String(column.data_type || '').toLowerCase();
  if (name.includes('status') || name.includes('type') || name.includes('category')) return 'select';
  if (type.includes('bool')) return 'switch';
  if (type.includes('date') && !type.includes('time')) return 'date';
  if (type.includes('time')) return 'datetime';
  if (type.includes('int') || type.includes('numeric') || type.includes('decimal')) return 'number';
  if (name.includes('remark') || name.includes('description') || type.includes('text')) return 'textarea';
  return 'input';
}

function toFormComponent(control: string) {
  return {
    textarea: 'vxe-textarea',
    number: 'lc-number-input',
    select: 'vxe-select',
    date: 'vxe-input',
    datetime: 'vxe-input',
    switch: 'vxe-switch',
    upload: 'vxe-input',
  }[control] || 'vxe-input';
}

function mapUsage(column: any) {
  const name = String(column.column_name || '').toLowerCase();
  const isPrimary = Boolean(column.is_primary_key) || name === 'id';
  const isAudit = ['updated_at', 'update_time', 'modified_at'].includes(name);
  const isRemark = name.includes('remark') || name.includes('description');
  return {
    tableColumn: !isPrimary && !isRemark,
    queryCondition:
      !isPrimary &&
      (name.includes('name') || name.includes('code') || name.includes('status') || name.includes('type') || name.includes('time')),
    formItem: !isPrimary && !isAudit,
    detailItem: true,
  };
}

function tableToSource(table: EntityTable) {
  return {
    key: `entity:${table.id}`,
    name: table.title || table.code || table.table_name,
    sourceType: 'entity',
    entityId: table.id,
    entityCode: table.code,
    tableName: table.full_name || table.table_name,
    description: table.description || '',
    syncStatus: 'normal',
    bindingCount: 0,
    entitys: (table.columns || []).map((column: any) => ({
      key: column.column_name,
      name: column.label || column.column_name,
      type: column.data_type || 'text',
      value: column.default_value || '',
      entityFieldId: column.id,
      required: Boolean(column.is_required),
      primaryKey: Boolean(column.is_primary_key),
      usage: mapUsage(column),
      component: {
        formControl: mapControl(column),
        tableFormatter: 'text',
      },
      status: 'normal',
    })),
  };
}

function confirmLinkEntities() {
  const selectedTables = entityTables.value.filter((table) => pickedEntityIds.value.includes(table.id));
  selectedTables.forEach((table) => {
    if (!isLinked(table.id)) {
      incrementModel(tableToSource(table) as any);
    }
  });
  if (selectedTables.length) {
    selectedKey.value = `entity:${selectedTables[0].id}`;
    ElMessage.success('实体数据源已关联');
  }
  pickerVisible.value = false;
}

function saveSelectedSource() {
  if (selectedSource.value) {
    updateModel(cloneDeep(selectedSource.value) as any);
  }
}

function fieldsByUsage(usageKey: string) {
  return (selectedSource.value?.entitys || []).filter((field: any) => field.usage?.[usageKey]);
}

function applyToCurrentBlock() {
  const block = currentBlock.value as any;
  const source = selectedSource.value;
  if (!source || !block?._vid) {
    ElMessage.warning('请先选择实体数据源和画布组件');
    return;
  }

  block.props ||= {};
  block.props.entitySourceKey = source.key;
  block.props.sourceKey = source.key;

  if (block.componentKey === 'lowcode-grid') {
    block.props.title ||= `${source.name}列表`;
    block.props.columns = fieldsByUsage('tableColumn').map((field: any) => ({
      field: field.key,
      title: field.name || field.key,
      minWidth: field.type?.includes('time') ? '170' : '120',
      formatter: field.component?.tableFormatter || '',
    }));
    ElMessage.success('已应用为表格列');
    return;
  }

  if (block.componentKey === 'lowcode-search-form') {
    block.props.title ||= '查询条件';
    block.props.fields = fieldsByUsage('queryCondition').map((field: any) => ({
      field: field.key,
      label: field.name || field.key,
      component: toFormComponent(field.component?.formControl),
      placeholder: `请输入${field.name || field.key}`,
      required: false,
    }));
    ElMessage.success('已应用为查询字段');
    return;
  }

  if (block.componentKey === 'lowcode-edit-form' || block.componentKey === 'form') {
    block.props.title ||= `${source.name}表单`;
    block.props.submitSourceKey ||= source.key;
    block.props.fields = fieldsByUsage('formItem').map((field: any) => ({
      field: field.key,
      label: field.name || field.key,
      component: toFormComponent(field.component?.formControl),
      placeholder: `请输入${field.name || field.key}`,
      required: Boolean(field.required),
    }));
    ElMessage.success('已应用为表单字段');
    return;
  }

  ElMessage.warning('当前组件暂不支持实体数据源应用');
}

async function syncSelectedSource() {
  if (!selectedSource.value) return;
  if (!entityTables.value.length) {
    await loadEntityTables();
  }
  const table = entityTables.value.find((item) => item.id === selectedSource.value?.entityId);
  if (!table) {
    ElMessage.warning('未找到对应实体表，无法同步字段');
    return;
  }
  const nextSource = tableToSource(table);
  const currentByField = new Map<string, any>(
    (selectedSource.value.entitys || []).map((field: any) => [field.key, field]),
  );
  nextSource.entitys = nextSource.entitys.map((field: any) => ({
    ...field,
    usage: currentByField.get(field.key)?.usage || field.usage,
    component: currentByField.get(field.key)?.component || field.component,
  }));
  updateModel(nextSource as any);
  ElMessage.success('字段结构已同步');
}
</script>

<style lang="scss" scoped>
.entity-data-source {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 10px;
  overflow: auto;
  color: #1f2937;
}

.eds-toolbar {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.eds-empty {
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 30px 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  text-align: center;
}

.eds-empty__title {
  font-weight: 600;
}

.eds-empty__desc,
.eds-card small,
.eds-info,
.eds-field small,
.eds-picker-row small {
  color: #64748b;
}

.eds-list {
  display: grid;
  gap: 8px;
}

.eds-card {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 10px;
  border: 1px solid #d8e0ea;
  border-radius: 6px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.eds-card.is-active {
  border-color: #409eff;
  background: #f0f7ff;
}

.eds-card__main {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.eds-card__main small {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eds-card__meta {
  font-size: 12px;
  color: #475569;
}

.eds-detail {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.eds-detail__head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.eds-detail__actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.eds-detail__head small {
  display: block;
  margin-top: 2px;
  color: #64748b;
}

.eds-info {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.eds-fields {
  display: grid;
  border: 1px solid #d8e0ea;
  border-radius: 6px;
  overflow: hidden;
}

.eds-field {
  display: grid;
  grid-template-columns: minmax(98px, 1fr) 38px 38px 38px 38px 92px;
  gap: 4px;
  align-items: center;
  min-height: 38px;
  padding: 6px;
  border-top: 1px solid #edf2f7;
  background: #fff;
  font-size: 12px;
}

.eds-field:first-child {
  border-top: 0;
}

.eds-field--header {
  min-height: 30px;
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
}

.eds-field__name {
  min-width: 0;
}

.eds-field__name strong,
.eds-field__name small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eds-picker {
  display: grid;
  gap: 8px;
}

.eds-picker__state {
  padding: 26px 0;
  color: #64748b;
  text-align: center;
}

.eds-picker-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 52px;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid #d8e0ea;
  border-radius: 6px;
  background: #fff;
}

.eds-picker-row.is-linked {
  background: #f8fafc;
}

.eds-picker-row span,
.eds-picker-row strong,
.eds-picker-row small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eds-picker-row em {
  color: #64748b;
  font-style: normal;
  font-size: 12px;
}
</style>
