import { computed, reactive } from 'vue';
import { ElMessage } from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import type {
  LowCodeFormSchema,
  LowCodePageBlock,
  LowCodeRuntimeDirective,
} from '../../../types/lowcode';
import { isLowCodeFormSchema } from '../../../lowcode/form-schema';
import type { ArrayTableToolbarExecutionContext } from '../../../lowcode/form-materials/lc-array-table/index.vue';
import {
  createBuiltinLowCodeActionEditorRow,
  createBuiltinLowCodePageFunctionScript,
  createBuiltinLowCodeNoopScript,
  createDefaultButtonGroupEditorRows,
  getBuiltinLowCodeActionPresets,
  getBuiltinLowCodeActionPresetsForPage,
  resolveBuiltinLowCodeActionSelection,
  resolveBuiltinLowCodeActionPresetForButton,
  type BuiltinLowCodeActionKey,
  type LowCodeBuiltinActionPageType,
  type LowCodeBuiltinActionSelection,
} from '../../../lowcode/actions/builtins';
import { generateNanoid } from '../../utils';
import { openGlobalDialog } from '../../../runtime/global-dialog';
import type { LowCodeContextSource } from '../../../runtime/lowcode-context';
import { registerButtonScriptMonacoTypes } from './button-script-monaco';
import type { LowCodeHostServiceApi } from '../../../core/host';

export type ButtonGroupDesignerButton = {
  __id?: string;
  code?: string;
  label?: string;
  status?: string;
  type?: string;
  route?: string;
  eventName?: string;
  script?: string;
  disabled?: boolean;
  directivesJson?: unknown;
  children?: ButtonGroupDesignerButton[] | string;
  [key: string]: unknown;
};

export type ButtonGroupDesignerBusinessInfo = {
  blockId: string;
  title: string;
  description: string;
  align: string;
  gap: string | number;
};

export type ButtonGroupDesignerResult = {
  business: ButtonGroupDesignerBusinessInfo;
  buttons: ButtonGroupDesignerButton[];
};

type ButtonGroupDesignerServiceOption = {
  title?: string;
  business?: Partial<ButtonGroupDesignerBusinessInfo> | null;
  buttons?: ButtonGroupDesignerButton[] | null;
  serviceApi?: LowCodeHostServiceApi;
  scriptContext?: LowCodeContextSource;
  onConfirm?: (result: ButtonGroupDesignerResult) => Promise<void> | void;
};

type ButtonGroupDesignerState = {
  business: ButtonGroupDesignerBusinessInfo;
  buttonsForm: {
    buttons: ButtonGroupDesignerButton[];
  };
};

type DefaultButtonPickerRow = {
  key: BuiltinLowCodeActionKey;
  label: string;
  code: string;
  selectionLabel: string;
  typeLabel: string;
  availabilityLabel: string;
  checked: boolean;
  disabled: boolean;
};

const BUTTONS_FORM_ID = 'button-group-designer-buttons-form';
const INFO_FORM_ID = 'button-group-designer-info-form';
const MASTER_FORM_ID = 'button-group-designer-form';
const BUTTON_GROUP_DESIGNER_FORM_CODE = 'button-group-designer';

declare const useServiceApi: undefined | (() => LowCodeHostServiceApi);

function executeAddToolbarAction({ action, addRow }: ArrayTableToolbarExecutionContext) {
  return addRow(action.row);
}

function describeSelection(selection: LowCodeBuiltinActionSelection) {
  if (selection === 'single') return '选中一条记录';
  if (selection === 'multiple') return '可选多条记录';
  return '无需选中记录';
}

function resolveDesignerPageType(
  scriptContext?: LowCodeContextSource,
): LowCodeBuiltinActionPageType | undefined {
  const pageType = scriptContext?.page?.page_type ?? scriptContext?.page?.schema.pageType;
  return pageType === 'list' || pageType === 'edit' ? pageType : undefined;
}

function getPickerPresets(pageType?: LowCodeBuiltinActionPageType) {
  return pageType
    ? getBuiltinLowCodeActionPresetsForPage(pageType)
    : getBuiltinLowCodeActionPresets();
}

function collectButtonCodes(
  button: unknown,
  result: Set<string> = new Set<string>(),
) {
  if (!isRecord(button)) return result;

  const code = readString(button.code);
  if (code) result.add(code);
  normalizeChildrenSource(button.children).forEach((child) =>
    collectButtonCodes(child, result),
  );
  return result;
}

function collectConfiguredButtonCodes(buttons: Record<string, unknown>[]) {
  const result = new Set<string>();
  buttons.forEach((button) => collectButtonCodes(button, result));
  return result;
}

function createDefaultButtonPickerRows(
  buttons: Record<string, unknown>[],
  pageType?: LowCodeBuiltinActionPageType,
): DefaultButtonPickerRow[] {
  const configuredCodes = collectConfiguredButtonCodes(buttons);

  return getPickerPresets(pageType).map((preset) => {
    const actionCodes = [...collectButtonCodes(preset.action)];
    const code = readString(preset.action.code);
    const rootExists = configuredCodes.has(code);
    const disabled = actionCodes.some((actionCode) => configuredCodes.has(actionCode));

    return {
      key: preset.key,
      label: readString(preset.action.label, code),
      code,
      selectionLabel: describeSelection(
        resolveBuiltinLowCodeActionSelection(preset, pageType),
      ),
      typeLabel: Array.isArray(preset.action.children) && preset.action.children.length
        ? '下拉按钮'
        : '普通按钮',
      availabilityLabel: rootExists ? '已添加' : disabled ? '子按钮已存在' : '可添加',
      checked: false,
      disabled,
    };
  });
}

function appendBuiltinButtons(
  keys: BuiltinLowCodeActionKey[],
  rows: Record<string, unknown>[],
  addRow: ArrayTableToolbarExecutionContext['addRow'],
  pageType?: LowCodeBuiltinActionPageType,
) {
  const selectedKeys = new Set(keys);
  const presets = getPickerPresets(pageType)
    .filter((preset) => selectedKeys.has(preset.key))
    .sort(
      (previous, next) =>
        collectButtonCodes(next.action).size - collectButtonCodes(previous.action).size,
    );
  const configuredCodes = collectConfiguredButtonCodes(rows);
  const added: string[] = [];
  const skipped: string[] = [];

  presets.forEach((preset) => {
    const actionCodes = [...collectButtonCodes(preset.action)];
    const label = readString(preset.action.label, readString(preset.action.code));

    if (actionCodes.some((code) => configuredCodes.has(code))) {
      skipped.push(label);
      return;
    }

    addRow(
      createBuiltinLowCodeActionEditorRow(preset.key, {
        pageType,
      }) as unknown as Record<string, unknown>,
    );
    actionCodes.forEach((code) => configuredCodes.add(code));
    added.push(label);
  });

  if (!added.length) {
    ElMessage.warning('所选默认按钮已存在，未添加重复编码。');
    return;
  }

  const skippedMessage = skipped.length ? `，已跳过重复项：${skipped.join('、')}` : '';
  ElMessage.success(`已添加 ${added.length} 个默认按钮${skippedMessage}`);
}

async function executeSelectDefaultButtons({
  rows,
  addRow,
}: ArrayTableToolbarExecutionContext, pageType?: LowCodeBuiltinActionPageType) {
  const pickerRows = reactive(createDefaultButtonPickerRows(rows, pageType));
  const confirmDisabled = computed(
    () => !pickerRows.some((row) => row.checked && !row.disabled),
  );
  const result = await openGlobalDialog({
    title: '选择默认按钮',
    width: 'min(760px, calc(100vw - 32px))',
    height: 'min(520px, calc(100vh - 64px))',
    className: 'button-default-picker-dialog',
    props: {
      top: '8vh',
      destroyOnClose: true,
    },
    content: {
      type: 'grid',
      key: 'default-button-picker-grid',
      className: 'button-default-picker-grid',
      style: { minHeight: 0 },
      grid: {
        rows: pickerRows,
        columns: [
          { type: 'checkbox', width: 48, align: 'center' },
          { field: 'label', title: '按钮名称', minWidth: 120 },
          { field: 'code', title: '编码 code', minWidth: 140 },
          { field: 'selectionLabel', title: '使用条件', width: 126 },
          { field: 'typeLabel', title: '类型', width: 100 },
          { field: 'availabilityLabel', title: '状态', width: 110 },
        ],
        props: {
          border: true,
          stripe: true,
          size: 'small',
          height: '100%',
          showOverflow: 'tooltip',
          rowConfig: { keyField: 'key' },
          checkboxConfig: {
            checkField: 'checked',
            checkMethod: ({ row }: { row: DefaultButtonPickerRow }) => !row.disabled,
          },
        },
      },
    },
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '添加所选',
        role: 'confirm',
        status: 'primary',
        disabled: confirmDisabled,
      },
    ],
    onConfirm: () => ({
      payload: pickerRows
        .filter((row) => row.checked && !row.disabled)
        .map((row) => row.key),
    }),
  });

  if (result.action !== 'confirm' || !Array.isArray(result.payload)) return;

  appendBuiltinButtons(
    result.payload.filter((key): key is BuiltinLowCodeActionKey =>
      getPickerPresets(pageType).some((preset) => preset.key === key),
    ),
    rows,
    addRow,
    pageType,
  );
}

const defaultBusiness: ButtonGroupDesignerBusinessInfo = {
  blockId: 'button-group',
  title: '按钮组',
  description: '',
  align: 'left',
  gap: 8,
};

const defaultButtons: ButtonGroupDesignerButton[] = createDefaultButtonGroupEditorRows();

function ensureButtonIds(button: ButtonGroupDesignerButton): ButtonGroupDesignerButton {
  const next: ButtonGroupDesignerButton = {
    ...button,
    __id: button.__id || `button_${generateNanoid()}`,
    type: button.type || 'button',
    status: button.status || '',
    script: typeof button.script === 'string' ? button.script : '',
    directivesJson:
      typeof button.directivesJson === 'undefined' ? '[]' : button.directivesJson,
  };
  const children = normalizeChildrenSource(button.children);

  if (children.length) {
    next.children = children.map(ensureButtonIds);
  } else {
    delete next.children;
  }

  return next;
}

function attachMissingBuiltinFunctionScripts(
  button: ButtonGroupDesignerButton,
  pageType?: LowCodeBuiltinActionPageType,
): ButtonGroupDesignerButton {
  const next = cloneDeep(button);
  const preset = pageType
    ? resolveBuiltinLowCodeActionPresetForButton(pageType, {
        code: readString(button.code),
        eventName: readString(button.eventName),
      })
    : undefined;

  const script = readString(button.script);
  const isFallbackScript = script === createBuiltinLowCodeNoopScript();
  if ((!script || isFallbackScript) && preset) {
    next.script = preset.functionName
      ? createBuiltinLowCodePageFunctionScript(preset.functionName)
      : createBuiltinLowCodeNoopScript();
  }

  const children = normalizeChildrenSource(button.children);
  if (children.length) {
    next.children = children.map((child) =>
      attachMissingBuiltinFunctionScripts(child, pageType),
    );
  }

  return next;
}

function createInitialButtons(option: ButtonGroupDesignerServiceOption) {
  const source = Array.isArray(option.buttons) && option.buttons.length
    ? option.buttons
    : defaultButtons;
  const pageType = resolveDesignerPageType(option.scriptContext);
  return source
    .map((button) => attachMissingBuiltinFunctionScripts(button, pageType))
    .map(ensureButtonIds);
}

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function readJsonArray<T>(value: unknown) {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeChildrenSource(value: unknown): ButtonGroupDesignerButton[] {
  return readJsonArray<ButtonGroupDesignerButton>(value).filter(isRecord);
}

function parseDirectivesJson(value: unknown, label: string): LowCodeRuntimeDirective[] {
  if (Array.isArray(value)) return value as LowCodeRuntimeDirective[];

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as LowCodeRuntimeDirective[];
    } catch {
      // handled below with a row-specific error
    }

    throw new Error(`${label} 的 directives JSON 必须是数组`);
  }

  if (typeof value === 'undefined' || value === null || value === '') {
    return [];
  }

  throw new Error(`${label} 的 directives JSON 必须是数组`);
}

function normalizeDirectivesJsonValue(value: unknown) {
  if (typeof value === 'string') return readString(value, '[]');
  if (Array.isArray(value)) return JSON.stringify(value);
  return '[]';
}

function normalizeButtonForResult(
  button: ButtonGroupDesignerButton,
  indexPath: number[],
): ButtonGroupDesignerButton {
  const fallbackCode = `button_${indexPath.join('_')}`;
  const code = readString(button.code, fallbackCode);
  const label = readString(button.label, code);
  const children = normalizeChildrenSource(button.children).map((child, index) =>
    normalizeButtonForResult(child, [...indexPath, index + 1]),
  );
  const next: ButtonGroupDesignerButton = {
    ...Object.fromEntries(
      Object.entries(button)
        .filter(([key, value]) => key !== '__id' && typeof value !== 'undefined')
        .map(([key, value]) => [key, cloneDeep(value)]),
    ),
    code,
    label,
    type: readString(button.type, 'button'),
    status: readString(button.status),
    route: readString(button.route),
    eventName: readString(button.eventName),
    script: typeof button.script === 'string' ? button.script : '',
    disabled: Boolean(button.disabled),
    directivesJson: normalizeDirectivesJsonValue(button.directivesJson),
  };

  if (children.length) {
    next.children = children;
  } else {
    delete next.children;
  }

  delete next.__id;
  return next;
}

function flattenButtons(
  buttons: ButtonGroupDesignerButton[],
  result: ButtonGroupDesignerButton[] = [],
) {
  buttons.forEach((button) => {
    result.push(button);
    const children = normalizeChildrenSource(button.children);
    if (children.length) {
      flattenButtons(children, result);
    }
  });
  return result;
}

function createInitialBusiness(option: ButtonGroupDesignerServiceOption) {
  return {
    ...defaultBusiness,
    ...(option.business ?? {}),
  };
}

function createDesignerState(option: ButtonGroupDesignerServiceOption) {
  return reactive<ButtonGroupDesignerState>({
    business: createInitialBusiness(option),
    buttonsForm: {
      buttons: createInitialButtons(option),
    },
  });
}

function createDesignerFormModels(state: ButtonGroupDesignerState) {
  return reactive<Record<string, Record<string, unknown>>>({
    [MASTER_FORM_ID]: {
      [BUTTONS_FORM_ID]: state.buttonsForm,
      [INFO_FORM_ID]: state.business as unknown as Record<string, unknown>,
    },
  });
}

function readButtonsModel(formModels: Record<string, Record<string, unknown>>) {
  const master = formModels[MASTER_FORM_ID];
  const model = (master?.[BUTTONS_FORM_ID] as Record<string, unknown> | undefined) ??
    formModels[BUTTONS_FORM_ID];
  const buttons = Array.isArray(model?.buttons) ? model.buttons : [];
  return buttons.map((button) => ensureButtonIds(button as ButtonGroupDesignerButton));
}

function readBusinessModel(formModels: Record<string, Record<string, unknown>>) {
  const master = formModels[MASTER_FORM_ID];
  return {
    ...defaultBusiness,
    ...((master?.[INFO_FORM_ID] as Record<string, unknown> | undefined) ??
      formModels[INFO_FORM_ID] ?? {}),
  } as ButtonGroupDesignerBusinessInfo;
}

function validateAndBuildResult(formModels: Record<string, Record<string, unknown>>) {
  try {
    const buttons = readButtonsModel(formModels);
    const business = readBusinessModel(formModels);

    if (!buttons.length) {
      throw new Error('请至少配置一个按钮');
    }

    flattenButtons(buttons).forEach((button, index) => {
      const label = readString(button.label, `第 ${index + 1} 行`);
      if (!readString(button.label) && !readString(button.code)) {
        throw new Error(`${label} 必须填写按钮名称或编码`);
      }
      parseDirectivesJson(button.directivesJson, label);
    });

    return {
      business: {
        ...business,
        blockId: readString(business.blockId, defaultBusiness.blockId),
        title: readString(business.title),
        description: readString(business.description),
        align: readString(business.align, defaultBusiness.align),
        gap: readString(business.gap, String(defaultBusiness.gap)),
      },
      buttons: buttons.map((button, index) =>
        normalizeButtonForResult(button, [index + 1]),
      ),
    } satisfies ButtonGroupDesignerResult;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '按钮组配置格式不正确');
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createButtonRow(label = '按钮'): ButtonGroupDesignerButton {
  return {
    label,
    code: '',
    status: '',
    type: 'button',
    route: '',
    eventName: '',
    script: '',
    disabled: false,
    directivesJson: '[]',
    children: [],
  };
}

function resolveServiceApi(option: ButtonGroupDesignerServiceOption) {
  if (option.serviceApi) return option.serviceApi;
  try {
    return typeof useServiceApi === 'function' ? useServiceApi() : undefined;
  } catch {
    return undefined;
  }
}

async function loadDesignerFormSchema(option: ButtonGroupDesignerServiceOption) {
  const serviceApi = resolveServiceApi(option);
  if (!serviceApi) {
    throw new Error('按钮设计器无法连接低代码服务。');
  }

  const rows = await serviceApi.invoke<Array<{ schema?: unknown }>>(
    'lowcode',
    'listItems',
    {
      resource: 'lowcode_form_definitions',
      filters: { code: BUTTON_GROUP_DESIGNER_FORM_CODE, enabled: true },
      limit: 1,
    },
  );
  const schema = Array.isArray(rows) ? rows[0]?.schema : undefined;
  if (!isLowCodeFormSchema(schema)) {
    throw new Error(`低代码表单“${BUTTON_GROUP_DESIGNER_FORM_CODE}”不存在、已停用或 schema 无效。`);
  }
  return cloneDeep(schema);
}

function resolveDesignerSubFormSchema(schema: LowCodeFormSchema, fieldCode: string) {
  const field = schema.fields.find((item) => item.field === fieldCode);
  const props = isRecord(field?.props) ? field.props : undefined;
  const subSchema = props?.schema;
  if (!isLowCodeFormSchema(subSchema)) {
    throw new Error(`按钮设计表单缺少有效区段：${fieldCode}`);
  }
  return cloneDeep(subSchema);
}

function configureDesignerSchema(
  schema: LowCodeFormSchema,
  option: ButtonGroupDesignerServiceOption,
): LowCodeFormSchema {
  const next = cloneDeep(schema);
  const pageType = resolveDesignerPageType(option.scriptContext);
  const buttonsSchema = resolveDesignerSubFormSchema(next, BUTTONS_FORM_ID);
  const buttonsField = buttonsSchema.fields.find((field) => field.field === 'buttons');
  if (!buttonsField || !isRecord(buttonsField.props)) {
    throw new Error('按钮设计表单缺少 buttons 字段。');
  }

  const fieldProps = buttonsField.props;
  const toolbarButtons = Array.isArray(fieldProps.toolbarButtons)
    ? fieldProps.toolbarButtons.filter(isRecord).map((button) => {
        const code = readString(button.code);
        if (code === 'select-default') {
          return {
            ...button,
            execute: (context: ArrayTableToolbarExecutionContext) =>
              executeSelectDefaultButtons(context, pageType),
          };
        }
        if (code === 'add-dropdown') {
          const row = isRecord(button.row)
            ? button.row
            : {
                ...createButtonRow('下拉按钮'),
                children: [createButtonRow('下拉项')],
              };
          return {
            ...button,
            row,
            execute: executeAddToolbarAction,
          };
        }
        if (code === 'add') {
          return { ...button, execute: executeAddToolbarAction };
        }
        return button;
      })
    : [];
  const columns = Array.isArray(fieldProps.columns)
    ? fieldProps.columns.filter(isRecord).map((column) => {
        if (column.field !== 'script' || !isRecord(column.props)) return column;
        return {
          ...column,
          props: {
            ...column.props,
            contextSource: option.scriptContext,
          },
        };
      })
    : [];

  buttonsField.props = {
    ...fieldProps,
    toolbarButtons,
    columns,
  };
  const nextButtonsField = next.fields.find((field) => field.field === BUTTONS_FORM_ID);
  if (nextButtonsField && isRecord(nextButtonsField.props)) {
    nextButtonsField.props = {
      ...nextButtonsField.props,
      schema: buttonsSchema,
    };
  }
  return next;
}

function createDesignerBlocks(schema: LowCodeFormSchema): LowCodePageBlock[] {
  return [{
    id: MASTER_FORM_ID,
    kind: 'form',
    title: '按钮组设计',
    className: 'button-group-designer-master-form',
    layout: { fillRemaining: true },
    schema,
  }];
}

function isButtonGroupDesignerResult(value: unknown): value is ButtonGroupDesignerResult {
  return typeof value === 'object' && value !== null && 'business' in value && 'buttons' in value;
}

export async function $$buttonGroupDesigner(option: ButtonGroupDesignerServiceOption) {
  registerButtonScriptMonacoTypes();
  const databaseSchema = await loadDesignerFormSchema(option);
  const schema = configureDesignerSchema(databaseSchema, option);
  const state = createDesignerState(option);
  const formModels = createDesignerFormModels(state);

  return openGlobalDialog({
    title: option.title || '按钮组设计',
    width: 'min(1280px, calc(100vw - 40px))',
    height: 'min(760px, calc(100vh - 80px))',
    className: 'button-group-designer-dialog grid-designer-dialog',
    props: {
      top: '4vh',
      destroyOnClose: true,
    },
    content: {
      type: 'lowcodeBlocks',
      lowcode: {
        blocks: createDesignerBlocks(schema),
        formModels,
      },
    },
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '确定',
        role: 'custom',
        status: 'primary',
        onClick: async () => {
          const result = validateAndBuildResult(formModels);
          if (!result) return false;

          try {
            await option.onConfirm?.(result);
          } catch (error) {
            ElMessage.error(error instanceof Error ? error.message : '按钮配置保存失败');
            return false;
          }

          return {
            close: true,
            action: 'confirm',
            payload: result,
          };
        },
      },
    ],
  }).then((result) => {
    if (result.action === 'confirm' && isButtonGroupDesignerResult(result.payload)) {
      return result.payload;
    }

    return new Promise<ButtonGroupDesignerResult>(() => undefined);
  });
}
