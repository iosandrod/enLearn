import type {
  LowCodeButtonGroupAction,
  LowCodePageType,
  LowCodeRuntimeDirective,
} from '../../types/lowcode';

export const BUILTIN_LOW_CODE_ACTION_KEYS = {
  CREATE: 'record.create',
  EDIT: 'record.edit',
  DELETE: 'record.delete',
  DUPLICATE: 'record.duplicate',
  MODIFY: 'record.modify',
  SAVE: 'record.save',
  APPROVE: 'record.approve',
  UNAPPROVE: 'record.unapprove',
  CLOSE: 'record.close',
  OPEN: 'record.open',
  REFRESH: 'page.refresh',
  PRINT_PAGE: 'print.page',
  EXIT: 'page.exit',
  IMPORT: 'data.import',
  EXPORT: 'data.export',
  MORE: 'group.more',
} as const;

export type BuiltinLowCodeActionKey =
  (typeof BUILTIN_LOW_CODE_ACTION_KEYS)[keyof typeof BUILTIN_LOW_CODE_ACTION_KEYS];

export type LowCodeBuiltinActionSelection = 'none' | 'single' | 'multiple';
export type LowCodeBuiltinActionPageType = Extract<LowCodePageType, 'list' | 'edit'>;

export type LowCodeBuiltinActionPreset = {
  key: BuiltinLowCodeActionKey;
  selection: LowCodeBuiltinActionSelection;
  selectionByPageType?: Partial<
    Record<LowCodeBuiltinActionPageType, LowCodeBuiltinActionSelection>
  >;
  pageTypes: LowCodeBuiltinActionPageType[];
  functionName?: string;
  action: LowCodeButtonGroupAction;
};

export type CreateBuiltinLowCodeActionOptions = {
  pageType?: LowCodeBuiltinActionPageType;
};

export const BUILTIN_LOW_CODE_ACTION_PAGE_TYPE_ORDER = {
  list: [
    BUILTIN_LOW_CODE_ACTION_KEYS.CREATE,
    BUILTIN_LOW_CODE_ACTION_KEYS.EDIT,
    BUILTIN_LOW_CODE_ACTION_KEYS.DELETE,
    BUILTIN_LOW_CODE_ACTION_KEYS.APPROVE,
    BUILTIN_LOW_CODE_ACTION_KEYS.UNAPPROVE,
    BUILTIN_LOW_CODE_ACTION_KEYS.CLOSE,
    BUILTIN_LOW_CODE_ACTION_KEYS.OPEN,
    BUILTIN_LOW_CODE_ACTION_KEYS.REFRESH,
    BUILTIN_LOW_CODE_ACTION_KEYS.PRINT_PAGE,
    BUILTIN_LOW_CODE_ACTION_KEYS.EXIT,
    BUILTIN_LOW_CODE_ACTION_KEYS.IMPORT,
    BUILTIN_LOW_CODE_ACTION_KEYS.EXPORT,
    BUILTIN_LOW_CODE_ACTION_KEYS.MORE,
  ],
  edit: [
    BUILTIN_LOW_CODE_ACTION_KEYS.DUPLICATE,
    BUILTIN_LOW_CODE_ACTION_KEYS.CREATE,
    BUILTIN_LOW_CODE_ACTION_KEYS.MODIFY,
    BUILTIN_LOW_CODE_ACTION_KEYS.SAVE,
    BUILTIN_LOW_CODE_ACTION_KEYS.APPROVE,
    BUILTIN_LOW_CODE_ACTION_KEYS.UNAPPROVE,
    BUILTIN_LOW_CODE_ACTION_KEYS.CLOSE,
    BUILTIN_LOW_CODE_ACTION_KEYS.OPEN,
    BUILTIN_LOW_CODE_ACTION_KEYS.REFRESH,
    BUILTIN_LOW_CODE_ACTION_KEYS.EXIT,
  ],
} as const satisfies Record<
  LowCodeBuiltinActionPageType,
  readonly BuiltinLowCodeActionKey[]
>;

type LowCodeBuiltinActionPresetSeed = Omit<LowCodeBuiltinActionPreset, 'key'>;
type AtomicBuiltinLowCodeActionKey = Exclude<
  BuiltinLowCodeActionKey,
  typeof BUILTIN_LOW_CODE_ACTION_KEYS.MORE
>;

const atomicActionPresetSeeds = {
  [BUILTIN_LOW_CODE_ACTION_KEYS.DUPLICATE]: {
    selection: 'none',
    pageTypes: ['edit'],
    functionName: 'copy',
    action: {
      code: 'duplicate',
      label: '复制',
      type: 'button',
      prefixIcon: 'ri-file-copy-line',
      eventName: 'buttonGroup.duplicate',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.CREATE]: {
    selection: 'none',
    pageTypes: ['list', 'edit'],
    functionName: 'create',
    action: {
      code: 'create',
      label: '新增',
      status: 'primary',
      type: 'button',
      prefixIcon: 'ri-add-line',
      eventName: 'buttonGroup.create',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.EDIT]: {
    selection: 'single',
    pageTypes: ['list'],
    functionName: 'edit',
    action: {
      code: 'edit',
      label: '编辑',
      type: 'button',
      prefixIcon: 'ri-edit-line',
      eventName: 'buttonGroup.edit',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.DELETE]: {
    selection: 'multiple',
    pageTypes: ['list'],
    functionName: 'delete',
    action: {
      code: 'delete',
      label: '删除',
      status: 'danger',
      type: 'button',
      prefixIcon: 'ri-delete-bin-line',
      eventName: 'buttonGroup.delete',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.MODIFY]: {
    selection: 'none',
    pageTypes: ['edit'],
    functionName: 'modify',
    action: {
      code: 'modify',
      label: '修改',
      type: 'button',
      prefixIcon: 'ri-edit-2-line',
      eventName: 'buttonGroup.modify',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.SAVE]: {
    selection: 'none',
    pageTypes: ['edit'],
    functionName: 'save',
    action: {
      code: 'save',
      label: '保存',
      status: 'primary',
      type: 'button',
      prefixIcon: 'ri-save-line',
      eventName: 'buttonGroup.save',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.APPROVE]: {
    selection: 'multiple',
    selectionByPageType: { edit: 'none' },
    pageTypes: ['list', 'edit'],
    functionName: 'approve',
    action: {
      code: 'approve',
      label: '审核',
      type: 'button',
      prefixIcon: 'ri-checkbox-circle-line',
      eventName: 'buttonGroup.approve',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.UNAPPROVE]: {
    selection: 'multiple',
    selectionByPageType: { edit: 'none' },
    pageTypes: ['list', 'edit'],
    functionName: 'unapprove',
    action: {
      code: 'unapprove',
      label: '反审',
      type: 'button',
      prefixIcon: 'ri-arrow-go-back-line',
      eventName: 'buttonGroup.unapprove',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.CLOSE]: {
    selection: 'multiple',
    selectionByPageType: { edit: 'none' },
    pageTypes: ['list', 'edit'],
    functionName: 'close',
    action: {
      code: 'close',
      label: '关闭',
      type: 'button',
      prefixIcon: 'ri-close-circle-line',
      eventName: 'buttonGroup.close',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.OPEN]: {
    selection: 'multiple',
    selectionByPageType: { edit: 'none' },
    pageTypes: ['list', 'edit'],
    functionName: 'open',
    action: {
      code: 'open',
      label: '打开',
      type: 'button',
      prefixIcon: 'ri-folder-open-line',
      eventName: 'buttonGroup.open',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.REFRESH]: {
    selection: 'none',
    pageTypes: ['list', 'edit'],
    functionName: 'refresh',
    action: {
      code: 'refresh',
      label: '刷新',
      type: 'button',
      prefixIcon: 'ri-refresh-line',
      eventName: 'buttonGroup.refresh',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.PRINT_PAGE]: {
    selection: 'none',
    pageTypes: ['list'],
    functionName: 'print',
    action: {
      code: 'print',
      label: '打印',
      type: 'button',
      prefixIcon: 'ri-printer-line',
      eventName: 'buttonGroup.print',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.EXIT]: {
    selection: 'none',
    pageTypes: ['list', 'edit'],
    functionName: 'exit',
    action: {
      code: 'exit',
      label: '退出',
      type: 'button',
      prefixIcon: 'ri-logout-box-r-line',
      eventName: 'buttonGroup.exit',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.IMPORT]: {
    selection: 'none',
    pageTypes: ['list'],
    action: {
      code: 'import',
      label: '导入',
      type: 'button',
      prefixIcon: 'ri-upload-2-line',
      eventName: 'buttonGroup.import',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.EXPORT]: {
    selection: 'none',
    pageTypes: ['list'],
    action: {
      code: 'export',
      label: '导出',
      type: 'button',
      prefixIcon: 'ri-download-2-line',
      eventName: 'buttonGroup.export',
    },
  },
} satisfies Record<AtomicBuiltinLowCodeActionKey, LowCodeBuiltinActionPresetSeed>;

const builtinActionPresetSeeds = {
  ...atomicActionPresetSeeds,
  [BUILTIN_LOW_CODE_ACTION_KEYS.MORE]: {
    selection: 'none',
    pageTypes: ['list'],
    action: {
      code: 'more',
      label: '更多',
      type: 'button',
      eventName: 'buttonGroup.more',
      showDropdownIcon: true,
      children: [
        atomicActionPresetSeeds[BUILTIN_LOW_CODE_ACTION_KEYS.IMPORT].action,
        atomicActionPresetSeeds[BUILTIN_LOW_CODE_ACTION_KEYS.EXPORT].action,
      ],
    },
  },
} satisfies Record<BuiltinLowCodeActionKey, LowCodeBuiltinActionPresetSeed>;

function clonePresetValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clonePresetValue(item)) as T;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clonePresetValue(item)]),
    ) as T;
  }

  return value;
}

export function getBuiltinLowCodeActionPreset(
  key: BuiltinLowCodeActionKey,
): LowCodeBuiltinActionPreset {
  return {
    key,
    ...clonePresetValue(builtinActionPresetSeeds[key]),
  };
}

export function getBuiltinLowCodeActionPresets(): LowCodeBuiltinActionPreset[] {
  return Object.values(BUILTIN_LOW_CODE_ACTION_KEYS).map(getBuiltinLowCodeActionPreset);
}

export function getBuiltinLowCodeActionPresetsForPage(
  pageType: LowCodeBuiltinActionPageType,
): LowCodeBuiltinActionPreset[] {
  return BUILTIN_LOW_CODE_ACTION_PAGE_TYPE_ORDER[pageType].map(
    getBuiltinLowCodeActionPreset,
  );
}

export function resolveBuiltinLowCodeActionPresetForButton(
  pageType: LowCodeBuiltinActionPageType,
  action: Pick<LowCodeButtonGroupAction, 'code' | 'eventName'>,
) {
  return getBuiltinLowCodeActionPresetsForPage(pageType).find((preset) =>
    Boolean(preset.functionName) &&
    preset.action.code === action.code &&
    preset.action.eventName === action.eventName,
  );
}

export function resolveBuiltinLowCodeActionSelection(
  preset: LowCodeBuiltinActionPreset,
  pageType?: LowCodeBuiltinActionPageType,
): LowCodeBuiltinActionSelection {
  return pageType
    ? preset.selectionByPageType?.[pageType] ?? preset.selection
    : preset.selection;
}

export function createBuiltinLowCodePageFunctionScript(functionName: string) {
  return [
    'async function main() {',
    '  return this.executeFunction({',
    `    name: ${JSON.stringify(functionName)},`,
    '    args: {},',
    '  });',
    '}',
  ].join('\n');
}

export function createBuiltinLowCodeAction(
  key: BuiltinLowCodeActionKey,
  overrides: Partial<LowCodeButtonGroupAction> = {},
  options: CreateBuiltinLowCodeActionOptions = {},
): LowCodeButtonGroupAction {
  const preset = getBuiltinLowCodeActionPreset(key);
  const pageFunctionScript = options.pageType &&
    preset.pageTypes.includes(options.pageType) &&
    preset.functionName
    ? createBuiltinLowCodePageFunctionScript(preset.functionName)
    : undefined;

  return {
    ...preset.action,
    ...(pageFunctionScript ? { script: pageFunctionScript } : {}),
    ...clonePresetValue(overrides),
  };
}

export function createDefaultButtonGroupActions(
  options: CreateBuiltinLowCodeActionOptions = {},
): LowCodeButtonGroupAction[] {
  return [
    createBuiltinLowCodeAction(BUILTIN_LOW_CODE_ACTION_KEYS.CREATE, {}, options),
    createBuiltinLowCodeAction(BUILTIN_LOW_CODE_ACTION_KEYS.MORE, {}, options),
  ];
}

export type LowCodeBuiltinActionEditorRow<
  TDirectives extends string | LowCodeRuntimeDirective[] = string,
> = Omit<LowCodeButtonGroupAction, 'children' | 'directives'> & {
  directivesJson: TDirectives;
  children: LowCodeBuiltinActionEditorRow<TDirectives>[];
};

function toActionEditorRow(
  action: LowCodeButtonGroupAction,
  directivesJson: 'array' | 'string',
): LowCodeBuiltinActionEditorRow<string | LowCodeRuntimeDirective[]> {
  const { children = [], directives = [], ...button } = action;

  return {
    ...clonePresetValue(button),
    directivesJson:
      directivesJson === 'array'
        ? clonePresetValue(directives)
        : JSON.stringify(directives),
    children: children.map((child) => toActionEditorRow(child, directivesJson)),
  };
}

export function createBuiltinLowCodeActionEditorRow(
  key: BuiltinLowCodeActionKey,
  options: { directivesJson: 'array'; pageType?: LowCodeBuiltinActionPageType },
): LowCodeBuiltinActionEditorRow<LowCodeRuntimeDirective[]>;
export function createBuiltinLowCodeActionEditorRow(
  key: BuiltinLowCodeActionKey,
  options?: { directivesJson?: 'string'; pageType?: LowCodeBuiltinActionPageType },
): LowCodeBuiltinActionEditorRow<string>;
export function createBuiltinLowCodeActionEditorRow(
  key: BuiltinLowCodeActionKey,
  options: {
    directivesJson?: 'array' | 'string';
    pageType?: LowCodeBuiltinActionPageType;
  } = {},
) {
  return toActionEditorRow(
    createBuiltinLowCodeAction(key, {}, { pageType: options.pageType }),
    options.directivesJson ?? 'string',
  );
}

export function createDefaultButtonGroupEditorRows(options: {
  directivesJson: 'array';
  pageType?: LowCodeBuiltinActionPageType;
}): LowCodeBuiltinActionEditorRow<LowCodeRuntimeDirective[]>[];
export function createDefaultButtonGroupEditorRows(options?: {
  directivesJson?: 'string';
  pageType?: LowCodeBuiltinActionPageType;
}): LowCodeBuiltinActionEditorRow<string>[];
export function createDefaultButtonGroupEditorRows(
  options: {
    directivesJson?: 'array' | 'string';
    pageType?: LowCodeBuiltinActionPageType;
  } = {},
) {
  const directivesJson = options.directivesJson ?? 'string';
  return createDefaultButtonGroupActions({ pageType: options.pageType }).map((action) =>
    toActionEditorRow(action, directivesJson),
  );
}
