import type {
  LowCodeButtonGroupAction,
  LowCodeRuntimeDirective,
} from '../../types/lowcode';

export const BUILTIN_LOW_CODE_ACTION_KEYS = {
  CREATE: 'record.create',
  EDIT: 'record.edit',
  DUPLICATE: 'record.duplicate',
  PRINT_PAGE: 'print.page',
  IMPORT: 'data.import',
  EXPORT: 'data.export',
  MORE: 'group.more',
} as const;

export type BuiltinLowCodeActionKey =
  (typeof BUILTIN_LOW_CODE_ACTION_KEYS)[keyof typeof BUILTIN_LOW_CODE_ACTION_KEYS];

export type LowCodeBuiltinActionSelection = 'none' | 'single' | 'multiple';

export type LowCodeBuiltinActionPreset = {
  key: BuiltinLowCodeActionKey;
  selection: LowCodeBuiltinActionSelection;
  action: LowCodeButtonGroupAction;
};

type LowCodeBuiltinActionPresetSeed = Omit<LowCodeBuiltinActionPreset, 'key'>;
type AtomicBuiltinLowCodeActionKey = Exclude<
  BuiltinLowCodeActionKey,
  typeof BUILTIN_LOW_CODE_ACTION_KEYS.MORE
>;

const atomicActionPresetSeeds = {
  [BUILTIN_LOW_CODE_ACTION_KEYS.CREATE]: {
    selection: 'none',
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
    action: {
      code: 'edit',
      label: '编辑',
      type: 'button',
      prefixIcon: 'ri-edit-line',
      eventName: 'buttonGroup.edit',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.DUPLICATE]: {
    selection: 'single',
    action: {
      code: 'duplicate',
      label: '复制',
      type: 'button',
      prefixIcon: 'ri-file-copy-line',
      eventName: 'buttonGroup.duplicate',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.PRINT_PAGE]: {
    selection: 'none',
    action: {
      code: 'print',
      label: '打印',
      type: 'button',
      prefixIcon: 'ri-printer-line',
      eventName: 'buttonGroup.print',
    },
  },
  [BUILTIN_LOW_CODE_ACTION_KEYS.IMPORT]: {
    selection: 'none',
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

export function createBuiltinLowCodeAction(
  key: BuiltinLowCodeActionKey,
  overrides: Partial<LowCodeButtonGroupAction> = {},
): LowCodeButtonGroupAction {
  const preset = getBuiltinLowCodeActionPreset(key);
  return {
    ...preset.action,
    ...clonePresetValue(overrides),
  };
}

export function createDefaultButtonGroupActions(): LowCodeButtonGroupAction[] {
  return [
    createBuiltinLowCodeAction(BUILTIN_LOW_CODE_ACTION_KEYS.CREATE),
    createBuiltinLowCodeAction(BUILTIN_LOW_CODE_ACTION_KEYS.MORE),
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
  options: { directivesJson: 'array' },
): LowCodeBuiltinActionEditorRow<LowCodeRuntimeDirective[]>;
export function createBuiltinLowCodeActionEditorRow(
  key: BuiltinLowCodeActionKey,
  options?: { directivesJson?: 'string' },
): LowCodeBuiltinActionEditorRow<string>;
export function createBuiltinLowCodeActionEditorRow(
  key: BuiltinLowCodeActionKey,
  options: { directivesJson?: 'array' | 'string' } = {},
) {
  return toActionEditorRow(
    createBuiltinLowCodeAction(key),
    options.directivesJson ?? 'string',
  );
}

export function createDefaultButtonGroupEditorRows(options: {
  directivesJson: 'array';
}): LowCodeBuiltinActionEditorRow<LowCodeRuntimeDirective[]>[];
export function createDefaultButtonGroupEditorRows(options?: {
  directivesJson?: 'string';
}): LowCodeBuiltinActionEditorRow<string>[];
export function createDefaultButtonGroupEditorRows(
  options: { directivesJson?: 'array' | 'string' } = {},
) {
  const directivesJson = options.directivesJson ?? 'string';
  return createDefaultButtonGroupActions().map((action) =>
    toActionEditorRow(action, directivesJson),
  );
}
