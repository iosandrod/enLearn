import type {
  LowCodeField,
  LowCodeFormLayoutNode,
  LowCodePageBlock,
  LowCodePageDataSource,
} from '~/types/lowcode';
import type {
  VisualEditorBlockData,
  VisualEditorModelValue,
  VisualEditorPage,
} from '@/visual-editor/visual-editor.utils';

type ConversionResult = {
  blocks: LowCodePageBlock[];
  dataSources: Record<string, LowCodePageDataSource>;
};

type VisualBlockProps = Record<string, unknown>;

const componentMap: Record<string, LowCodeField['component']> = {
  input: 'vxe-input',
  select: 'vxe-select',
  switch: 'vxe-switch',
  'vxe-input': 'vxe-input',
  'vxe-textarea': 'vxe-textarea',
  'vxe-select': 'vxe-select',
  'vxe-switch': 'vxe-switch',
  'vxe-password-input': 'vxe-password-input',
  'vxe-checkbox-group': 'vxe-checkbox-group',
  'vxe-radio-group': 'vxe-radio-group',
  'vxe-tree-select': 'vxe-tree-select',
};

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

function readNumber(value: unknown, fallback?: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : fallback;
  } catch {
    return fallback;
  }
}

function readJsonArray(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function normalizeField(row: Record<string, unknown>) {
  const field = readString(row.field);
  const label = readString(row.label, field);
  if (!field || !label) return null;

  const componentName = readString(row.component, 'vxe-input');
  const component = componentMap[componentName] ?? 'vxe-input';
  const options = readJsonArray(row.optionsJson);
  const required = readBoolean(row.required, false);
  const placeholder = readString(row.placeholder);
  const help = readString(row.help);
  const span = readNumber(row.span);

  return {
    field,
    label,
    component,
    ...(placeholder ? { props: { placeholder, clearable: true } } : {}),
    ...(options ? { options } : {}),
    ...(help ? { help } : {}),
    ...(span ? { span } : {}),
    ...(required
      ? { rules: [{ required: true, message: `${label} is required` }] }
      : {}),
  };
}

function normalizeColumn(row: Record<string, unknown>) {
  const field = readString(row.field);
  const title = readString(row.title, field);
  if (!field || !title) return null;

  const formatter = readJsonObject(row.formatter, {});

  return {
    field,
    title,
    ...(readNumber(row.width) ? { width: readNumber(row.width) } : {}),
    ...(readNumber(row.minWidth) ? { minWidth: readNumber(row.minWidth) } : {}),
    ...(Object.keys(formatter).length ? { formatter } : {}),
  };
}

function toBlockId(value: unknown, fallback: string) {
  return readString(value, fallback)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^-+|-+$/g, '') || fallback;
}

function isVisualEditorModel(value: unknown): value is VisualEditorModelValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { pages?: unknown }).pages === 'object' &&
    (value as { pages?: unknown }).pages !== null
  );
}

function isDesignerFieldBlock(block: VisualEditorBlockData) {
  return ['input', 'picker', 'switch', 'radio', 'checkbox'].includes(block.componentKey);
}

function normalizeSlotItems(slots: unknown) {
  if (!isPlainRecord(slots)) return [];

  return Object.values(slots).filter(
    (slot): slot is Record<string, unknown> =>
      isPlainRecord(slot) && Array.isArray(slot.children)
  );
}

function toTabsSlotKey(value: string, index: number) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return `tab_${normalized || index + 1}`;
}

function convertDesignedBlockToLayoutNode(
  block: VisualEditorBlockData
): LowCodeFormLayoutNode | null {
  if (isDesignerFieldBlock(block)) {
    const field = readString(block.props?.name);
    return field ? { kind: 'field', field } : null;
  }

  if (block.componentKey === 'layout') {
    const columns = normalizeSlotItems(block.props?.slots)
      .map((slot) => ({
        span: readNumber(slot.span),
        blocks: convertDesignedBlocksToLayout(slot.children as VisualEditorBlockData[]),
      }))
      .filter((column) => column.blocks.length > 0);

    return columns.length
      ? {
          kind: 'row',
          gutter: readNumber(block.props?.gutter),
          columns,
        }
      : null;
  }

  const nestedBlocks = normalizeSlotItems(block.props?.slots).flatMap((slot) =>
    convertDesignedBlocksToLayout(slot.children as VisualEditorBlockData[])
  );

  return nestedBlocks.length ? { kind: 'stack', blocks: nestedBlocks } : null;
}

function convertDesignedBlocksToLayout(blocks: VisualEditorBlockData[] = []) {
  return blocks
    .map((block) => convertDesignedBlockToLayoutNode(block))
    .filter(Boolean) as LowCodeFormLayoutNode[];
}

function readFormDesignerLayout(value: unknown) {
  if (!isVisualEditorModel(value)) return undefined;

  const blocks = value.pages?.['/']?.blocks;
  if (!Array.isArray(blocks)) return undefined;

  const layout = convertDesignedBlocksToLayout(blocks);
  return layout.length ? layout : undefined;
}

function convertSearchForm(block: VisualEditorBlockData): LowCodePageBlock {
  const props = block.props as VisualBlockProps;
  const fields = normalizeRows(props.fields).map(normalizeField).filter(Boolean);
  const sourceKey = readString(props.sourceKey, 'records');
  const layout = readFormDesignerLayout(props.formDesignerModel);

  return {
    id: toBlockId(props.blockId, block._vid),
    kind: 'searchForm',
    title: readString(props.title, 'Query Conditions'),
    targetSourceKey: sourceKey,
    schema: {
      fields,
      ...(layout ? { layout } : {}),
      actions: [
        {
          code: 'submit',
          label: '查询',
          type: 'submit',
          status: 'primary',
        },
        {
          code: 'reset',
          label: '重置',
          type: 'reset',
        },
      ],
    },
  } as LowCodePageBlock;
}

function upsertFormDataSource(
  dataSources: Record<string, LowCodePageDataSource>,
  key: string,
  props: VisualBlockProps,
  autoLoad = false
) {
  if (!key) return;

  const serviceName = readString(props.serviceName, 'admin');
  const serviceMethod = readString(props.serviceMethod, readString(props.saveMethod, 'save'));
  const saveMethod = readString(props.saveMethod);
  const postData = readJsonObject(props.postDataJson, {});

  dataSources[key] = {
    key,
    label: readString(props.title, key),
    serviceName,
    serviceMethod,
    ...(saveMethod ? { saveMethod } : {}),
    ...(Object.keys(postData).length ? { postData } : {}),
    autoLoad,
  };
}

function convertEditForm(
  block: VisualEditorBlockData,
  dataSources: Record<string, LowCodePageDataSource>
): LowCodePageBlock {
  const props = block.props as VisualBlockProps;
  const fields = normalizeRows(props.fields).map(normalizeField).filter(Boolean);
  const sourceKey = readString(props.sourceKey, 'record');
  const submitSourceKey = readString(props.submitSourceKey, sourceKey);
  const layout = readFormDesignerLayout(props.formDesignerModel);
  const submitLabel = readString(props.submitText, '保存');
  const resetLabel = readString(props.resetText, '重置');

  upsertFormDataSource(dataSources, sourceKey, props, false);
  if (submitSourceKey !== sourceKey) {
    upsertFormDataSource(dataSources, submitSourceKey, props, false);
  }

  return {
    id: toBlockId(props.blockId, block._vid),
    kind: 'form',
    title: readString(props.title, 'Edit Form'),
    sourceKey,
    submitSourceKey,
    schema: {
      fields,
      ...(layout ? { layout } : {}),
      actions: [
        {
          code: 'submit',
          label: submitLabel,
          type: 'submit',
          status: 'primary',
        },
        {
          code: 'reset',
          label: resetLabel,
          type: 'reset',
        },
      ],
    },
  } as LowCodePageBlock;
}

function convertTabs(
  block: VisualEditorBlockData,
  dataSources: Record<string, LowCodePageDataSource>
) {
  const props = block.props as VisualBlockProps;
  const rows = normalizeRows(props.panes);
  const usedKeys = new Set<string>();
  const slots = isPlainRecord(props.slots) ? props.slots : {};
  const tabs = rows.map((row, index) => {
    const key = readString(row.name, `tab${index + 1}`);
    const label = readString(row.title, `页签 ${index + 1}`);
    let slotKey = toTabsSlotKey(key, index);

    if (usedKeys.has(slotKey)) {
      slotKey = `${slotKey}_${index + 1}`;
    }
    usedKeys.add(slotKey);

    const slot: Record<string, unknown> = isPlainRecord(slots[slotKey])
      ? (slots[slotKey] as Record<string, unknown>)
      : {};
    const children = Array.isArray(slot.children)
      ? (slot.children as VisualEditorBlockData[])
      : [];

    return {
      key,
      label,
      blocks: convertVisualBlocks(children, dataSources),
    };
  });

  return {
    id: toBlockId(props.blockId, block._vid),
    kind: 'tabs',
    ...(readString(props.title) ? { title: readString(props.title) } : {}),
    ...(readString(props.description) ? { description: readString(props.description) } : {}),
    defaultKey: readString(props.modelValue, tabs[0]?.key),
    tabs,
  } as LowCodePageBlock;
}

function convertGrid(block: VisualEditorBlockData, dataSources: Record<string, LowCodePageDataSource>) {
  const props = block.props as VisualBlockProps;
  const sourceKey = readString(props.sourceKey, 'records');
  const serviceName = readString(props.serviceName, 'admin');
  const serviceMethod = readString(props.serviceMethod, 'listUsers');
  const saveMethod = readString(props.saveMethod);
  const deleteMethod = readString(props.deleteMethod);
  const postData = readJsonObject(props.postDataJson, {});
  const columns = normalizeRows(props.columns).map(normalizeColumn).filter(Boolean);
  const showRowActions = readBoolean(props.showRowActions, true);

  dataSources[sourceKey] = {
    key: sourceKey,
    label: readString(props.title, sourceKey),
    serviceName,
    serviceMethod,
    ...(saveMethod ? { saveMethod } : {}),
    ...(deleteMethod ? { deleteMethod } : {}),
    ...(Object.keys(postData).length ? { postData } : {}),
    autoLoad: true,
  };

  return {
    id: toBlockId(props.blockId, block._vid),
    kind: 'grid',
    title: readString(props.title, 'Records'),
    sourceKey,
    schema: {
      title: readString(props.title, 'Records'),
      grid: {
        border: true,
        stripe: true,
        showOverflow: true,
        rowConfig: { keyField: columns[0]?.field ?? 'id' },
        columns: [
          ...columns,
          ...(showRowActions
            ? [
                {
                  title: '操作',
                  width: 180,
                  fixed: 'right' as const,
                  slots: { default: 'actions' },
                },
              ]
            : []),
        ],
      },
      rowActions: showRowActions
        ? {
            edit: true,
            editLabel: '编辑',
            delete: Boolean(deleteMethod),
            deleteLabel: '删除',
          }
        : undefined,
    },
  } as LowCodePageBlock;
}

function convertVisualBlock(
  block: VisualEditorBlockData,
  dataSources: Record<string, LowCodePageDataSource>
) {
  if (block.componentKey === 'lowcode-search-form') {
    return convertSearchForm(block);
  }

  if (block.componentKey === 'lowcode-grid') {
    return convertGrid(block, dataSources);
  }

  if (block.componentKey === 'vxe-tabs') {
    return convertTabs(block, dataSources);
  }

  if (
    block.componentKey === 'lowcode-edit-form' ||
    (block.componentKey === 'form' && Array.isArray(block.props?.fields))
  ) {
    return convertEditForm(block, dataSources);
  }

  return null;
}

function convertVisualBlocks(
  blocks: VisualEditorBlockData[] = [],
  dataSources: Record<string, LowCodePageDataSource>
) {
  return blocks
    .map((block) => convertVisualBlock(block, dataSources))
    .filter(Boolean) as LowCodePageBlock[];
}

export function convertVisualEditorToLowCode(
  model: VisualEditorModelValue,
  currentPage: VisualEditorPage
): ConversionResult {
  const dataSources: Record<string, LowCodePageDataSource> = {};
  const page = model.pages[currentPage.path] ?? currentPage;
  const blocks = convertVisualBlocks(page.blocks, dataSources);

  return {
    blocks,
    dataSources,
  };
}
