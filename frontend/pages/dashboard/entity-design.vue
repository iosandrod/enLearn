<template>
  <section class="entity-designer">
    <header class="entity-toolbar">

      <div class="toolbar-actions">
        <vxe-button :loading="loadingPhysicalTables" @click="openLoadTablesModal">
          <i class="ri-database-2-line" />
          加载表
        </vxe-button>
        <vxe-button
          :disabled="!selectedTable"
          :loading="syncingColumns"
          @click="syncSelectedTableFields"
        >
          <i class="ri-loop-left-line" />
          同步字段
        </vxe-button>
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

    <LcVxeModalRenderer :modals="modalConfigs" />

    <div class="entity-workspace">
      <aside class="entity-panel entity-panel-left">
        <section
          v-for="panel in leftPanelSchemas"
          :key="panel.id"
          class="panel-section"
          :class="panel.className"
        >
          <p v-if="panel.hint" class="panel-hint">{{ panel.hint }}</p>

          <LowCodeForm
            :model-value="panel.form.model.value"
            class="designer-form"
            :class="panel.form.className"
            :schema="panel.form.schema"
            :option-sources="panel.form.optionSources"
            :loading="formDefinitionsLoading || panel.form.loading"
            @update:model-value="(value) => updatePanelModel(panel, value)"
            @submit="panel.form.onSubmit"
            @action="panel.form.onAction"
            @field-change="panel.form.onFieldChange"
          />
        </section>

        <p v-if="message" class="designer-message" :class="messageClass">{{ message }}</p>
      </aside>

      <main class="entity-flow-shell">
        <!-- <div class="flow-topbar">
          <div>
            <span>{{ flowNodes.length }}/{{ tables.length }} 张表</span>
            <span>{{ totalColumnCount }} 个字段</span>
            <span>{{ relations.length }} 条关系</span>
          </div>
          <p v-if="selectedTable">当前：{{ selectedTable.full_name }}</p>
          <p v-else>点击表节点或字段进行编辑，也可以拖拽节点保存布局。</p>
        </div> -->

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
          @pane-click="clearColumnSelection"
          @node-drag-stop="onNodeDragStop"
        >
          <template #node-entity-table="nodeProps">
            <article class="entity-node" :class="{ active: selectedTableId === nodeProps.id }">
              <Handle type="target" :position="Position.Left" id="table-target" />
              <Handle type="source" :position="Position.Right" id="table-source" />

              <header>
                <div class="node-title">
                  <strong>{{ displayTableTitle(nodeProps.data.table) }}</strong>
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
                    virtual: column.storage_kind === 'virtual',
                    selected:
                      selectedTableId === nodeProps.id &&
                      columnForm.columnName === column.column_name
                  }"
                  @click.stop="selectColumn(nodeProps.data.table, column)"
                >
                  <Handle
                    type="target"
                    :position="Position.Left"
                    :id="`${column.column_name}:target`"
                  />
                  <span class="column-name">{{ column.column_name }}</span>
                  <span class="column-label">{{ displayColumnLabel(nodeProps.data.table, column) }}</span>
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

        <div v-if="!flowNodes.length && !loading" class="empty-flow">
          <i class="ri-database-2-line" />
          <strong>还没有实体表</strong>
          <span>在左侧保存第一张表后，这里会生成可拖拽、可连线的 VueFlow ER 图。</span>
        </div>
      </main>

      <aside class="entity-panel entity-panel-right">
        <section
          v-for="panel in rightPanelSchemas"
          :key="panel.id"
          class="panel-section"
          :class="panel.className"
        >
          <div class="panel-heading">
            <div>
              <span>{{ panel.kicker }}</span>
              <h2>{{ panel.title }}</h2>
            </div>
            <button
              v-if="panel.addAction"
              type="button"
              :title="panel.addAction.title"
              :disabled="panel.addAction.disabled"
              @click="panel.addAction.onClick"
            >
              <i :class="panel.addAction.icon || 'ri-add-line'" />
            </button>
            <strong v-else-if="typeof panel.badge !== 'undefined'">{{ panel.badge }}</strong>
          </div>

          <p v-if="panel.hint" class="panel-hint">{{ panel.hint }}</p>

          <LowCodeForm
            :model-value="panel.form.model.value"
            class="designer-form"
            :class="panel.form.className"
            :schema="panel.form.schema"
            :option-sources="panel.form.optionSources"
            :loading="formDefinitionsLoading || panel.form.loading"
            @update:model-value="(value) => updatePanelModel(panel, value)"
            @submit="panel.form.onSubmit"
            @action="panel.form.onAction"
            @field-change="panel.form.onFieldChange"
          />
        </section>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  Handle,
  Position,
  VueFlow,
  MarkerType,
  useVueFlow,
  type Connection,
  type Edge,
  type EdgeMouseEvent,
  type Node,
  type NodeMouseEvent
} from '@vue-flow/core';
import { h, type Ref } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { LowCodeForm, LcVxeModalRenderer, type LcVxeModalConfig } from '@enlearn/lowcode-framework';
import {
  createEmptyLowCodeFormSchema,
  loadLowCodeFormDefinitions,
  LOW_CODE_FORM_CODES,
} from '../../utils/lowCodeFormDefinitions';
import type { LowCodeAction, LowCodeField, LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';

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

type PhysicalTableOption = {
  schemaName: string;
  tableName: string;
  fullName: string;
  title: string;
  existsInMetadata: boolean;
  tableId: string | null;
  columnCount: number;
  checked?: boolean;
};

type SyncColumnsResult = {
  inserted: number;
  skipped: number;
};

type SyncPhysicalTablesResult = {
  imported: number;
  existing: number;
  tables: Array<{
    tableId: string;
    fullName: string;
    created: boolean;
    insertedColumns: number;
    skippedColumns: number;
  }>;
};

type EntityNode = Node<{ table: EntityTable }>;
type EntityEdge = Edge<Record<string, unknown>>;

type FormValues = Record<string, unknown>;

type EntityDesignerFormPanel = {
  id: string;
  kicker: string;
  title: string;
  hint?: string;
  badge?: string | number;
  className?: string;
  addAction?: {
    title: string;
    icon?: string;
    disabled?: boolean;
    onClick: () => void;
  };
  form: {
    model: Ref<FormValues>;
    schema: LowCodeFormSchema;
    optionSources?: Record<string, unknown>;
    loading?: boolean;
    className?: string;
    onSubmit?: (values: FormValues) => void | Promise<void>;
    onAction?: (action: LowCodeAction, values: FormValues) => void | Promise<void>;
    onFieldChange?: (payload: {
      field: LowCodeField;
      value: unknown;
      previousValue: unknown;
      values: FormValues;
    }) => void | Promise<void>;
  };
};

type LowCodeArrayTableRowAction = {
  code: string;
  label?: string | ((payload: FormValues) => string);
  title?: string | ((payload: FormValues) => string);
  icon?: string;
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  disabled?: boolean | ((payload: FormValues) => boolean);
  visible?: boolean | ((payload: FormValues) => boolean);
};

const serviceApi = useServiceApi();
const flowId = 'entity-design-flow';
const { fitView } = useVueFlow(flowId);

const loading = ref(false);
const formDefinitionsLoading = ref(true);
const formDefinitionError = ref('');
const entityTableFormSchema = shallowRef<LowCodeFormSchema | null>(null);
const entityColumnFormSchema = shallowRef<LowCodeFormSchema | null>(null);
const entityColumnsTableFormSchema = shallowRef<LowCodeFormSchema | null>(null);
const entityRelationFormSchema = shallowRef<LowCodeFormSchema | null>(null);
const entityLeftPanelFormSchema = shallowRef<LowCodeFormSchema | null>(null);
const entityRightPanelFormSchema = shallowRef<LowCodeFormSchema | null>(null);
const entityFormDefinitionsReady = computed(() =>
  Boolean(
    entityTableFormSchema.value &&
      entityColumnFormSchema.value &&
      entityColumnsTableFormSchema.value &&
      entityRelationFormSchema.value &&
      entityLeftPanelFormSchema.value &&
      entityRightPanelFormSchema.value,
  ),
);
const savingTable = ref(false);
const savingColumn = ref(false);
const savingRelation = ref(false);
const savingLayout = ref(false);
const syncingColumns = ref(false);
const loadingPhysicalTables = ref(false);
const importingPhysicalTables = ref(false);
const loadTablesModalOpen = ref(false);
const message = ref('');
const messageClass = ref('lc-help');
const tables = ref<EntityTable[]>([]);
const relations = ref<EntityRelation[]>([]);
const flowNodes = shallowRef<EntityNode[]>([]);
const flowEdges = shallowRef<EntityEdge[]>([]);
const selectedTableId = ref('');
const physicalTables = ref<PhysicalTableOption[]>([]);
const hiddenCanvasTableIds = ref<Set<string>>(new Set());
const canvasVisibilityInitialized = ref(false);

const tableForm = ref<FormValues>(newTableForm());
const columnRowsForm = ref<FormValues>({ columns: [] });
const columnForm = ref<FormValues>(newColumnForm());
const relationForm = ref<FormValues>(newRelationForm());

const selectedTable = computed(
  () => tables.value.find((table) => table.id === selectedTableId.value) ?? null
);
const selectedPhysicalTables = computed(() => physicalTables.value.filter((table) => table.checked));
const totalColumnCount = computed(() =>
  tables.value.reduce((total, table) => total + table.columns.length, 0)
);
const selectedColumn = computed(() => {
  const columnName = stringValue(columnForm.value.columnName);
  if (!selectedTable.value || !columnName) return null;
  return selectedTable.value.columns.find((column) => column.column_name === columnName) ?? null;
});
const tableOptions = computed(() =>
  tables.value.map((table) => ({
    label: `${displayTableTitle(table)} (${table.full_name})`,
    value: table.id
  }))
);
const sourceColumnOptions = computed(() =>
  columnOptionsForTable(stringValue(relationForm.value.sourceTableId))
);
const targetColumnOptions = computed(() =>
  columnOptionsForTable(stringValue(relationForm.value.targetTableId))
);
const relationOptionSources = computed(() => ({
  tables: tableOptions.value,
  sourceColumns: sourceColumnOptions.value,
  targetColumns: targetColumnOptions.value
}));

const tableListRows = computed(() =>
  tables.value.map((table) => ({
    id: table.id,
    title: displayTableTitle(table),
    fullName: table.full_name,
    columnCount: table.columns.length,
    canvasStatus: isTableVisible(table.id) ? '显示' : '已移出',
    table,
  }))
);
const relationListRows = computed(() =>
  relations.value.map((relation) => ({
    id: relation.id,
    source: `${tableTitle(relation.source_table_id)}.${relation.source_column_name}`,
    target: `${tableTitle(relation.target_table_id)}.${relation.target_column_name}`,
    relationType: relationTypeLabel(relation.relation_type),
    relation,
  }))
);
const leftPanelModel = computed<FormValues>({
  get: () => ({
    table: tableForm.value,
    tables: tableListRows.value,
  }),
  set: (value) => {
    if (isRecord(value.table)) tableForm.value = value.table;
  },
});
const rightPanelModel = computed<FormValues>({
  get: () => ({
    columns: columnRowsForm.value.columns,
    columnDetail: columnForm.value,
    relation: relationForm.value,
    relations: relationListRows.value,
  }),
  set: (value) => {
    columnRowsForm.value = {
      columns: Array.isArray(value.columns) ? value.columns : [],
    };
    if (isRecord(value.columnDetail)) columnForm.value = value.columnDetail;
    if (isRecord(value.relation)) relationForm.value = value.relation;
  },
});
const modalConfigs = computed<LcVxeModalConfig[]>(() => [
  {
    id: 'load-physical-tables',
    visible: loadTablesModalOpen.value,
    title: '加载真实表',
    width: 'min(860px, calc(100vw - 48px))',
    height: 'min(640px, calc(100vh - 80px))',
    props: {
      showFooter: true,
      transfer: true,
    },
    onVisibleChange: (visible) => {
      loadTablesModalOpen.value = visible;
    },
    body: () =>
      h('div', { class: 'physical-table-loader' }, [
        h('div', { class: 'physical-table-loader__summary' }, [
          h('strong', String(selectedPhysicalTables.value.length)),
          h('span', `已选择 / ${physicalTables.value.length} 张真实表`),
        ]),
        h(
          'vxe-table',
          {
            border: true,
            showOverflow: true,
            size: 'small',
            data: physicalTables.value,
            rowConfig: { keyField: 'fullName' },
            checkboxConfig: { checkField: 'checked' },
          },
          {
            default: () => [
              h('vxe-column', { type: 'checkbox', width: 52 }),
              h('vxe-column', { field: 'fullName', title: '真实表', minWidth: 220 }),
              h('vxe-column', { field: 'title', title: '显示名称', minWidth: 180 }),
              h('vxe-column', { field: 'columnCount', title: '字段数', width: 96, align: 'right' }),
              h(
                'vxe-column',
                { field: 'existsInMetadata', title: 'Metadata', width: 120, align: 'center' },
                {
                  default: (slotParams?: { row?: PhysicalTableOption }) => {
                    const row = slotParams?.row;

                    if (!row) return null;

                    return h(
                      'span',
                      { class: ['metadata-pill', row.existsInMetadata ? 'is-linked' : 'is-new'] },
                      row.existsInMetadata ? '已存在' : '待同步',
                    );
                  },
                },
              ),
            ],
          },
        ),
      ]),
    footer: () =>
      h('div', { class: 'load-table-footer' }, [
        h('vxe-button', { onClick: () => (loadTablesModalOpen.value = false) }, { default: () => '取消' }),
        h(
          'vxe-button',
          {
            status: 'primary',
            loading: importingPhysicalTables.value,
            disabled: !selectedPhysicalTables.value.length,
            onClick: confirmLoadTables,
          },
          { default: () => '加载选中表' },
        ),
      ]),
  },
]);

const tableDesignerSchema = computed<LowCodeFormSchema>(() =>
  prepareSchema(requireEntitySchema(entityTableFormSchema.value), {
    disableAction: (action) => action.code === 'delete' && !selectedTable.value,
    disableField: (field) => field.field === 'createPhysical' && Boolean(tableForm.value.id)
  })
);
const columnDesignerSchema = computed<LowCodeFormSchema>(() => {
  const isVirtual = columnForm.value.storageKind === 'virtual';
  return prepareSchema(requireEntitySchema(entityColumnFormSchema.value), {
    keepField: (field) =>
      isVirtual ? field.field !== 'defaultValue' : field.field !== 'expression',
    disableField: (field) =>
      !selectedTable.value || (field.field === 'columnName' && Boolean(columnForm.value.id)),
    disableAction: (action) =>
      !selectedTable.value ||
      (action.code === 'delete' && (!columnForm.value.columnName || selectedColumn.value?.is_primary_key))
  });
});
const columnsTableDesignerSchema = computed<LowCodeFormSchema>(() =>
  prepareSchema(requireEntitySchema(entityColumnsTableFormSchema.value), {
    disableField: () => !selectedTable.value,
    disableAction: () => !selectedTable.value
  })
);
const relationDesignerSchema = computed<LowCodeFormSchema>(() =>
  prepareSchema(requireEntitySchema(entityRelationFormSchema.value), {
    disableAction: (action) => action.code === 'save' && tables.value.length < 2
  })
);
const tablePanelFormSchema = computed(() => toSingleColumnSchema(tableDesignerSchema.value));
const columnPanelFormSchema = computed(() => toSingleColumnSchema(columnDesignerSchema.value));
const relationPanelFormSchema = computed(() => toSingleColumnSchema(relationDesignerSchema.value));
const tableRowActions = computed<LowCodeArrayTableRowAction[]>(() => [
  {
    code: 'toggleCanvas',
    label: ({ row }) => {
      const table = isRecord(row) && isEntityTable(row.table) ? row.table : null;
      return table && isTableVisible(table.id) ? '移出' : '显示';
    },
    title: ({ row }) => {
      const table = isRecord(row) && isEntityTable(row.table) ? row.table : null;
      return table && isTableVisible(table.id) ? '从画布移出' : '显示到画布';
    },
    status: 'primary',
  },
]);
const relationRowActions: LowCodeArrayTableRowAction[] = [
  { code: 'delete', label: '删', title: '删除关系', status: 'danger' },
];
const leftPanelSchema = computed<LowCodeFormSchema>(() => {
  const schema = structuredClone(requireEntitySchema(entityLeftPanelFormSchema.value));
  const tableField = findSchemaField(schema, 'table');
  const tablesField = findSchemaField(schema, 'tables');
  tableField.props = {
    ...tableField.props,
    schema: tablePanelFormSchema.value,
    onSubmit: saveTable,
    onAction: handleTableAction,
  };
  tablesField.props = {
    ...tablesField.props,
    rowActions: tableRowActions.value,
    onRowClick: handleTableListRowClick,
    onRowAction: handleTableListRowAction,
  };
  setSchemaTabLabel(schema, 'table-list', `实体列表 (${tables.value.length})`);
  setSchemaTabLabel(schema, 'table-detail', tableForm.value.id ? '实体信息' : '新建实体');
  return schema;
});
const rightPanelSchema = computed<LowCodeFormSchema>(() => {
  const schema = structuredClone(requireEntitySchema(entityRightPanelFormSchema.value));
  const columnsField = findSchemaField(schema, 'columns');
  const columnDetailField = findSchemaField(schema, 'columnDetail');
  const relationField = findSchemaField(schema, 'relation');
  const relationsField = findSchemaField(schema, 'relations');
  const columnsSource = columnsTableDesignerSchema.value.fields.find(
    (field) => field.field === 'columns',
  );

  columnsField.label = selectedTable.value
    ? `字段集合：${selectedTable.value.full_name}`
    : '字段集合';
  columnsField.props = {
    ...columnsSource?.props,
    ...columnsField.props,
    disabled: !selectedTable.value,
    onRowClick: handleColumnArrayRowClick,
  };
  columnDetailField.label = columnForm.value.columnName
    ? `单列绑定：${columnForm.value.columnName}`
    : '单列绑定';
  columnDetailField.help = columnForm.value.columnName ? '' : '从字段集合或画布字段选择一列。';
  columnDetailField.props = {
    ...columnDetailField.props,
    schema: columnPanelFormSchema.value,
    onSubmit: saveColumn,
    onAction: handleColumnAction,
  };
  relationField.props = {
    ...relationField.props,
    schema: relationPanelFormSchema.value,
    optionSources: relationOptionSources.value,
    onSubmit: saveRelation,
    onAction: handleRelationAction,
    onFieldChange: handleRelationFieldChange,
  };
  relationsField.props = {
    ...relationsField.props,
    rowActions: relationRowActions,
    onRowClick: handleRelationListRowClick,
    onRowAction: handleRelationListRowAction,
  };
  setSchemaTabLabel(
    schema,
    'column-list',
    `字段列表 (${selectedTable.value?.columns.length ?? 0})`,
  );
  setSchemaTabLabel(schema, 'relation-list', `关系列表 (${relations.value.length})`);
  schema.actions = schema.actions.map((action) => ({
    ...action,
    disabled: Boolean(action.disabled) || !selectedTable.value,
  }));
  return schema;
});
const leftPanelSchemas = computed<EntityDesignerFormPanel[]>(() => {
  if (!entityFormDefinitionsReady.value) return [];

  return [
    {
      id: 'entity-left-schema',
      className: 'entity-left-panel-section',
      kicker: 'Table',
      title: tableForm.value.id ? '编辑表' : '新建表',
      form: {
        model: leftPanelModel,
        schema: leftPanelSchema.value,
        loading: savingTable.value,
        className: 'entity-left-tabs-form',
      },
    },
  ];
});
const rightPanelSchemas = computed<EntityDesignerFormPanel[]>(() => {
  if (!entityFormDefinitionsReady.value) return [];

  return [
    {
      id: 'entity-right-schema',
      className: 'entity-right-panel-section',
      kicker: 'Column / Relation',
      title: '字段与关系',
      hint: selectedTable.value ? `当前表：${selectedTable.value.full_name}` : '选择一张表后维护字段集合。',
      form: {
        model: rightPanelModel,
        schema: rightPanelSchema.value,
        optionSources: relationOptionSources.value,
        loading: savingColumn.value || savingRelation.value,
        className: 'entity-right-tabs-form',
        onAction: handleRightPanelAction,
        onFieldChange: handleRightPanelFieldChange,
      },
    },
  ];
});

function newTableForm(): FormValues {
  return {
    id: '',
    code: '',
    tableName: '',
    title: '',
    description: '',
    primaryKey: 'id',
    createPhysical: true
  };
}

function newColumnForm(): FormValues {
  return {
    id: '',
    columnName: '',
    label: '',
    dataType: 'text',
    storageKind: 'physical',
    expression: '',
    defaultValue: '',
    isRequired: false,
    isUnique: false
  };
}

function newRelationForm(): FormValues {
  return {
    id: '',
    sourceTableId: '',
    sourceColumnName: '',
    targetTableId: '',
    targetColumnName: 'id',
    relationType: 'many_to_one',
    isEnforced: false
  };
}

function requireEntitySchema(schema: LowCodeFormSchema | null) {
  return schema ?? createEmptyLowCodeFormSchema();
}

function findSchemaField(schema: LowCodeFormSchema, fieldName: string) {
  const field = schema.fields.find((candidate) => candidate.field === fieldName);
  if (!field) throw new Error(`实体设计表单缺少字段：${fieldName}。`);
  return field;
}

function setSchemaTabLabel(schema: LowCodeFormSchema, tabKey: string, label: string) {
  const tabsNode = schema.layout?.find((node) => node.kind === 'tabs');
  if (!tabsNode || tabsNode.kind !== 'tabs') {
    throw new Error('实体设计组合表单缺少页签布局。');
  }
  const tab = tabsNode.tabs.find((candidate) => candidate.key === tabKey);
  if (!tab) throw new Error(`实体设计组合表单缺少页签：${tabKey}。`);
  tab.label = label;
}

async function loadEntityFormDefinitions() {
  formDefinitionsLoading.value = true;
  formDefinitionError.value = '';
  try {
    const definitions = await loadLowCodeFormDefinitions(serviceApi, [
      LOW_CODE_FORM_CODES.entityDesignTable,
      LOW_CODE_FORM_CODES.entityDesignColumn,
      LOW_CODE_FORM_CODES.entityDesignColumns,
      LOW_CODE_FORM_CODES.entityDesignRelation,
      LOW_CODE_FORM_CODES.entityDesignLeftPanel,
      LOW_CODE_FORM_CODES.entityDesignRightPanel,
    ]);
    entityTableFormSchema.value = definitions[LOW_CODE_FORM_CODES.entityDesignTable].schema;
    entityColumnFormSchema.value = definitions[LOW_CODE_FORM_CODES.entityDesignColumn].schema;
    entityColumnsTableFormSchema.value = definitions[LOW_CODE_FORM_CODES.entityDesignColumns].schema;
    entityRelationFormSchema.value = definitions[LOW_CODE_FORM_CODES.entityDesignRelation].schema;
    entityLeftPanelFormSchema.value = definitions[LOW_CODE_FORM_CODES.entityDesignLeftPanel].schema;
    entityRightPanelFormSchema.value = definitions[LOW_CODE_FORM_CODES.entityDesignRightPanel].schema;
  } catch (error) {
    formDefinitionError.value =
      error instanceof Error ? error.message : '加载实体设计表单定义失败。';
    message.value = formDefinitionError.value;
    messageClass.value = 'lc-error';
  } finally {
    formDefinitionsLoading.value = false;
  }
}

function prepareSchema(
  schema: LowCodeFormSchema,
  options: {
    keepField?: (field: LowCodeField) => boolean;
    disableField?: (field: LowCodeField) => boolean;
    disableAction?: (action: LowCodeAction) => boolean;
  } = {}
): LowCodeFormSchema {
  const fields = schema.fields
    .filter((field) => options.keepField?.(field) ?? true)
    .map((field) => ({
      ...field,
      props: {
        ...field.props,
        disabled: Boolean(field.props?.disabled) || Boolean(options.disableField?.(field))
      }
    }));

  return {
    ...schema,
    fields,
    actions: schema.actions.map((action) => ({
      ...action,
      disabled: Boolean(action.disabled) || Boolean(options.disableAction?.(action))
    }))
  };
}

function toSingleColumnSchema(schema: LowCodeFormSchema): LowCodeFormSchema {
  return {
    ...schema,
    columns: 1,
    layout: schema.fields.map((field) => ({ kind: 'field', field: field.field })),
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function booleanValue(value: unknown) {
  return value === true;
}

function updatePanelModel(panel: EntityDesignerFormPanel, value: FormValues) {
  panel.form.model.value = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEntityTable(value: unknown): value is EntityTable {
  return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.columns);
}

function isEntityRelation(value: unknown): value is EntityRelation {
  return isRecord(value) && typeof value.id === 'string' && typeof value.source_table_id === 'string';
}

function readPayloadRow(payload: unknown) {
  return isRecord(payload) && isRecord(payload.row) ? payload.row : null;
}

function handleTableListRowClick(payload: unknown) {
  const row = readPayloadRow(payload);
  if (row && isEntityTable(row.table)) selectTable(row.table);
}

function handleTableListRowAction(payload: unknown) {
  const row = readPayloadRow(payload);
  if (!row || !isEntityTable(row.table)) return;
  const actionCode = isRecord(payload) ? stringValue(payload.actionCode) : '';

  if (actionCode === 'toggleCanvas') {
    void toggleTableCanvasVisibility(row.table);
  }
}

function handleColumnArrayRowClick(payload: unknown) {
  const row = readPayloadRow(payload);
  if (row) setColumnFormFromRow(row);
}

function handleRelationListRowClick(payload: unknown) {
  const row = readPayloadRow(payload);
  if (row && isEntityRelation(row.relation)) selectRelation(row.relation);
}

function handleRelationListRowAction(payload: unknown) {
  const row = readPayloadRow(payload);
  if (!row || !isEntityRelation(row.relation)) return;
  const actionCode = isRecord(payload) ? stringValue(payload.actionCode) : '';

  if (actionCode === 'delete') {
    void deleteRelation(row.relation);
  }
}

function handleRightPanelAction(action: LowCodeAction, values: FormValues) {
  if (action.code === 'saveRows') {
    void saveColumnRows({ columns: values.columns });
  }
}

function handleRightPanelFieldChange(payload: {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
  values: FormValues;
}) {
  if (payload.field.field === 'columns') {
    handleColumnRowsFieldChange(payload);
  }
}

function isBadDisplayText(value: unknown) {
  if (typeof value !== 'string') return true;
  const text = value.trim();
  if (!text) return true;
  if (/^\?+$/.test(text)) return true;
  if (/\?{2,}/.test(text)) return true;
  if (text.includes('\uFFFD')) return true;
  return false;
}

function humanizeIdentifier(value: string) {
  return value
    .replace(/^public\./, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const tableTitleFallbacks: Record<string, string> = {
  sale: '销售订单',
  sale_detail: '销售订单明细',
  entity_design_smoke_students: 'VueFlow 测试学生'
};

const columnLabelFallbacks: Record<string, string> = {
  id: 'ID',
  sale_no: '订单编号',
  customer_name: '客户名称',
  sale_date: '销售日期',
  total_amount: '总金额',
  status: '状态',
  sale_id: '销售订单ID',
  product_name: '商品名称',
  quantity: '数量',
  unit_price: '单价',
  line_amount: '行金额',
  remark: '备注',
  name: '名称',
  display_name: '显示名称'
};

function displayTableTitle(table: EntityTable) {
  if (!isBadDisplayText(table.title)) return table.title;
  return tableTitleFallbacks[table.table_name] ?? tableTitleFallbacks[table.code] ?? humanizeIdentifier(table.table_name);
}

function displayColumnLabel(table: EntityTable, column: EntityColumn) {
  if (!isBadDisplayText(column.label)) return column.label;
  return columnLabelFallbacks[column.column_name] ?? humanizeIdentifier(column.column_name);
}

function displayColumnLabelFromName(columnName: string, label?: unknown) {
  if (!isBadDisplayText(label)) return String(label);
  return columnLabelFallbacks[columnName] ?? humanizeIdentifier(columnName);
}

function isTableVisible(tableId: string) {
  return !hiddenCanvasTableIds.value.has(tableId);
}

function visibleTables() {
  return tables.value.filter((table) => isTableVisible(table.id));
}

function syncFlowFromGraph() {
  const activeTables = visibleTables();
  const activeTableIds = new Set(activeTables.map((table) => table.id));
  flowNodes.value = activeTables.map((table, index) => ({
    id: table.id,
    type: 'entity-table',
    position: {
      x: Number.isFinite(table.position_x) ? table.position_x : 80 + index * 340,
      y: Number.isFinite(table.position_y) ? table.position_y : 80
    },
    data: { table }
  })) as EntityNode[];
  flowEdges.value = relations.value
    .filter(
      (relation) =>
        activeTableIds.has(relation.source_table_id) && activeTableIds.has(relation.target_table_id)
    )
    .map((relation) => ({
      id: relation.id,
      source: relation.source_table_id,
      target: relation.target_table_id,
      sourceHandle: `${relation.source_column_name}:source`,
      targetHandle: `${relation.target_column_name}:target`,
      label: relationTypeLabel(relation.relation_type),
      animated: relation.is_enforced,
      type: 'smoothstep',
      style: { stroke: relation.is_enforced ? '#0f766e' : '#475569', strokeWidth: 2.4 },
      labelStyle: { fill: '#0f172a', fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.96 },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: relation.is_enforced ? '#0f766e' : '#475569'
      }
    })) as EntityEdge[];
}

function columnOptionsForTable(tableId: string) {
  const table = tables.value.find((item) => item.id === tableId);
  return (table?.columns ?? []).map((column) => ({
    label: `${column.column_name} - ${table ? displayColumnLabel(table, column) : column.label}`,
    value: column.column_name
  }));
}

function parseHandleColumn(handleId?: string | null) {
  return handleId?.split(':')[0] ?? '';
}

function columnToFormRow(table: EntityTable, column: EntityColumn): FormValues {
  return {
    id: column.id,
    columnName: column.column_name,
    label: displayColumnLabel(table, column),
    dataType: column.data_type,
    storageKind: column.storage_kind,
    expression: column.expression ?? '',
    defaultValue: column.default_value ?? '',
    isRequired: column.is_required,
    isUnique: column.is_unique,
    isPrimaryKey: column.is_primary_key
  };
}

function normalizeColumnRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is FormValues => typeof row === 'object' && row !== null && !Array.isArray(row))
    .map((row) => ({
      id: stringValue(row.id),
      columnName: stringValue(row.columnName),
      label: displayColumnLabelFromName(stringValue(row.columnName), row.label),
      dataType: stringValue(row.dataType) || 'text',
      storageKind: stringValue(row.storageKind) || 'physical',
      expression: stringValue(row.expression),
      defaultValue: stringValue(row.defaultValue),
      isRequired: booleanValue(row.isRequired),
      isUnique: booleanValue(row.isUnique),
      isPrimaryKey: booleanValue(row.isPrimaryKey)
    }));
}

function syncColumnRowsFromSelectedTable() {
  columnRowsForm.value = {
    columns: selectedTable.value?.columns.map((column) => columnToFormRow(selectedTable.value!, column)) ?? []
  };
}

function setColumnFormFromRow(row: FormValues) {
  columnForm.value = {
    id: stringValue(row.id),
    columnName: stringValue(row.columnName),
    label: displayColumnLabelFromName(stringValue(row.columnName), row.label),
    dataType: stringValue(row.dataType) || 'text',
    storageKind: stringValue(row.storageKind) || 'physical',
    expression: stringValue(row.expression),
    defaultValue: stringValue(row.defaultValue),
    isRequired: booleanValue(row.isRequired),
    isUnique: booleanValue(row.isUnique)
  };
}

function sameColumnRow(prev: FormValues, next: FormValues) {
  return (
    stringValue(prev.id) === stringValue(next.id) &&
    stringValue(prev.columnName) === stringValue(next.columnName) &&
    stringValue(prev.label) === stringValue(next.label) &&
    stringValue(prev.dataType) === stringValue(next.dataType) &&
    stringValue(prev.storageKind) === stringValue(next.storageKind) &&
    stringValue(prev.expression) === stringValue(next.expression) &&
    stringValue(prev.defaultValue) === stringValue(next.defaultValue) &&
    booleanValue(prev.isRequired) === booleanValue(next.isRequired) &&
    booleanValue(prev.isUnique) === booleanValue(next.isUnique)
  );
}

function findChangedColumnRow(previousRows: FormValues[], nextRows: FormValues[]) {
  return nextRows.find((row, index) => !sameColumnRow(previousRows[index] ?? {}, row)) ?? nextRows[nextRows.length - 1];
}

function resetTableForm() {
  tableForm.value = newTableForm();
  selectedTableId.value = '';
  columnRowsForm.value = { columns: [] };
  resetColumnForm();
}

function resetColumnForm() {
  columnForm.value = newColumnForm();
}

function startNewColumn() {
  if (!selectedTable.value) return;
  const rows = normalizeColumnRows(columnRowsForm.value.columns);
  const draft = normalizeColumnRows([newColumnForm()])[0];
  if (!draft) return;
  rows.push(draft);
  columnRowsForm.value = { columns: rows };
  setColumnFormFromRow(draft);
}

function resetRelationForm() {
  relationForm.value = {
    ...newRelationForm(),
    sourceTableId: selectedTable.value?.id ?? ''
  };
  applyRelationColumnDefaults('source');
}

function selectTable(table: EntityTable, options: { resetColumn?: boolean } = {}) {
  selectedTableId.value = table.id;
  tableForm.value = {
    id: table.id,
    code: table.code,
    tableName: table.full_name,
    title: displayTableTitle(table),
    description: table.description ?? '',
    primaryKey: table.primary_key,
    createPhysical: false
  };
  syncColumnRowsFromSelectedTable();
  if (options.resetColumn !== false) resetColumnForm();
  if (!relationForm.value.sourceTableId) {
    relationForm.value = { ...relationForm.value, sourceTableId: table.id };
    applyRelationColumnDefaults('source');
  }
}

async function toggleTableCanvasVisibility(table: EntityTable) {
  const nextHiddenIds = new Set(hiddenCanvasTableIds.value);
  if (nextHiddenIds.has(table.id)) {
    nextHiddenIds.delete(table.id);
    message.value = `已将 ${displayTableTitle(table)} 显示到画布。`;
  } else {
    nextHiddenIds.add(table.id);
    message.value = `已从画布移出 ${displayTableTitle(table)}，metadata 和真实表未删除。`;
  }
  hiddenCanvasTableIds.value = nextHiddenIds;
  messageClass.value = 'lc-help';
  syncFlowFromGraph();
  await nextTick();
  if (flowNodes.value.length) fitView({ padding: 0.2, duration: 180 });
}

function selectColumn(table: EntityTable, column: EntityColumn) {
  selectTable(table);
  columnForm.value = {
    id: column.id,
    columnName: column.column_name,
    label: displayColumnLabel(table, column),
    dataType: column.data_type,
    storageKind: column.storage_kind,
    expression: column.expression ?? '',
    defaultValue: column.default_value ?? '',
    isRequired: column.is_required,
    isUnique: column.is_unique
  };
}

function selectRelation(relation: EntityRelation) {
  relationForm.value = {
    id: relation.id,
    sourceTableId: relation.source_table_id,
    sourceColumnName: relation.source_column_name,
    targetTableId: relation.target_table_id,
    targetColumnName: relation.target_column_name,
    relationType: relation.relation_type,
    isEnforced: relation.is_enforced
  };
}

function tableTitle(id: string) {
  const table = tables.value.find((item) => item.id === id);
  return table ? displayTableTitle(table) : id.slice(0, 8);
}

function relationTypeLabel(value: string) {
  const labels: Record<string, string> = {
    many_to_one: '多对一',
    one_to_many: '一对多',
    one_to_one: '一对一',
    many_to_many: '多对多'
  };
  return labels[value] ?? value;
}

function applyRelationColumnDefaults(role: 'source' | 'target') {
  const options = role === 'source' ? sourceColumnOptions.value : targetColumnOptions.value;
  const first = stringValue(options[0]?.value);
  if (role === 'source') {
    relationForm.value = { ...relationForm.value, sourceColumnName: first };
  } else {
    relationForm.value = { ...relationForm.value, targetColumnName: first || 'id' };
  }
}

function handleRelationFieldChange(payload: { field: LowCodeField }) {
  if (payload.field.field === 'sourceTableId') applyRelationColumnDefaults('source');
  if (payload.field.field === 'targetTableId') applyRelationColumnDefaults('target');
}

function handleTableAction(action: LowCodeAction) {
  if (action.code === 'delete') deleteSelectedTable();
  if (action.code === 'reset') resetTableForm();
}

function handleColumnAction(action: LowCodeAction) {
  if (action.code === 'delete') deleteSelectedColumn();
  if (action.code === 'reset') resetColumnForm();
}

function handleColumnRowsFieldChange(payload: {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
}) {
  if (payload.field.field !== 'columns') return;

  const previousRows = normalizeColumnRows(payload.previousValue);
  const nextRows = normalizeColumnRows(payload.value);
  const removedRows = previousRows.filter((previous) => {
    const previousName = stringValue(previous.columnName);
    if (!previousName) return false;
    return !nextRows.some((next) => {
      const nextId = stringValue(next.id);
      const previousId = stringValue(previous.id);
      return (previousId && nextId === previousId) || stringValue(next.columnName) === previousName;
    });
  });

  const changedRow = findChangedColumnRow(previousRows, nextRows);
  if (changedRow) setColumnFormFromRow(changedRow);

  const removedPersistedRow = removedRows.find((row) => stringValue(row.id) || stringValue(row.columnName));
  if (removedPersistedRow) {
    void deleteColumnFromRow(removedPersistedRow);
  }
}

function handleRelationAction(action: LowCodeAction) {
  if (action.code === 'reset') resetRelationForm();
}

function onNodeClick(event: NodeMouseEvent) {
  const table = tables.value.find((item) => item.id === event.node.id);
  if (table) selectTable(table);
}

function onEdgeClick(event: EdgeMouseEvent) {
  const relation = relations.value.find((item) => item.id === event.edge.id);
  if (relation) selectRelation(relation);
}

function clearColumnSelection() {
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
  relationForm.value = {
    ...relationForm.value,
    sourceTableId: connection.source,
    targetTableId: connection.target,
    sourceColumnName: parseHandleColumn(connection.sourceHandle),
    targetColumnName: parseHandleColumn(connection.targetHandle) || 'id'
  };
  message.value = '已根据 VueFlow 连线填充外键关系，确认后点击“保存关系”。';
  messageClass.value = 'lc-help';
}

async function openLoadTablesModal() {
  loadingPhysicalTables.value = true;
  message.value = '';
  try {
    const rows = await serviceApi.invoke<PhysicalTableOption[]>('entityDesign', 'listPhysicalTables', {});
    physicalTables.value = (rows ?? []).map((row) => ({
      ...row,
      checked: false
    }));
    loadTablesModalOpen.value = true;
  } catch (error) {
    message.value = error instanceof Error ? error.message : '加载真实表失败。';
    messageClass.value = 'lc-error';
  } finally {
    loadingPhysicalTables.value = false;
  }
}

async function confirmLoadTables() {
  const selectedRows = selectedPhysicalTables.value;
  if (!selectedRows.length) return;
  importingPhysicalTables.value = true;
  message.value = '';
  try {
    const result = await serviceApi.invoke<SyncPhysicalTablesResult>('entityDesign', 'syncPhysicalTables', {
      tables: selectedRows.map((table) => ({
        schemaName: table.schemaName,
        tableName: table.tableName
      }))
    });
    const firstLoadedTableId = stringValue(result.tables?.[0]?.tableId);
    if (firstLoadedTableId) selectedTableId.value = firstLoadedTableId;
    loadTablesModalOpen.value = false;
    message.value = `已加载 ${result.tables.length} 张真实表，新增 metadata ${result.imported} 张。`;
    messageClass.value = 'lc-help';
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '加载选中表失败。';
    messageClass.value = 'lc-error';
  } finally {
    importingPhysicalTables.value = false;
  }
}

async function syncSelectedTableFields() {
  if (!selectedTable.value) return;
  syncingColumns.value = true;
  message.value = '';
  try {
    const result = await serviceApi.invoke<SyncColumnsResult>('entityDesign', 'syncPhysicalColumns', {
      tableId: selectedTable.value.id
    });
    message.value = `已同步字段：新增 ${result.inserted} 个，跳过 ${result.skipped} 个已有字段。`;
    messageClass.value = 'lc-help';
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '同步字段失败。';
    messageClass.value = 'lc-error';
  } finally {
    syncingColumns.value = false;
  }
}

async function loadDesign() {
  loading.value = true;
  message.value = '';
  try {
    const graph = await serviceApi.invoke<DesignGraph>('entityDesign', 'listDesign', {});
    tables.value = graph.tables ?? [];
    relations.value = graph.relations ?? [];
    const tableIds = new Set(tables.value.map((table) => table.id));
    hiddenCanvasTableIds.value = canvasVisibilityInitialized.value
      ? new Set([...hiddenCanvasTableIds.value].filter((tableId) => tableIds.has(tableId)))
      : new Set(tableIds);
    canvasVisibilityInitialized.value = true;
    if (graph.setupRequired && graph.message) {
      message.value = graph.message;
      messageClass.value = 'lc-help';
    }
    const nextSelectedTable =
      tables.value.find((table) => table.id === selectedTableId.value) ?? tables.value[0];
    if (nextSelectedTable) {
      selectTable(nextSelectedTable, { resetColumn: !columnForm.value.columnName });
    } else {
      resetTableForm();
    }
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

async function saveTable(values: FormValues) {
  savingTable.value = true;
  message.value = '';
  try {
    const selectedNode = flowNodes.value.find((node) => node.id === selectedTableId.value);
    const saved = await serviceApi.invoke<EntityTable>('entityDesign', 'saveTable', {
      id: stringValue(values.id),
      code: stringValue(values.code),
      tableName: stringValue(values.tableName),
      title: stringValue(values.title),
      description: stringValue(values.description),
      primaryKey: stringValue(values.primaryKey) || 'id',
      createPhysical: booleanValue(values.createPhysical),
      positionX: selectedNode?.position.x ?? selectedTable.value?.position_x ?? 80,
      positionY: selectedNode?.position.y ?? selectedTable.value?.position_y ?? 80
    });
    selectedTableId.value = saved.id;
    message.value = `已保存表 ${saved.table_name}。`;
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
  const confirmResult = await VxeUI.modal.confirm({
    title: '确认删除实体',
    content: `删除实体 ${selectedTable.value.full_name}？默认只删除 metadata，不删除真实表。`
  });
  if (confirmResult !== 'confirm') return;
  savingTable.value = true;
  try {
    await serviceApi.invoke('entityDesign', 'deleteTable', {
      tableId: selectedTable.value.id,
      dropPhysical: false
    });
    resetTableForm();
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除表失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingTable.value = false;
  }
}

async function persistColumn(values: FormValues, sortOrder: number) {
  if (!selectedTable.value) return;
  const columnName = stringValue(values.columnName);
  if (!columnName) return;

  await serviceApi.invoke('entityDesign', 'saveColumn', {
    tableId: selectedTable.value.id,
    id: stringValue(values.id),
    columnName,
    label: displayColumnLabelFromName(columnName, values.label),
    dataType: stringValue(values.dataType) || 'text',
    storageKind: stringValue(values.storageKind) || 'physical',
    expression: stringValue(values.expression),
    defaultValue: stringValue(values.defaultValue),
    isRequired: booleanValue(values.isRequired),
    isUnique: booleanValue(values.isUnique),
    sortOrder
  });
}

async function saveColumn(values: FormValues) {
  if (!selectedTable.value) return;
  savingColumn.value = true;
  message.value = '';
  try {
    const columnName = stringValue(values.columnName);
    await persistColumn(values, selectedTable.value.columns.length + 10);
    message.value = `已保存列 ${columnName}。`;
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

async function saveColumnRows(values: FormValues) {
  if (!selectedTable.value) return;
  const rows = normalizeColumnRows(values.columns);
  savingColumn.value = true;
  message.value = '';
  try {
    for (const [index, row] of rows.entries()) {
      if (!stringValue(row.columnName)) continue;
      await persistColumn(row, (index + 1) * 10);
    }
    message.value = `已保存 ${rows.filter((row) => stringValue(row.columnName)).length} 个字段。`;
    messageClass.value = 'lc-help';
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存字段集合失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingColumn.value = false;
  }
}

async function deleteColumnByName(columnName: string) {
  if (!selectedTable.value || !columnName) return false;
  const confirmResult = await VxeUI.modal.confirm({
    title: '确认删除列',
    content: `删除列 ${columnName}？真实列会同步 DROP COLUMN。`
  });
  if (confirmResult !== 'confirm') return false;
  await serviceApi.invoke('entityDesign', 'deleteColumn', {
    tableId: selectedTable.value.id,
    columnName,
    dropPhysical: true
  });
  return true;
}

async function deleteColumnFromRow(row: FormValues) {
  if (!selectedTable.value) return;
  const columnName = stringValue(row.columnName);
  const existingColumn = selectedTable.value.columns.find((column) => column.column_name === columnName);
  if (!existingColumn || existingColumn.is_primary_key) {
    syncColumnRowsFromSelectedTable();
    return;
  }

  savingColumn.value = true;
  try {
    const deleted = await deleteColumnByName(columnName);
    if (!deleted) {
      syncColumnRowsFromSelectedTable();
      return;
    }
    resetColumnForm();
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除列失败。';
    messageClass.value = 'lc-error';
    syncColumnRowsFromSelectedTable();
  } finally {
    savingColumn.value = false;
  }
}

async function deleteSelectedColumn() {
  if (!selectedTable.value || !columnForm.value.columnName) return;
  const columnName = stringValue(columnForm.value.columnName);
  savingColumn.value = true;
  try {
    const deleted = await deleteColumnByName(columnName);
    if (!deleted) return;
    resetColumnForm();
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除列失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingColumn.value = false;
  }
}

async function saveRelation(values: FormValues) {
  savingRelation.value = true;
  message.value = '';
  try {
    const isEnforced = booleanValue(values.isEnforced);
    await serviceApi.invoke('entityDesign', isEnforced ? 'saveRelation' : 'saveItem', {
      ...(!isEnforced ? { resource: 'entity_design_relations' } : {}),
      id: stringValue(values.id),
      sourceTableId: stringValue(values.sourceTableId),
      source_table_id: stringValue(values.sourceTableId),
      sourceColumnName: stringValue(values.sourceColumnName),
      source_column_name: stringValue(values.sourceColumnName),
      targetTableId: stringValue(values.targetTableId),
      target_table_id: stringValue(values.targetTableId),
      targetColumnName: stringValue(values.targetColumnName),
      target_column_name: stringValue(values.targetColumnName),
      relationType: stringValue(values.relationType) || 'many_to_one',
      relation_type: stringValue(values.relationType) || 'many_to_one',
      isEnforced,
      is_enforced: isEnforced
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
  savingRelation.value = true;
  try {
    await serviceApi.invoke('entityDesign', 'deleteItem', {
      resource: 'entity_design_relations',
      id: relation.id,
      dropConstraint: false
    });
    await loadDesign();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除关系失败。';
    messageClass.value = 'lc-error';
  } finally {
    savingRelation.value = false;
  }
}

async function saveLayout() {
  savingLayout.value = true;
  try {
    await serviceApi.invoke('entityDesign', 'updateItem', {
      resource: 'entity_design_tables',
      data: flowNodes.value.map((node) => ({
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

onMounted(async () => {
  await loadEntityFormDefinitions();
  await loadDesign();
});
</script>

<style scoped>
.entity-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: calc(100vh - 60px);
  background: #edf1f5;
  color: #101828;
}

.entity-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex: none;
  min-height: 78px;
  border-bottom: 1px solid #d6dce5;
  background: #ffffff;
  padding: 12px 18px;
}

.toolbar-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.toolbar-kicker,
.panel-heading span {
  color: #667085;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.toolbar-copy h1,
.toolbar-copy p,
.panel-heading h2,
.panel-hint,
.flow-topbar p,
.designer-message {
  margin: 0;
}

.toolbar-copy h1 {
  font-size: 20px;
  line-height: 1.2;
}

.toolbar-copy p,
.panel-hint,
.flow-topbar,
.designer-message {
  color: #667085;
  font-size: 12px;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.physical-table-loader {
  display: grid;
  gap: 12px;
  min-height: 360px;
}

.physical-table-loader__summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: #475467;
  font-size: 13px;
}

.physical-table-loader__summary strong {
  color: #0f766e;
  font-size: 24px;
  line-height: 1;
}

.metadata-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 700;
}

.metadata-pill.is-linked {
  background: #e0f2fe;
  color: #0369a1;
}

.metadata-pill.is-new {
  background: #dcfce7;
  color: #15803d;
}

.load-table-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.entity-workspace {
  display: grid;
  grid-template-columns: 370px minmax(0, 1fr) 390px;
  flex: 1 1 0;
  min-height: 0;
}

.entity-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  background: #f8fafc;
  overflow: auto;
  padding: 12px;
}

.entity-panel-left {
  border-right: 1px solid #d6dce5;
  overflow: hidden;
}

.entity-panel-right {
  border-left: 1px solid #d6dce5;
  overflow: hidden;
}

.panel-section {
  display: grid;
  gap: 12px;
  min-width: 0;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: #ffffff;
  padding: 14px;
  box-shadow: 0 6px 18px rgb(15 23 42 / 4%);
}

.entity-left-panel-section,
.entity-right-panel-section {
  flex: 1 1 0;
  min-height: 0;
}

.entity-left-panel-section {
  grid-template-rows: minmax(0, 1fr);
}

.entity-right-panel-section {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.entity-left-tabs-form,
.entity-right-tabs-form {
  height: 100%;
  min-height: 0;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.panel-heading > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.panel-heading h2 {
  font-size: 15px;
  line-height: 1.2;
}

.panel-heading strong {
  color: #0f62fe;
  font-size: 18px;
}

.panel-heading button,
.relation-list > li > button:last-child {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #ffffff;
  color: #344054;
  cursor: pointer;
}

.panel-heading button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.designer-form {
  min-width: 0;
}

.designer-form :deep(.lc-form) {
  gap: 12px;
}

.designer-form :deep(.lc-form-layout),
.designer-form :deep(.lc-form-grid) {
  gap: 10px;
}

.designer-form :deep(.lc-form-row) {
  flex-wrap: nowrap;
  gap: 10px;
}

.designer-form :deep(.lc-form-col) {
  min-width: 0;
}

.designer-form :deep(.lc-field) {
  gap: 5px;
}

.designer-form :deep(.lc-field label) {
  color: #344054;
  font-size: 12px;
  font-weight: 600;
}

.designer-form :deep(.lc-actions) {
  gap: 8px;
  padding-top: 2px;
}

.designer-message {
  border: 1px solid #dfe5ec;
  border-radius: 6px;
  background: #ffffff;
  padding: 9px 10px;
}

.relation-list,
.entity-node ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.entity-table-grid {
  border-radius: 6px;
  overflow: hidden;
}

.entity-table-name {
  display: grid;
  width: 100%;
  gap: 2px;
  min-height: 38px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #101828;
  cursor: pointer;
  padding: 5px 6px;
  text-align: left;
}

.entity-table-name:hover,
.entity-table-name.active {
  background: #eef6ff;
}

.entity-table-name span,
.entity-table-name small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-table-name span {
  font-size: 13px;
  font-weight: 700;
}

.entity-table-name small {
  color: #667085;
  font-size: 12px;
}

.canvas-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  padding: 0 6px;
}

.canvas-pill.is-visible {
  background: #dcfce7;
  color: #15803d;
}

.canvas-pill.is-hidden {
  background: #f1f5f9;
  color: #64748b;
}

.canvas-toggle {
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #ffffff;
  color: #344054;
  cursor: pointer;
  font-size: 12px;
  line-height: 24px;
  padding: 0 8px;
}

.canvas-toggle:hover {
  border-color: #60a5fa;
  color: #0f62fe;
}

.entity-flow-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: #f7f9fc;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.16) 1px, transparent 1px);
  background-size: 28px 28px;
}

.flow-topbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 8px 20px rgb(15 23 42 / 5%);
  padding: 7px 10px;
  pointer-events: none;
}

.flow-topbar > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flow-topbar span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border: 1px solid #dfe5ec;
  border-radius: 999px;
  background: #ffffff;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
  padding: 0 9px;
}

.entity-flow {
  width: 100%;
  height: 100%;
}

.entity-node {
  width: 320px;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 30px rgb(15 23 42 / 10%);
}

.entity-node.active {
  border-color: #0f62fe;
  box-shadow:
    0 0 0 3px rgb(15 98 254 / 16%),
    0 14px 30px rgb(15 23 42 / 12%);
}

.entity-node header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 8px;
  min-height: 52px;
  border-bottom: 1px solid #e4e7ec;
  background: linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
  padding: 9px 12px;
}

.node-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.entity-node strong,
.entity-node small,
.column-name,
.column-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-node strong {
  color: #101828;
  font-size: 14px;
  line-height: 1.25;
}

.entity-node small {
  color: #667085;
  font-size: 11px;
}

.entity-node header > span {
  display: grid;
  min-width: 28px;
  height: 28px;
  place-items: center;
  align-self: center;
  border-radius: 999px;
  background: #0f62fe;
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

.entity-node li {
  position: relative;
  display: grid;
  grid-template-columns: minmax(74px, 1fr) minmax(74px, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  border-bottom: 1px solid #eef2f6;
  cursor: pointer;
  padding: 0 12px;
  font-size: 12px;
}

.entity-node li:last-child {
  border-bottom: 0;
}

.entity-node li:hover,
.entity-node li.selected {
  background: #f1f7ff;
}

.column-name {
  color: #101828;
  font-weight: 700;
}

.column-label {
  color: #667085;
}

.entity-node li.primary .column-name::before,
.entity-node li.virtual .column-name::before {
  display: inline-flex;
  margin-right: 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.4;
  padding: 0 3px;
}

.entity-node li.primary .column-name::before {
  content: "PK";
  background: #fff7ed;
  color: #c2410c;
}

.entity-node li.virtual .column-name::before {
  content: "V";
  background: #f0fdf4;
  color: #15803d;
}

.entity-node em {
  justify-self: end;
  border: 1px solid #e4e7ec;
  border-radius: 999px;
  background: #f8fafc;
  color: #475467;
  font-size: 11px;
  font-style: normal;
  line-height: 20px;
  padding: 0 7px;
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
  gap: 8px;
  color: #667085;
  pointer-events: none;
  text-align: center;
  padding: 24px;
}

.empty-flow i {
  color: #0f62fe;
  font-size: 38px;
}

.empty-flow strong {
  color: #101828;
  font-size: 15px;
}

.empty-flow span {
  max-width: 360px;
  font-size: 13px;
}

.relation-section {
  gap: 13px;
}

.relation-list {
  display: grid;
  gap: 6px;
}

.relation-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  gap: 6px;
}

.relation-list > li > button:first-child {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 34px;
  border: 1px solid #dfe5ec;
  border-radius: 6px;
  background: #f8fafc;
  color: #344054;
  cursor: pointer;
  padding: 0 8px;
  text-align: left;
}

.relation-list span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.relation-list em {
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 11px;
  font-style: normal;
  line-height: 20px;
  padding: 0 7px;
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

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: #0f62fe;
  stroke-width: 3;
}

@media (max-width: 1260px) {
  .entity-workspace {
    grid-template-columns: 340px minmax(0, 1fr) 360px;
  }
}

@media (max-width: 1060px) {
  .entity-workspace {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .entity-panel-left,
  .entity-panel-right {
    border: 0;
    border-bottom: 1px solid #d6dce5;
  }

  .entity-panel-left,
  .entity-panel-right {
    flex: none;
    min-height: 65vh;
    overflow: hidden;
  }

  .entity-flow-shell {
    min-height: 580px;
  }
}

@media (max-width: 640px) {
  .entity-toolbar,
  .flow-topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .designer-form :deep(.lc-form-row) {
    flex-wrap: wrap;
  }

  .entity-node {
    width: 292px;
  }
}
</style>
