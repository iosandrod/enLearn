<template>
  <section class="permission-editor">
    <header class="permission-editor__header">
      <div>
        <p class="permission-editor__eyebrow">系统设置 / 权限管理</p>
        <h1>路由权限矩阵</h1>
        <p class="permission-editor__description">按角色配置菜单、页面及其动作权限，保存时会覆盖该角色的完整权限集合。</p>
      </div>

      <div class="permission-editor__actions">
        <button class="button button--quiet" type="button" :disabled="loading || saving" @click="openRoleEditor('create')">
          <i class="ri-add-line" aria-hidden="true" />
          新增角色
        </button>
        <button class="button button--quiet" type="button" :disabled="loading || saving || !selectedRoleId" @click="openRoleEditor('child')">
          <i class="ri-node-tree" aria-hidden="true" />
          添加子角色
        </button>
        <button class="button button--quiet" type="button" :disabled="loading || saving || !selectedRoleId" @click="openRoleEditor('edit')">
          <i class="ri-edit-line" aria-hidden="true" />
          修改角色
        </button>
        <button class="button button--danger" type="button" :disabled="loading || saving || !selectedRoleId || selectedRoleHasChildren" @click="deleteSelectedRole">
          <i class="ri-delete-bin-line" aria-hidden="true" />
          删除角色
        </button>
        <button class="button button--quiet" type="button" :disabled="loading || saving" @click="resetMatrix">
          <i class="ri-refresh-line" aria-hidden="true" />
          重置
        </button>
        <button class="button button--primary" type="button" :disabled="loading || saving || !selectedRoleId" @click="saveMatrix">
          <i :class="saving ? 'ri-loader-4-line permission-editor__spin' : 'ri-save-line'" aria-hidden="true" />
          {{ saving ? '保存中' : '保存' }}
        </button>
      </div>
    </header>

    <section class="role-tree-panel">
      <header class="role-tree-panel__header">
        <div>
          <strong>角色树</strong>
          <span>选择角色后编辑该角色的路由权限</span>
        </div>
        <span class="role-tree-panel__selected">当前：{{ selectedRole?.name || selectedRole?.code || '未选择' }}</span>
      </header>
      <div class="role-tree-panel__table">
        <vxe-grid
          class="role-tree-grid"
          border
          show-overflow
          height="100%"
          :data="roleTreeRows"
          :columns="roleTreeColumns"
          :row-config="{ keyField: 'id', isCurrent: true }"
          :tree-config="{ children: 'children', expandAll: true }"
          @current-row-change="handleRoleChange"
        >
          <template #role-name="{ row }">
            <span class="role-name-cell">
              <i :class="row.is_system ? 'ri-shield-star-line' : 'ri-user-settings-line'" aria-hidden="true" />
              <strong>{{ row.name || row.code }}</strong>
            </span>
          </template>
          <template #role-status="{ row }">
            <span :class="['role-status', row.status === 'active' ? 'is-active' : 'is-inactive']">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </span>
          </template>
        </vxe-grid>
      </div>
    </section>

    <div class="permission-tabs" role="tablist" aria-label="权限类型">
      <button class="permission-tab is-active" type="button" role="tab" aria-selected="true">
        <i class="ri-route-line" aria-hidden="true" />
        权限矩阵
      </button>
      <button class="permission-tab" type="button" role="tab" aria-selected="false" @click="showUnavailable('数据权限')">
        <i class="ri-database-2-line" aria-hidden="true" />
        数据权限
      </button>
      <button class="permission-tab" type="button" role="tab" aria-selected="false" @click="showUnavailable('字段权限')">
        <i class="ri-list-settings-line" aria-hidden="true" />
        字段权限
      </button>
    </div>

    <div class="permission-toolbar">
      <label class="permission-search">
        <i class="ri-search-line" aria-hidden="true" />
        <input v-model="searchText" type="search" placeholder="搜索资源名称、编码或路径" />
      </label>
      <label class="select-all-control">
        <input type="checkbox" :checked="allVisibleSelected" :indeterminate.prop="someVisibleSelected && !allVisibleSelected" @change="toggleVisibleRows" />
        <span>全选当前资源</span>
      </label>
      <span class="permission-count">已选择 {{ selectedPermissionIds.size }} 项权限</span>
    </div>

    <p v-if="errorMessage" class="permission-message permission-message--error" role="alert">
      <i class="ri-error-warning-line" aria-hidden="true" />
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="permission-message permission-message--success" role="status">
      <i class="ri-checkbox-circle-line" aria-hidden="true" />
      {{ successMessage }}
    </p>

    <div class="permission-table-wrap" :class="{ 'is-loading': loading }">
      <vxe-grid
        class="permission-table"
        border
        show-overflow
        height="100%"
        :data="treeRows"
        :columns="gridColumns"
        :row-config="{ keyField: 'id' }"
        :tree-config="{ children: 'children', expandAll: true }"
      >
        <template #resource="{ row }">
          <span class="resource-cell">
            <i :class="row.route_type === 'group' ? 'ri-folder-3-line' : 'ri-file-list-3-line'" aria-hidden="true" />
            <span class="resource-title" :title="row.path || row.code">{{ row.title || row.code }}</span>
            <small v-if="row.route_type !== 'group'">{{ row.code }}</small>
          </span>
        </template>
        <template v-for="column in columns" :key="column.code" #[`permission-${column.code}-header`]> 
          <label class="column-check">
            <input type="checkbox" :checked="isColumnSelected(column.code)" :indeterminate.prop="isColumnPartiallySelected(column.code)" @change="toggleColumn(column.code)" />
            <span>{{ column.label }}</span>
          </label>
        </template>
        <template v-for="column in columns" :key="`cell-${column.code}`" #[`permission-${column.code}`]="{ row }">
          <label v-if="row.actions[column.code]" class="permission-check" :title="row.actions[column.code].code">
            <input v-model="row.actions[column.code].selected" type="checkbox" @change="syncRowSelection(row)" />
            <span class="checkmark" aria-hidden="true"><i class="ri-check-line" /></span>
          </label>
          <span v-else class="permission-empty" aria-hidden="true">—</span>
        </template>
      </vxe-grid>
      <div v-if="loading" class="permission-loading"><i class="ri-loader-4-line permission-editor__spin" aria-hidden="true" />正在加载权限矩阵…</div>
      <div v-if="!filteredRows.length && !loading" class="permission-empty-state">没有匹配的资源</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { VxeUI } from 'vxe-pc-ui';
import { confirmLowCodePage } from '@enlearn/lowcode-framework/runtime';

type Role = {
  id: string;
  code?: string;
  name?: string;
  description?: string | null;
  parent_id?: string | null;
  status?: string;
  sort_order?: number;
  is_system?: boolean;
  children?: Role[];
};
type RoleEditorRecord = Role & { permission_codes?: string[] };
type MatrixColumn = { code: string; label: string };
type PermissionCell = { id: string; code: string; name?: string; selected: boolean };
type MatrixRow = {
  id: string;
  code: string;
  title?: string;
  path?: string;
  route_type?: string;
  depth: number;
  actions: Record<string, PermissionCell | null>;
  selected: boolean;
  parent_id?: string | null;
  children?: MatrixRow[];
};
type MatrixResponse = {
  roles?: Role[];
  selectedRoleId?: string;
  columns?: MatrixColumn[];
  rows?: MatrixRow[];
};

const route = useRoute();
const router = useRouter();
const serviceApi = useServiceApi();
const roles = ref<Role[]>([]);
const columns = ref<MatrixColumn[]>([]);
const rows = ref<MatrixRow[]>([]);
const selectedRoleId = ref('');
const searchText = ref('');
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const initialSelection = ref<string[]>([]);

const selectedRole = computed(() => roles.value.find((role) => role.id === selectedRoleId.value));
const selectedRoleHasChildren = computed(() => roles.value.some((role) => role.parent_id === selectedRoleId.value));

const roleTreeRows = computed(() => {
  const nodes = new Map<string, Role>();
  const roots: Role[] = [];
  [...roles.value]
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) || String(left.name ?? left.code ?? '').localeCompare(String(right.name ?? right.code ?? '')))
    .forEach((role) => nodes.set(role.id, { ...role, children: [] }));
  nodes.forEach((node) => {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  });
  return roots;
});

const roleTreeColumns = [
  { field: 'name', title: '角色名称', treeNode: true, minWidth: 220, slots: { default: 'role-name' } },
  { field: 'code', title: '角色编码', minWidth: 170 },
  { field: 'status', title: '状态', width: 90, align: 'center', slots: { default: 'role-status' } },
  { field: 'sort_order', title: '排序', width: 70, align: 'center' },
];

const filteredRows = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  if (!query) return rows.value;
  return rows.value.filter((row) => [row.title, row.code, row.path].some((value) => String(value ?? '').toLowerCase().includes(query)));
});

const treeRows = computed(() => {
  const nodes = new Map<string, MatrixRow>();
  const roots: MatrixRow[] = [];
  filteredRows.value.forEach((row) => nodes.set(row.id, { ...row, children: [] }));
  filteredRows.value.forEach((row) => {
    const node = nodes.get(row.id)!;
    const parent = row.parent_id ? nodes.get(row.parent_id) : undefined;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  });
  return roots;
});

const gridColumns = computed(() => [
  {
    field: 'title',
    title: '菜单 / 页面',
    treeNode: true,
    minWidth: 360,
    slots: { default: 'resource' }
  },
  ...columns.value.map((column) => ({
    field: column.code,
    title: column.label,
    width: 112,
    align: 'center',
    slots: {
      header: `permission-${column.code}-header`,
      default: `permission-${column.code}`
    }
  }))
]);

const selectedPermissionIds = computed(() => {
  const selected = new Set<string>();
  rows.value.forEach((row) => Object.values(row.actions).forEach((cell) => {
    if (cell?.selected) selected.add(cell.id);
  }));
  return selected;
});

const allVisibleSelected = computed(() => filteredRows.value.some(Boolean) && filteredRows.value.every((row) => rowHasPermission(row)));
const someVisibleSelected = computed(() => filteredRows.value.some((row) => rowHasPermission(row)));

function rowHasPermission(row: MatrixRow) {
  const cells = Object.values(row.actions).filter((cell): cell is PermissionCell => Boolean(cell));
  return cells.length > 0 && cells.every((cell) => cell.selected);
}

function isColumnSelected(code: string) {
  const cells = filteredRows.value.map((row) => row.actions[code]).filter((cell): cell is PermissionCell => Boolean(cell));
  return cells.length > 0 && cells.every((cell) => cell.selected);
}

function isColumnPartiallySelected(code: string) {
  const cells = filteredRows.value.map((row) => row.actions[code]).filter((cell): cell is PermissionCell => Boolean(cell));
  return cells.some((cell) => cell.selected) && !cells.every((cell) => cell.selected);
}

function syncRowSelection(row: MatrixRow) {
  row.selected = Object.values(row.actions).some((cell) => cell?.selected === true);
}

function toggleVisibleRows(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  filteredRows.value.forEach((row) => {
    Object.values(row.actions).forEach((cell) => { if (cell) cell.selected = checked; });
    syncRowSelection(row);
  });
}

function toggleColumn(code: string) {
  const next = !isColumnSelected(code);
  filteredRows.value.forEach((row) => {
    const cell = row.actions[code];
    if (cell) cell.selected = next;
    syncRowSelection(row);
  });
}

function cloneSelection() {
  return [...selectedPermissionIds.value];
}

async function loadMatrix(roleId?: string) {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const result = await serviceApi.invoke<MatrixResponse>('user', 'listPermissionMatrix', {
      roleId: roleId || String(route.query.roleId ?? '')
    });
    roles.value = Array.isArray(result?.roles) ? result.roles : [];
    columns.value = Array.isArray(result?.columns) ? result.columns : [];
    rows.value = Array.isArray(result?.rows) ? result.rows : [];
    selectedRoleId.value = result?.selectedRoleId || roles.value[0]?.id || '';
    initialSelection.value = cloneSelection();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '权限矩阵加载失败。';
  } finally {
    loading.value = false;
  }
}

async function changeRole() {
  await loadMatrix(selectedRoleId.value);
}

function handleRoleChange(payload: { row?: Role } | undefined) {
  const nextRoleId = payload?.row?.id;
  if (!nextRoleId || nextRoleId === selectedRoleId.value) return;
  selectedRoleId.value = nextRoleId;
  void loadMatrix(nextRoleId);
}

async function openRoleEditor(mode: 'create' | 'child' | 'edit') {
  const role = selectedRole.value;
  if ((mode === 'child' || mode === 'edit') && !role) return;
  const isEdit = mode === 'edit';
  const initialRole: RoleEditorRecord = isEdit && role
    ? role
    : {
        id: '',
        code: '',
        name: '',
        description: '',
        parent_id: mode === 'child' ? role?.id ?? null : null,
        status: 'active',
        sort_order: 0,
        is_system: false,
      };
  try {
    let editorRole = initialRole;
    if (isEdit && role) {
      const detail = await serviceApi.invoke<RoleEditorRecord>('admin', 'getRole', {
        filters: { id: role.id },
      });
      editorRole = { ...initialRole, ...(detail ?? {}) };
    }
    const result = await confirmLowCodePage({
      pageCode: 'role-management-edit',
      includeData: true,
      ...(isEdit && role ? { filters: { id: role.id } } : {}),
      formInitialValues: {
        'role-edit-form': {
          id: editorRole.id ?? '',
          code: editorRole.code ?? '',
          name: editorRole.name ?? '',
          description: editorRole.description ?? '',
          parent_id: editorRole.parent_id ?? null,
          status: editorRole.status ?? 'active',
          sort_order: editorRole.sort_order ?? 0,
          is_system: editorRole.is_system ?? false,
          permission_codes: editorRole.permission_codes ?? [],
        },
      },
      submitOnConfirm: true,
      serviceApi: serviceApi as Parameters<typeof confirmLowCodePage>[0]['serviceApi'],
      router: router as Parameters<typeof confirmLowCodePage>[0]['router'],
      route: route as Parameters<typeof confirmLowCodePage>[0]['route'],
      locale: 'zh-CN',
      title: mode === 'edit' ? '修改角色' : mode === 'child' ? '添加子角色' : '新增角色',
      confirmLabel: '保存',
      cancelLabel: '取消',
      dialog: { id: 'permission-role-editor-dialog' },
    });
    if (result.action === 'cancel' || result.action === 'close') return;
    const saved = result.payload?.savedRecord ?? result.payload?.formModels?.['role-edit-form'];
    const savedId = String(saved?.id ?? editorRole.id ?? '').trim();
    await loadMatrix(savedId || undefined);
    if (savedId) selectedRoleId.value = savedId;
    successMessage.value = '角色已保存。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '角色保存失败。';
  }
}

async function deleteSelectedRole() {
  const role = selectedRole.value;
  if (!role || selectedRoleHasChildren.value) return;
  const confirmed = await VxeUI.modal.confirm({
    title: '删除角色',
    content: `确定删除角色“${role.name || role.code}”吗？`,
  });
  if (confirmed !== 'confirm') return;
  try {
    await serviceApi.invoke('admin', 'deleteItem', { resource: 'admin_roles', id: role.id });
    await loadMatrix();
    successMessage.value = '角色已删除。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '角色删除失败。';
  }
}

function resetMatrix() {
  const initial = new Set(initialSelection.value);
  rows.value.forEach((row) => Object.values(row.actions).forEach((cell) => { if (cell) cell.selected = initial.has(cell.id); }));
  rows.value.forEach(syncRowSelection);
  successMessage.value = '';
}

async function saveMatrix() {
  if (!selectedRoleId.value) return;
  saving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await serviceApi.invoke('user', 'savePermissionMatrix', {
      roleId: selectedRoleId.value,
      permissionIds: [...selectedPermissionIds.value],
      mode: 'overwrite'
    });
    initialSelection.value = cloneSelection();
    successMessage.value = '权限矩阵已保存。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '权限矩阵保存失败。';
  } finally {
    saving.value = false;
  }
}

function showUnavailable(tab: string) {
  successMessage.value = `${tab}配置将在后续版本开放。`;
}

onMounted(() => { void loadMatrix(); });
</script>

<style scoped>
.permission-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  padding: 24px 28px 40px;
  color: #1f2937;
  background: #f7f8fa;
  box-sizing: border-box;
  overflow: hidden;
}
.permission-editor__header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
.permission-editor__eyebrow { margin: 0 0 6px; color: #667085; font-size: 12px; }
.permission-editor h1 { margin: 0; color: #111827; font-size: 24px; line-height: 1.2; }
.permission-editor__description { margin: 8px 0 0; color: #667085; font-size: 13px; }
.permission-editor__actions { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.button--danger { border-color: #f0b3b3; background: #fff; color: #c43232; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border: 1px solid #d0d5dd; border-radius: 4px; padding: 0 13px; cursor: pointer; font-size: 13px; }
.button:disabled { cursor: not-allowed; opacity: .55; }
.button--quiet { background: #fff; color: #344054; }
.button--primary { border-color: #1769e0; background: #1769e0; color: #fff; }
.role-tree-panel { display: flex; flex: 0 0 220px; min-height: 0; flex-direction: column; margin-bottom: 14px; border: 1px solid #dfe3e8; border-radius: 5px; background: #fff; }
.role-tree-panel__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #edf0f3; padding: 10px 14px; }
.role-tree-panel__header strong { color: #344054; font-size: 13px; }
.role-tree-panel__header span { margin-left: 8px; color: #98a2b3; font-size: 12px; }
.role-tree-panel__selected { margin-left: auto !important; color: #1769e0 !important; }
.role-tree-panel__table { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.role-tree-grid { width: 100%; height: 100%; }
.role-tree-grid :deep(.vxe-header--column) { height: 36px; color: #475467; font-size: 12px; font-weight: 600; }
.role-tree-grid :deep(.vxe-body--row) { height: 38px; cursor: pointer; }
.role-tree-grid :deep(.vxe-body--row.row--current) { background: #edf5ff; }
.role-name-cell { display: inline-flex; align-items: center; gap: 7px; color: #344054; }
.role-name-cell i { color: #1769e0; }
.role-status { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; border-radius: 10px; padding: 2px 7px; font-size: 11px; }
.role-status.is-active { background: #ecfdf3; color: #137a4b; }
.role-status.is-inactive { background: #f2f4f7; color: #667085; }
.permission-tabs { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid #dfe3e8; }
.permission-tab { display: inline-flex; align-items: center; gap: 7px; position: relative; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #667085; cursor: pointer; padding: 11px 14px; font-size: 13px; }
.permission-tab.is-active { border-bottom-color: #1769e0; color: #1769e0; font-weight: 600; }
.permission-toolbar { display: flex; align-items: center; gap: 18px; padding: 16px 0 12px; }
.permission-search { display: flex; align-items: center; gap: 8px; width: min(360px, 100%); height: 34px; border: 1px solid #d0d5dd; border-radius: 4px; background: #fff; padding: 0 10px; color: #98a2b3; }
.permission-search input { width: 100%; border: 0; outline: 0; color: #344054; font-size: 13px; }
.select-all-control { display: inline-flex; align-items: center; gap: 7px; color: #344054; font-size: 13px; }
.select-all-control input, .column-check input { accent-color: #1769e0; }
.permission-count { margin-left: auto; color: #667085; font-size: 12px; }
.permission-message { display: flex; align-items: center; gap: 7px; margin: 0 0 12px; border-radius: 4px; padding: 9px 11px; font-size: 13px; }
.permission-message--error { background: #fff1f0; color: #c43232; }
.permission-message--success { background: #ecfdf3; color: #137a4b; }
.permission-table-wrap { position: relative; flex: 1 1 auto; min-height: 280px; overflow: hidden; border: 1px solid #dfe3e8; border-radius: 5px; background: #fff; }
.permission-table { width: 100%; height: 100%; min-width: 720px; }
.permission-table :deep(.vxe-table--header-wrapper) { background: #f8fafc; }
.permission-table :deep(.vxe-header--column) { height: 46px; color: #475467; font-size: 12px; font-weight: 600; }
.permission-table :deep(.vxe-body--row) { height: 47px; }
.permission-table :deep(.vxe-body--row:hover) { background: #f8fbff; }
.permission-table :deep(.vxe-tree-cell) { min-width: 0; }
.permission-table :deep(.vxe-cell--tree-node) { color: #718096; }
.permission-table th, .permission-table td { border-bottom: 1px solid #edf0f3; border-right: 1px solid #edf0f3; }
.permission-table th:last-child, .permission-table td:last-child { border-right: 0; }
.permission-table thead th { height: 46px; background: #f8fafc; color: #475467; font-size: 12px; font-weight: 600; text-align: center; }
.resource-column { width: 43%; padding: 0 14px; text-align: left !important; }
.action-column { width: 11.4%; }
.column-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.permission-table tbody tr:hover { background: #f8fbff; }
.permission-table tbody tr.is-group { background: #fafbfc; }
.resource-cell { display: flex; align-items: center; min-height: 47px; gap: 8px; padding: 0 14px; color: #344054; }
.resource-cell > i { color: #718096; font-size: 16px; }
.resource-indent { flex: none; }
.resource-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.resource-cell small { overflow: hidden; margin-left: auto; color: #98a2b3; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.action-cell { width: 11.4%; text-align: center; }
.permission-check { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.permission-check input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.checkmark { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; border: 1px solid #c8d0da; border-radius: 3px; background: #fff; color: transparent; font-size: 14px; }
.permission-check input:checked + .checkmark { border-color: #1769e0; background: #1769e0; color: #fff; }
.permission-check input:focus-visible + .checkmark { outline: 2px solid #9bc1ff; outline-offset: 2px; }
.permission-empty { color: #c3c9d2; font-size: 13px; }
.empty-cell { height: 160px; color: #98a2b3; text-align: center; font-size: 13px; }
.permission-loading { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(255,255,255,.78); color: #667085; font-size: 13px; }
.permission-empty-state { position: absolute; inset: 47px 0 0; display: flex; align-items: center; justify-content: center; color: #98a2b3; font-size: 13px; pointer-events: none; }
.permission-editor__spin { animation: permission-spin 1s linear infinite; }
@keyframes permission-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .permission-editor { height: 100dvh; padding: 18px 14px 32px; }
  .permission-editor__header { align-items: stretch; flex-direction: column; gap: 14px; }
  .permission-editor__actions { align-items: flex-end; }
  .role-tree-panel { flex-basis: 190px; }
  .role-tree-panel__header { align-items: flex-start; flex-direction: column; }
  .role-tree-panel__selected { margin-left: 0 !important; }
  .permission-toolbar { align-items: stretch; flex-direction: column; gap: 10px; }
  .permission-search { width: auto; }
  .permission-count { margin-left: 0; }
}
</style>
