import type { LowCodePageRuntimeContext } from '../page-runtime.ts';
import { editButtonDisabledFunctions } from './edit-buttons.ts';
import type {
  LowCodeButtonDisabledAction,
  LowCodeButtonDisabledFunction,
  LowCodeButtonDisabledOptions,
} from './types.ts';

const SAVE_ACTION_CODES = new Set(['save', 'submit', 'saveandclose', 'saveandnew']);

function isNeverDisabled(context: LowCodePageRuntimeContext) {
  void context;
  return false;
}

export const mainButtonDisabledFunctions = {
  back(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  refresh(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  getEditFormRow(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  edit(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  duplicate(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  approve(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  unapprove(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  close(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  open(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  print(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  exit(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  import(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  export(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
  more(context: LowCodePageRuntimeContext): boolean {
    return isNeverDisabled(context);
  },
} satisfies Record<string, LowCodeButtonDisabledFunction>;

export const buttonDisabledFunctions = {
  ...mainButtonDisabledFunctions,
  ...editButtonDisabledFunctions,
} satisfies Record<string, LowCodeButtonDisabledFunction>;

export function normalizeLowCodeEditPageActionCode(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, '')
    : '';
}

export function isLowCodeEditPageSaveAction(
  action: Pick<LowCodeButtonDisabledAction, 'code'>,
) {
  return SAVE_ACTION_CODES.has(normalizeLowCodeEditPageActionCode(action.code));
}

export function isLowCodeEditPageModifyAction(
  action: Pick<LowCodeButtonDisabledAction, 'code'>,
) {
  return normalizeLowCodeEditPageActionCode(action.code) === 'modify';
}

const normalizedButtonDisabledFunctions = Object.fromEntries(
  Object.entries(buttonDisabledFunctions).map(([code, disabledFunction]) => [
    normalizeLowCodeEditPageActionCode(code),
    disabledFunction,
  ]),
) as Record<string, LowCodeButtonDisabledFunction>;

export function isLowCodeButtonDisabled(
  action: LowCodeButtonDisabledAction,
  context: LowCodePageRuntimeContext | null | undefined,
  options: LowCodeButtonDisabledOptions = {},
): boolean {
  if (action.disabled === true) return true;
  if (context?.state.status.mesCommandExecuting === true) return true;
  if (!context || options.enabled === false) return false;

  const code = normalizeLowCodeEditPageActionCode(action.code);
  const disabledFunction = normalizedButtonDisabledFunctions[code];
  return disabledFunction ? disabledFunction(context) : false;
}
