import { Monaco } from '../common/monaco-editor/monaco';

export const BUTTON_SCRIPT_LANGUAGE_ID = 'lowcode-button-javascript';
export const BUTTON_SCRIPT_URI_PREFIX = 'inmemory://lowcode-button-script/editor-';
const BUTTON_SCRIPT_ANALYSIS_URI_PREFIX =
  'inmemory://lowcode-button-script/analysis-';
const BUTTON_SCRIPT_TYPE_URI =
  'inmemory://lowcode-button-script/lowcode-button-script-context.d.ts';
const BUTTON_SCRIPT_MARKER_OWNER = 'lowcode-button-script';
const BUTTON_SCRIPT_WRAPPER_PREFIX = `async function __lowCodeButtonScript(
  this: LowCodeButtonScriptThis,
) {
`;
const BUTTON_SCRIPT_WRAPPER_SUFFIX = '\n}';

let buttonScriptLanguageRegistered = false;
let buttonScriptModelSeed = 0;
let buttonScriptWorker:
  | Monaco.editor.MonacoWebWorker<Monaco.languages.typescript.TypeScriptWorker>
  | undefined;

type ButtonScriptModelLink = {
  analysisModel: Monaco.editor.ITextModel;
  changeSubscription: Monaco.IDisposable;
  disposeSubscription: Monaco.IDisposable;
  validationTimer?: ReturnType<typeof globalThis.setTimeout>;
  validationVersion: number;
};

const buttonScriptModelLinks = new WeakMap<
  Monaco.editor.ITextModel,
  ButtonScriptModelLink
>();

export const buttonScriptContextTypes = `
interface LowCodeRecord {
  readonly [key: string]: unknown;
}

declare const console: {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};

interface LowCodeButtonScriptContextSnapshot {
  readonly page: LowCodeRecord;
  readonly route: LowCodeRecord;
  readonly data: { readonly [key: string]: unknown };
  readonly forms: { readonly [key: string]: LowCodeRecord };
  readonly searches: { readonly [key: string]: LowCodeRecord };
  readonly grids: { readonly [key: string]: unknown };
  readonly event: LowCodeRecord;
}

interface LowCodeActionOptions extends LowCodeRecord {
  node: string;
  method: string;
  data?: unknown;
  mode?: "merge" | "replace";
}

interface LowCodeHttpOptions extends LowCodeRecord {
  api: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: LowCodeRecord;
}

interface LowCodePageFunctionOptions extends LowCodeRecord {
  name: string;
  args?: LowCodeRecord;
}

interface LowCodeButtonScriptThis extends LowCodeButtonScriptContextSnapshot {
  readonly context: LowCodeButtonScriptContextSnapshot;
  executeAction<T = unknown>(options: LowCodeActionOptions): Promise<T>;
  executeHttp<T = unknown>(options: LowCodeHttpOptions): Promise<T>;
  executeFunction<T = unknown>(options: LowCodePageFunctionOptions): Promise<T>;
  readonly $api: {
    invoke<T = unknown>(name: string, payload?: LowCodeRecord): Promise<T>;
  };
  readonly $form: {
    get(blockId: string): LowCodeRecord | undefined;
    patch(blockId: string, values: LowCodeRecord): Promise<LowCodeRecord>;
    replace(blockId: string, values: LowCodeRecord): Promise<LowCodeRecord>;
  };
  readonly $grid: {
    get(blockId: string): unknown;
    setRows(blockId: string, rows: LowCodeRecord[]): Promise<LowCodeRecord[]>;
  };
  readonly $search: {
    get(sourceKey: string): LowCodeRecord | undefined;
    patch(sourceKey: string, values: LowCodeRecord): Promise<LowCodeRecord>;
    replace(sourceKey: string, values: LowCodeRecord): Promise<LowCodeRecord>;
  };
  readonly $source: {
    get<T = unknown>(sourceKey: string): T;
    set(sourceKey: string, value: unknown): Promise<boolean>;
    refresh<T = unknown>(sourceKey: string): Promise<T>;
    refreshAll(): Promise<{ [key: string]: unknown }>;
  };
  readonly $page: { refresh(): Promise<boolean> };
  readonly $router: { push(to: string | LowCodeRecord): Promise<boolean> };
  readonly $message: {
    success(text: string): Promise<boolean>;
    info(text: string): Promise<boolean>;
    warning(text: string): Promise<boolean>;
    error(text: string): Promise<boolean>;
  };
  readonly $dialog: { open(config: LowCodeRecord): Promise<LowCodeRecord> };
  readonly $events: {
    emit(name: string, payload?: LowCodeRecord): Promise<boolean>;
  };
}
`;

function createAnalysisSource(value: string) {
  return `${BUTTON_SCRIPT_WRAPPER_PREFIX}${value}${BUTTON_SCRIPT_WRAPPER_SUFFIX}`;
}

function readDisplayParts(parts: Array<{ text?: string }> | undefined) {
  return parts?.map((part) => part.text ?? '').join('') ?? '';
}

function readDiagnosticMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value ?? '');
  const record = value as { messageText?: unknown; next?: unknown[] };
  const current = readDiagnosticMessage(record.messageText);
  const next = Array.isArray(record.next)
    ? record.next.map(readDiagnosticMessage).filter(Boolean).join('\n')
    : '';
  return [current, next].filter(Boolean).join('\n');
}

function completionKind(kind: string) {
  if (kind.includes('method') || kind.includes('function')) {
    return Monaco.languages.CompletionItemKind.Function;
  }
  if (kind.includes('property') || kind.includes('member')) {
    return Monaco.languages.CompletionItemKind.Property;
  }
  if (kind.includes('interface')) {
    return Monaco.languages.CompletionItemKind.Interface;
  }
  if (kind.includes('class')) return Monaco.languages.CompletionItemKind.Class;
  if (kind.includes('keyword')) return Monaco.languages.CompletionItemKind.Keyword;
  return Monaco.languages.CompletionItemKind.Variable;
}

function markerSeverity(category: number) {
  if (category === 0) return Monaco.MarkerSeverity.Warning;
  if (category === 2) return Monaco.MarkerSeverity.Hint;
  if (category === 3) return Monaco.MarkerSeverity.Info;
  return Monaco.MarkerSeverity.Error;
}

function createButtonScriptWorker() {
  return Monaco.editor.createWebWorker<Monaco.languages.typescript.TypeScriptWorker>({
    moduleId: 'vs/language/typescript/tsWorker',
    label: 'typescript',
    keepIdleModels: true,
    createData: {
      compilerOptions: {
        allowNonTsExtensions: true,
        lib: ['lib.es2020.d.ts'],
        noEmit: true,
        target: Monaco.languages.typescript.ScriptTarget.ES2020,
      },
      extraLibs: {
        [BUTTON_SCRIPT_TYPE_URI]: {
          content: buttonScriptContextTypes,
          version: 1,
        },
      },
      inlayHintsOptions: {},
    },
  });
}

function disposeButtonScriptModelLink(
  model: Monaco.editor.ITextModel,
  link: ButtonScriptModelLink,
) {
  if (link.validationTimer) globalThis.clearTimeout(link.validationTimer);
  link.changeSubscription.dispose();
  link.disposeSubscription.dispose();
  if (!link.analysisModel.isDisposed()) link.analysisModel.dispose();
  Monaco.editor.setModelMarkers(model, BUTTON_SCRIPT_MARKER_OWNER, []);
  buttonScriptModelLinks.delete(model);
}

function ensureButtonScriptAnalysisModel(model: Monaco.editor.ITextModel) {
  const existing = buttonScriptModelLinks.get(model);
  if (existing) return existing.analysisModel;

  const seed = ++buttonScriptModelSeed;
  const analysisModel = Monaco.editor.createModel(
    createAnalysisSource(model.getValue()),
    BUTTON_SCRIPT_LANGUAGE_ID,
    Monaco.Uri.parse(`${BUTTON_SCRIPT_ANALYSIS_URI_PREFIX}${seed}.ts`),
  );
  const link = {} as ButtonScriptModelLink;
  link.analysisModel = analysisModel;
  link.validationVersion = 0;
  link.changeSubscription = model.onDidChangeContent(() => {
    analysisModel.setValue(createAnalysisSource(model.getValue()));
    scheduleButtonScriptValidation(model);
  });
  link.disposeSubscription = model.onWillDispose(() => {
    disposeButtonScriptModelLink(model, link);
  });
  buttonScriptModelLinks.set(model, link);
  return analysisModel;
}

async function getButtonScriptLanguageService(model: Monaco.editor.ITextModel) {
  const analysisModel = ensureButtonScriptAnalysisModel(model);
  buttonScriptWorker ??= createButtonScriptWorker();
  const service = await buttonScriptWorker.withSyncedResources([
    analysisModel.uri,
  ]);
  return { analysisModel, service };
}

function toButtonScriptModelRange(
  model: Monaco.editor.ITextModel,
  span?: { start: number; length: number },
) {
  if (!span) return undefined;
  const scriptStart = BUTTON_SCRIPT_WRAPPER_PREFIX.length;
  const start = Math.max(0, span.start - scriptStart);
  const end = Math.max(start, start + span.length);
  return Monaco.Range.fromPositions(
    model.getPositionAt(Math.min(start, model.getValueLength())),
    model.getPositionAt(Math.min(end, model.getValueLength())),
  );
}

function diagnosticToMarker(
  model: Monaco.editor.ITextModel,
  diagnostic: Monaco.languages.typescript.Diagnostic,
): Monaco.editor.IMarkerData | undefined {
  if (typeof diagnostic.start !== 'number') return undefined;
  const scriptStart = BUTTON_SCRIPT_WRAPPER_PREFIX.length;
  const relativeStart = diagnostic.start - scriptStart;
  if (relativeStart < 0 || relativeStart > model.getValueLength()) return undefined;
  const relativeEnd = Math.min(
    model.getValueLength(),
    relativeStart + Math.max(1, diagnostic.length ?? 1),
  );
  const start = model.getPositionAt(relativeStart);
  const end = model.getPositionAt(relativeEnd);
  return {
    code: String(diagnostic.code),
    message: readDiagnosticMessage(diagnostic.messageText),
    severity: markerSeverity(diagnostic.category),
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

export async function getButtonScriptMonacoDiagnostics(
  model: Monaco.editor.ITextModel,
) {
  const { analysisModel, service } = await getButtonScriptLanguageService(model);
  const fileName = analysisModel.uri.toString();
  const diagnostics = (
    await Promise.all([
      service.getSyntacticDiagnostics(fileName),
      service.getSemanticDiagnostics(fileName),
    ])
  ).flat();
  return diagnostics
    .map((diagnostic) => diagnosticToMarker(model, diagnostic))
    .filter((marker): marker is Monaco.editor.IMarkerData => Boolean(marker));
}

function scheduleButtonScriptValidation(model: Monaco.editor.ITextModel) {
  const link = buttonScriptModelLinks.get(model);
  if (!link || model.isDisposed()) return;
  if (link.validationTimer) globalThis.clearTimeout(link.validationTimer);
  const version = ++link.validationVersion;
  link.validationTimer = globalThis.setTimeout(() => {
    void getButtonScriptMonacoDiagnostics(model).then((markers) => {
      if (
        model.isDisposed() ||
        buttonScriptModelLinks.get(model)?.validationVersion !== version
      ) {
        return;
      }
      Monaco.editor.setModelMarkers(model, BUTTON_SCRIPT_MARKER_OWNER, markers);
    }).catch(() => undefined);
  }, 180);
}

export async function getButtonScriptCompletionsAtOffset(
  model: Monaco.editor.ITextModel,
  offset: number,
) {
  const { analysisModel, service } = await getButtonScriptLanguageService(model);
  return service.getCompletionsAtPosition(
    analysisModel.uri.toString(),
    BUTTON_SCRIPT_WRAPPER_PREFIX.length + offset,
  );
}

export function createButtonScriptMonacoModel(value: string) {
  registerButtonScriptMonacoTypes();
  const seed = ++buttonScriptModelSeed;
  const model = Monaco.editor.createModel(
    value,
    BUTTON_SCRIPT_LANGUAGE_ID,
    Monaco.Uri.parse(`${BUTTON_SCRIPT_URI_PREFIX}${seed}.js`),
  );
  ensureButtonScriptAnalysisModel(model);
  scheduleButtonScriptValidation(model);
  return model;
}

export function getButtonScriptModelValue(model: Monaco.editor.ITextModel) {
  return model.getValue();
}

export function setButtonScriptModelValue(
  model: Monaco.editor.ITextModel,
  value: string,
) {
  model.setValue(value);
}

export function registerButtonScriptMonacoTypes() {
  if (buttonScriptLanguageRegistered) return;
  buttonScriptLanguageRegistered = true;

  Monaco.languages.register({
    id: BUTTON_SCRIPT_LANGUAGE_ID,
    aliases: ['Button JavaScript'],
  });
  Monaco.languages.setLanguageConfiguration(BUTTON_SCRIPT_LANGUAGE_ID, {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
  });
  Monaco.languages.setMonarchTokensProvider(
    BUTTON_SCRIPT_LANGUAGE_ID,
    import(
      'monaco-editor/esm/vs/basic-languages/javascript/javascript.js'
    ).then((module) => module.language),
  );

  Monaco.languages.registerCompletionItemProvider(BUTTON_SCRIPT_LANGUAGE_ID, {
    triggerCharacters: ['.'],
    async provideCompletionItems(model, position) {
      const info = await getButtonScriptCompletionsAtOffset(
        model,
        model.getOffsetAt(position),
      );
      const word = model.getWordUntilPosition(position);
      const defaultRange = new Monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      return {
        suggestions: (info?.entries ?? []).map((entry: any) => ({
          label: entry.name,
          insertText: entry.name,
          sortText: entry.sortText,
          kind: completionKind(String(entry.kind ?? '')),
          range: toButtonScriptModelRange(model, entry.replacementSpan) ?? defaultRange,
        })),
      };
    },
  });

  Monaco.languages.registerHoverProvider(BUTTON_SCRIPT_LANGUAGE_ID, {
    async provideHover(model, position) {
      const { analysisModel, service } = await getButtonScriptLanguageService(model);
      const info: any = await service.getQuickInfoAtPosition(
        analysisModel.uri.toString(),
        BUTTON_SCRIPT_WRAPPER_PREFIX.length + model.getOffsetAt(position),
      );
      if (!info) return null;
      return {
        range: toButtonScriptModelRange(model, info.textSpan),
        contents: [
          { value: `\`\`\`typescript\n${readDisplayParts(info.displayParts)}\n\`\`\`` },
          { value: readDisplayParts(info.documentation) },
        ].filter((item) => item.value),
      };
    },
  });

  Monaco.languages.registerSignatureHelpProvider(BUTTON_SCRIPT_LANGUAGE_ID, {
    signatureHelpTriggerCharacters: ['(', ','],
    async provideSignatureHelp(model, position) {
      const { analysisModel, service } = await getButtonScriptLanguageService(model);
      const info: any = await service.getSignatureHelpItems(
        analysisModel.uri.toString(),
        BUTTON_SCRIPT_WRAPPER_PREFIX.length + model.getOffsetAt(position),
        { triggerReason: { kind: 'invoked' } },
      );
      if (!info) return null;
      return {
        value: {
          activeSignature: info.selectedItemIndex ?? 0,
          activeParameter: info.argumentIndex ?? 0,
          signatures: (info.items ?? []).map((item: any) => ({
            label: `${readDisplayParts(item.prefixDisplayParts)}${(item.parameters ?? [])
              .map((parameter: any) => readDisplayParts(parameter.displayParts))
              .join(readDisplayParts(item.separatorDisplayParts))}${readDisplayParts(item.suffixDisplayParts)}`,
            documentation: readDisplayParts(item.documentation),
            parameters: (item.parameters ?? []).map((parameter: any) => ({
              label: readDisplayParts(parameter.displayParts),
              documentation: readDisplayParts(parameter.documentation),
            })),
          })),
        },
        dispose() {},
      };
    },
  });
}
