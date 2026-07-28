<template>
  <section class="entity-designer">
    <header class="entity-toolbar">
      <div>
        <h1>表格实体设计</h1>
        <p>使用 VueFlow 编排真实表、真实列、虚拟列和外键关系。</p>
      </div>
      <div class="entity-actions">
        <vxe-button :loading="loading" @click="loadDesign">
          <i class="ri-refresh-line" />
          刷新
        </vxe-button>
        <vxe-button status="primary" :loading="savingLayout" @click="saveLayout">
          <i class="ri-layout-masonry-line" />
          保存布局
        </vxe-button>
      </div>
    </header>

    <div class="entity-workspace">
      <aside class="entity-panel">
        <div class="panel-title">
          <h2>{{ tableForm.id ? '编辑表' : '新建表' }}</h2>
          <button type="button" title="新建表" @click="resetTableForm">
            <i class="ri-add-line" />
          </button>
        </div>

        <div class="field-grid">
          <label>
            <span>编码</span>
            <vxe-input v-model="tableForm.code" placeholder="students" clearable />
          </label>
          <label>
            <span>真实表名</span>
            <vxe-input v-model="tableForm.tableName" placeholder="public.students" clearable />
          </label>
          <label>
            <span>名称</span>
            <vxe-input v-model="tableForm.title" placeholder="学生档案" clearable />
          </label>
          <label>
            <span>主键</span>
            <vxe-input v-model="tableForm.primaryKey" placeholder="id" clearable />
          </label>
          <label class="wide">
            <span>描述</span>
            <vxe-textarea v-model="tableForm.description" :auto-size="{ minRows: 2, maxRows: 3 }" />
          </label>
          <label class="check-line">
            <vxe-checkbox v-model="tableForm.createPhysical" />
            <span>保存时创建真实表</span>
          </label>
        </div>

        <div class="entity-actions">
          <vxe-button status="primary" :loading="savingTable" @click="saveTable">
            <i class="ri-save-3-line" />
            保存表
          </vxe-button>
          <vxe-button v-if="selectedTable" status="danger" @click="deleteSelectedTable">
            <i class="ri-delete-bin-line" />
            删除
          </vxe-button>
        </div>

        <p v-if="message" :class="messageClass">{{ message }}</p>
      </aside>

      <main class="entity-flow-shell">
        <VueFlow
          :id="flowId"
          v-model:nodes="flowNodes"
          v-model:edges="flowEdges"
          class="entity-flow"
          :nodes-draggable="true"
          :nodes-connectable="true"
          :elements-selectable="true"
          fit-view-on-init
          @connect="onConnect"
          @node-click="onNodeClick"
          @edge-click="onEdgeClick"
          @pane-click="clearSelection"
          @node-drag-stop="onNodeDragStop"
        >
          <template #node-entity-table="nodeProps">
            <article class="entity-node" :class="{ active: selectedTableId === nodeProps.id }">
              <Handle type="target" :position="Position.Left" id="table-target" />
              <Handle type="source" :position="Position.Right" id="table-source" />

              <header>
                <div>
                  <strong>{{ nodeProps.data.table.title }}</strong>
                  <small>{{ nodeProps.data.table.full_name }}</small>
                </div>
                <span>{{ nodeProps.data.table.columns.length }}</span>
              </header>

              <ul>
                <li
                  v-for="column in nodeProps.data.table.columns"
                  :key="column.id"
                  :class="{
                    primary: column.is_primary_key,
                    virtual: column.storage_kind === 'virtual'
                  }"
                  @click.stop="selectColumn(nodeProps.data.table, column)"
                >
                  <Handle
                    type="target"
                    :position="Position.Left"
                    :id="`${column.column_name}:target`"
                  />
                  <span>{{ column.column_name }}</span>
                  <em>{{ column.data_type }}</em>
                  <Handle
                    type="source"
                    :position="Position.Right"
                    :id="`${column.column_name}:source`"
                  />
                </li>
              </ul>
            </article>
          </template>
        </VueFlow>

        <div v-if="!tables.length && !loading" class="empty-flow">
          <i class="ri-database-2-line" />
          <span>创建第一张表后，会在这里形成可拖拽、可连线的 VueFlow ER 图。</span>
        </div>
      </main>

      <aside class="entity-panel detail-panel">
        <div class="panel-title">
          <h2>列设计</h2>
          <button type="button" title="新建列" :disabled="!selectedTable" @click="resetColumnForm">
            <i class="ri-add-line" />
          </button>
        </div>

        <p v-if="selectedTable" class="panel-hint">当前表：{{ selectedTable.full_name }}</p>
        <p v-else class="panel-hint">选择一张表后编辑列。</p>

        <div class="field-grid">
          <label>
            <span>列名</span>
            <vxe-input v-model="columnForm.columnName" :disabled="Boolean(columnForm.id)" clearable />
          </label>
          <label>
            <span>标签</span>
            <vxe-input v-model="columnForm.label" clearable />
          </label>
          <label>
            <span>类型</span>
            <vxe-select v-model="columnForm.dataType" :options="dataTypeOptions" />
          </label>
          <label>
            <span>存储</span>
            <vxe-select v-model="columnForm.storageKind" :options="storageKindOptions" />
          </label>
          <label class="wide" v-if="columnForm.storageKind === 'virtual'">
            <span>虚拟表达式</span>
            <vxe-textarea v-model="columnForm.expression" :auto-size="{ minRows: 2, maxRows: 3 }" />
          </label>
          <label class="wide" v-else>
            <span>默认值 SQL</span>
            <vxe-input v-model="columnForm.defaultValue" placeholder="'draft' / 0 / now()" clearable />
          </label>
          <div class="flag-row">
            <label><vxe-checkbox v-model="columnForm.isRequired" /> 必填</label>
            <label><vxe-checkbox v-model="columnForm.isUnique" /> 唯一</label>
          </div>
        </div>

        <div class="entity-actions">
          <vxe-button
            status="primary"
            :loading="savingColumn"
            :disabled="!selectedTable"
            @click="saveColumn"
          >
            <i class="ri-save-3-line" />
            保存列
          </vxe-button>
          <vxe-button v-if="columnForm.id" status="danger" @click="deleteSelectedColumn">
            <i class="ri-delete-bin-line" />
            删除列
          </vxe-button>
        </div>

        <div class="relation-form">
          <div class="panel-title">
            <h2>外键关系</h2>
            <button type="button" title="新建关系" @click="resetRelationForm">
              <i class="ri-add-line" />
            </button>
          </div>

          <div class="field-grid">
            <label>
              <span>来源表</span>
              <vxe-select
                v-model="relationForm.sourceTableId"
                :options="tableOptions"
                filterable
                @change="handleRelationTableChange('source')"
              />
            </label>
            <label>
              <span>来源列</span>
              <vxe-select v-model="relationForm.sourceColumnName" :options="sourceColumnOptions" filterable />
            </label>
            <label>
              <span>目标表</span>
              <vxe-select
                v-model="relationForm.targetTableId"
                :options="tableOptions"
                filterable
                @change="handleRelationTableChange('target')"
              />
            </label>
            <label>
              <span>目标列</span>
              <vxe-select v-model="relationForm.targetColumnName" :options="targetColumnOptions" filterable />
            </label>
            <label>
              <span>关系</span>
              <vxe-select v-model="relationForm.relationType" :options="relationTypeOptions" />
            </label>
            <label class="check-line">
              <vxe-checkbox v-model="relationForm.isEnforced" />
              <span>创建真实 FK 约束</span>
            </label>
          </div>

          <div class="entity-actions">
            <vxe-button status="primary" :loading="savingRelation" @click="saveRelation">
              <i class="ri-node-tree" />
              保存关系
            </vxe-button>
          </div>

          <ul class="relation-list">
            <li v-for="relation in relations" :key="relation.id">
              <button type="button" @click="selectRelation(relation)">
                {{ tableTitle(relation.source_table_id) }}.{{ relation.source_column_name }}
                →
                {{ tableTitle(relation.target_table_id) }}.{{ relation.target_column_name }}
              </button>
              <button type="button" title="删除关系" @click="deleteRelation(relation)">
                <i class="ri-close-line" />
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  Handle,
  Position,
  VueFlow,
  useVueFlow,
  type Connection,
  type Edge,
  type EdgeMouseEvent,
  type Node,
  type NodeMouseEvent
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

type EntityColumn = {
  id: string;
  table_id: string;
  column_name: string;
  label: string;
  data_type: string;
  storage_kind: 'physical' | 'virtual';
  expression: string | null;
  is_required: boolean;
  is_primary_key: boolean;
  is_unique: boolean;
  default_value: string | null;
  sort_order: number;
};

type EntityTable = {
  id: string;
  code: string;
  schema_name: string;
  table_name: string;
  full_name: string;
  title: string;
  description: string | null;
  primary_key: string;
  position_x: number;
  position_y: number;
  columns: EntityColumn[];
};

type EntityRelation = {
  id: string;
  source_table_id: string;
  source_column_name: string;
  target_table_id: string;
  target_column_name: string;
  relation_type: string;
  is_enforced: boolean;
};

type DesignGraph = {
  tables: EntityTable[];
  relations: EntityRelation[];
  setupRequired?: boolean;
  message?: string;
};

type EntityNode = Node<{ table: EntityTable }>;
type EntityEdge = Edge<Record<string, unknown>>;

const serviceApi = useServiceApi();
const flowId = `entity-design-flow-${Math.random().toString(36).slice(2)}`;
const { fitView } = useVueFlow(flowId);
const loading = ref(false);
const savingTable = ref(false);
const savingColumn = ref(false);
const savingRelation = ref(false);
const savingLayout = ref(false);
const message = ref('');
const messageClass = ref('lc-help');
const tables = ref<EntityTable[]>([]);
const relations = ref<EntityRelation[]>([]);
const flowNodes = ref<EntityNode[]>([]);
const flowEdges = ref<EntityEdge[]>([]);
const selectedTableId = ref('');

const dataTypeOptions = [
  { label: 'uuid', value: 'uuid' },
  { label: 'text', value: 'text' },
  { label: 'varchar', value: 'varchar' },
  { label: 'integer', value: 'integer' },
  { label: 'bigint', value: 'bigint' },
  { label: 'numeric', value: 'numeric' },
  { label: 'boolean', value: 'boolean' },
  { label: 'date', value: 'date' },
  { label: 'timestamptz', value: 'timestamptz' },
  { label: 'jsonb', value: 'jsonb' }
];
const storageKindOptions = [
  { label: '真实列', value: 'physical' },
  { label: '虚拟列', value: 'virtual' }
];
const relationTypeOptions = [
  { label: '多对一', value: 'many_to_one' },
  { label: '一对多', value: 'one_to_many' },
  { label: '一对一', value: 'one_to_one' },
  { label: '多对多', value: 'many_to_many' }
];

const tableForm = reactive({
  id: '',
  code: '',
  tableName: '',
  title: '',
  description: '',
  primaryKey: 'id',
  createPhysical: true
});
const columnForm = reactive({
  id: '',
  columnName: '',
  label: '',
  dataType: 'text',
  storageKind: 'physical' as 'physical' | 'virtual',
  expression: '',
  defaultValue: '',
  isRequired: false,
  isUnique: false
});
const relationForm = reactive({
  id: '',
  sourceTableId: '',
  sourceColumnName: '',
  targetTableId: '',
  targetColumnName: 'id',
  relationType: 'many_to_one',
  isEnforced: false
});

const selectedTable = computed(() =>
  tables.value.find((table) => table.id === selectedTableId.value) ?? null
);
const tableOptions = computed(() =>
  tables.value.map((table) => ({ label: `${table.title} (${table.full_name})`, value: table.id }))
);
const sourceColumnOptions = computed(() => columnOptionsForTable(relationForm.sourceTableId));
const targetColumnOptions = computed(() => columnOptionsForTable(relationForm.targetTableId));

function syncFlowFromGraph() {
  flowNodes.value = tables.value.map((table, index) => ({
    id: table.id,
    type: 'entity-table',
    position: {
      x: Number.isFinite(table.position_x) ? table.position_x : 80 + index * 320,
      y: Number.isFinite(table.position_y) ? table.position_y : 80
    },
    data: { table }
  }));
  flowEdges.value = relations.value.map((relation) => ({
    id: relation.id,
    source: relation.source_table_id,
    target: relation.target_table_id,
    sourceHandle: `${relation.source_column_name}:source`,
    targetHandle: `${relation.target_column_name}:target`,
    label: relation.relation_type,
    animated: relation.is_enforced,
    type: 'smoothstep',
    style: { stroke: '#0f766e', strokeWidth: 2 },
    labelStyle: { fill: '#0f172a', fontSize: 11, fontWeight: 700 },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 }
  }));
}

function columnOptionsForTable(tableId: string) {
  const table = tables.value.find((item) => item.id === tableId);
  return (table?.columns ?? []).map((column) => ({
    label: `${column.column_name} (${column.data_type})`,
    value: column.column_name
  }));
}

function parseHandleColumn(handleId?: string | null) {
  return handleId?.split(':')[0] ?? '';
}

function resetTableForm() {
  Object.assign(tableForm, {
    id: '',
    code: '',
    tableName: '',
    title: '',
    description: '',
    primaryKey: 'id',
    createPhysical: true
  });
  selectedTableId.value = '';
  resetColumnForm();
}

function resetColumnForm() {
  Object.assign(columnForm, {
    id: '',
    columnName: '',
    label: '',
    dataType: 'text',
    storageKind: 'physical',
    expression: '',
    defaultValue: '',
    isRequired: false,
    isUnique: false
  });
}

function resetRelationForm() {
  Object.assign(relationForm, {
    id: '',
    sourceTableId: selectedTable.value?.id ?? '',
    sourceColumnName: '',
    targetTableId: '',
    targetColumnName: 'id',
    relationType: 'many_to_one',
    isEnforced: false
  });
}

function selectTable(table: EntityTable) {
  selectedTableId.value = table.id;
  Object.assign(tableForm, {
    id: table.id,
    code: table.code,
    tableName: table.full_name,
    title: table.title,
    description: table.description ?? '',
    primaryKey: table.primary_key,
    createPhysical: false
  });
  resetColumnForm();
  if (!relationForm.sourceTableId) relationForm.sourceTableId = table.id;
}

function selectColumn(table: EntityTable, column: EntityColumn) {
  selectTable(table);
  Object.assign(columnForm, {
    id: column.id,
    columnName: column.column_name,
    label: column.label,
    dataType: column.data_type,
    storageKind: column.storage_kind,
    expression: column.expression ?? '',
    defaultValue: column.default_value ?? '',
    isRequired: column.is_required,
    isUnique: column.is_unique
  });
}

function selectRelation(relation: EntityRelation) {
  Object.assign(relationForm, {
    id: relation.id,
    sourceTableId: relation.source_table_id,
    sourceColumnName: relation.source_column_name,
    targetTableId: relation.target_table_id,
    targetColumnName: relation.target_column_name,
    relationType: relation.relation_type,
    isEnforced: relation.is_enforced
  });
}

function tableTitle(id: string) {
  return tables.value.find((table) => table.id === id)?.title ?? id.slice(0, 8);
}

function handleRelationTableChange(role: 'source' | 'target') {
  const options = role === 'source' ? sourceColumnOptions.value : targetColumnOptions.value;
  const first = options[0]?.value ?? '';
  if (role === 'source') relationForm.sourceColumnName = first;
  if (role === 'target') relationForm.targetColumnName = first || 'id';
}

function onNodeClick(event: NodeMouseEvent) {
  const table = tables.value.find((item) => item.id === event.node.id);
  if (table) selectTable(table);
}

function onEdgeClick(event: EdgeMouseEvent) {
  const relation = relations.value.find((item) => item.id === event.edge.id);
  if (relation) selectRelation(relation);
}

function clearSelection() {
  selectedTableId.value = '';
  resetColumnForm();
}

function onNodeDragStop(event: { node: EntityNode }) {
  const table = tables.value.find((item) => item.id === event.node.id);
  if (!table) return;
  table.position_x = Math.round(event.node.position.x);
  table.position_y = Math.round(event.node.position.y);
}

function onConnect(connection: Connection) {
  if (!connection.source || !connection.target) return;
  relationForm.sourceTableId = connection.source;
  relationForm.targetTableId = connection.target;
  relationForm.sourceColumnName = parseHandleColumn(connection.sourceHandle);
  relationForm.targetColumnName = parseHandleColumn(connection.targetHandle) || 'id';
  message.value = '已从 VueFlow 连线填充关系表单，确认后点击“保存关系”。';
  messageClass.value = 'lc-help';
}

async function loadDesign() {
  loading.value = true;
  message.value = '';
  try {
    const graph = await serviceApi.invoke<DesignGraph>('entityDesign', 'listDesign');
    tables.value = graph.tables ?? [];
    relations.value = graph.relations ?? [];
    if (graph.setupRequired && graph.message) {
      message.value = graph.message;
      messageClass.value = 'lc-help';
    }
    if (!selectedTableId.value && tables.value.length) selectTable(tables.value[0]);
    syncFlowFromGraph();
    await nextTick();
    if (tables.value.length) fitView({ padding: 0.2, duration: 180 });
  } catch (error) {
    message.value = error instanceof Error ? error.message : '加载实体设计失败。';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

async function saveTable() {
  savingTable.value = true;
  message.value = '';
  try {
    const selectedNode = flowNodes.value.find((node) => node.id === selectedTableId.value);
    const saved = await serviceApi.invoke<EntityTable>('entityDesign', 'saveTable', {
      id: tableForm.id,
      code: tableForm.code,
      tableName: tableForm.tableName,
      title: tableForm.title,
      description: tableForm.description,
      primaryKey: tableForm.primaryKey || 'id',
      createPhysical: tableForm.createPhysical,
      positionX: selectedNode?.position.x ?? selectedTable.value?.position_x ?? 80,
      positionY: selectedNode?.position.y ?? selectedTable.value?.position_y ?? 80
    });
    selectedTableId.value = saved.id;
    message.value = `已保存 ${saved.table_name}。`;
    messageClass.value = 'lc-help';
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存表失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingTable.value = false;
  }
}

async function deleteSelectedTable() {
  if (!selectedTable.value) return;
  const confirmed = window.confirm(`删除实体 ${selectedTable.value.full_name}？默认只删除 metadata。`);
  if (!confirmed) return;
  savingTable.value = true;
  try {
    await serviceApi.invoke('entityDesign', 'deleteTable', {
      tableId: selectedTable.value.id,
      dropPhysical: false
    });
    resetTableForm();
    await loadDesign();
  } finally {
    savingTable.value = false;
  }
}

async function saveColumn() {
  if (!selectedTable.value) return;
  savingColumn.value = true;
  message.value = '';
  try {
    await serviceApi.invoke('entityDesign', 'saveColumn', {
      tableId: selectedTable.value.id,
      id: columnForm.id,
      columnName: columnForm.columnName,
      label: columnForm.label || columnForm.columnName,
      dataType: columnForm.dataType,
      storageKind: columnForm.storageKind,
      expression: columnForm.expression,
      defaultValue: columnForm.defaultValue,
      isRequired: columnForm.isRequired,
      isUnique: columnForm.isUnique,
      sortOrder: selectedTable.value.columns.length + 10
    });
    message.value = `已保存列 ${columnForm.columnName}。`;
    messageClass.value = 'lc-help';
    resetColumnForm();
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存列失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingColumn.value = false;
  }
}

async function deleteSelectedColumn() {
  if (!selectedTable.value || !columnForm.columnName) return;
  const confirmed = window.confirm(`删除列 ${columnForm.columnName}？真实列会同步 DROP COLUMN。`);
  if (!confirmed) return;
  await serviceApi.invoke('entityDesign', 'deleteColumn', {
    tableId: selectedTable.value.id,
    columnName: columnForm.columnName,
    dropPhysical: true
  });
  resetColumnForm();
  await loadDesign();
}

async function saveRelation() {
  savingRelation.value = true;
  message.value = '';
  try {
    await serviceApi.invoke('entityDesign', 'saveRelation', {
      sourceTableId: relationForm.sourceTableId,
      sourceColumnName: relationForm.sourceColumnName,
      targetTableId: relationForm.targetTableId,
      targetColumnName: relationForm.targetColumnName,
      relationType: relationForm.relationType,
      isEnforced: relationForm.isEnforced
    });
    message.value = '关系已保存。';
    messageClass.value = 'lc-help';
    resetRelationForm();
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存关系失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingRelation.value = false;
  }
}

async function deleteRelation(relation: EntityRelation) {
  await serviceApi.invoke('entityDesign', 'deleteRelation', {
    id: relation.id,
    dropConstraint: false
  });
  await loadDesign();
}

async function saveLayout() {
  savingLayout.value = true;
  try {
    await serviceApi.invoke('entityDesign', 'saveTableLayout', {
      tables: flowNodes.value.map((node) => ({
        id: node.id,
        position_x: Math.round(node.position.x),
        position_y: Math.round(node.position.y)
      }))
    });
    message.value = 'VueFlow 布局已保存。';
    messageClass.value = 'lc-help';
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存布局失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingLayout.value = false;
  }
}

onMounted(loadDesign);
</script>

<style scoped>
.entity-designer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: #eef2f6;
}

.entity-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: none;
  border-bottom: 1px solid #d6dce5;
  background: #ffffff;
  padding: 14px 18px;
}

.entity-toolbar h1,
.entity-toolbar p,
.panel-title h2,
.panel-hint {
  margin: 0;
}

.entity-toolbar h1 {
  font-size: 20px;
  line-height: 1.2;
}

.entity-toolbar p,
.panel-hint {
  color: #667085;
  font-size: 12px;
}

.entity-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.entity-workspace {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 340px;
  flex: 1 1 0;
  min-height: 0;
}

.entity-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  border-right: 1px solid #d6dce5;
  background: #ffffff;
  overflow: auto;
  padding: 14px;
}

.detail-panel {
  border-right: 0;
  border-left: 1px solid #d6dce5;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-title h2 {
  font-size: 15px;
}

.panel-title button,
.relation-list button {
  border: 1px solid #d0d5dd;
  background: #ffffff;
  color: #344054;
  cursor: pointer;
}

.panel-title button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
}

.field-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-grid label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
}

.field-grid .wide,
.check-line {
  grid-column: 1 / -1;
}

.check-line {
  display: flex !important;
  align-items: center;
  gap: 8px;
}

.flag-row {
  display: flex;
  gap: 12px;
  grid-column: 1 / -1;
  color: #344054;
  font-size: 12px;
}

.entity-flow-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: #f8fafc;
  background-image: radial-gradient(circle, rgba(100, 116, 139, 0.24) 1px, transparent 1px);
  background-size: 22px 22px;
}

.entity-flow {
  width: 100%;
  height: 100%;
}

.entity-node {
  width: 292px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  box-shadow: 0 10px 24px rgb(15 23 42 / 8%);
}

.entity-node.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgb(37 99 235 / 18%);
}

.entity-node header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 46px;
  border-bottom: 1px solid #e4e7ec;
  background: #eff6ff;
  padding: 8px 10px;
}

.entity-node header div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.entity-node strong,
.entity-node small,
.entity-node li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-node strong {
  color: #111827;
  font-size: 13px;
}

.entity-node small {
  color: #667085;
  font-size: 11px;
}

.entity-node header > span {
  flex: none;
  min-width: 24px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
}

.entity-node ul,
.relation-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.entity-node li {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
  border-bottom: 1px solid #eef2f6;
  padding: 0 12px;
  font-size: 12px;
}

.entity-node li:hover {
  background: #f1f5f9;
}

.entity-node li.primary span::before {
  content: "PK ";
  color: #d97706;
  font-weight: 700;
}

.entity-node li.virtual span::before {
  content: "V ";
  color: #7c3aed;
  font-weight: 700;
}

.entity-node em {
  flex: none;
  color: #64748b;
  font-size: 11px;
  font-style: normal;
}

.entity-node :deep(.vue-flow__handle) {
  width: 9px;
  height: 9px;
  border: 2px solid #ffffff;
  background: #0f766e;
}

.empty-flow {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: #64748b;
  pointer-events: none;
  font-size: 13px;
}

.empty-flow i {
  color: #2563eb;
  font-size: 36px;
}

.relation-form {
  display: grid;
  gap: 12px;
  border-top: 1px solid #e4e7ec;
  padding-top: 14px;
}

.relation-list {
  display: grid;
  gap: 6px;
}

.relation-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: 6px;
}

.relation-list button {
  min-height: 28px;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.vue-flow__node-entity-table) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}

@media (max-width: 1100px) {
  .entity-workspace {
    grid-template-columns: 1fr;
  }

  .entity-panel,
  .detail-panel {
    border: 0;
    border-bottom: 1px solid #d6dce5;
    max-height: none;
  }

  .entity-flow-shell {
    min-height: 560px;
  }
}
</style>
