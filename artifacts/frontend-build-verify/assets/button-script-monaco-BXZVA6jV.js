const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/javascript-DTDD2RIr.js","assets/editor.api-kaAnuSuf.js","assets/rolldown-runtime-CNC7AqOf.js","assets/editor-Dmej0OZd.css"])))=>i.map(i=>d[i]);
import{t as e}from"./preload-helper-Czpn1I53.js";import{a as t,i as n,n as r,s as i,t as a}from"./editor.api-kaAnuSuf.js";var o=`lowcode-button-javascript`,s=`inmemory://lowcode-button-script/editor-`,c=`inmemory://lowcode-button-script/analysis-`,l=`inmemory://lowcode-button-script/lowcode-button-script-context.d.ts`,u=`lowcode-button-script`,d=`async function __lowCodeButtonScript(
  this: LowCodeButtonScriptThis,
) {
`,f=`
}`,p=!1,m=0,h,g=new WeakMap,_=`
interface LowCodeRecord {
  readonly [key: string]: unknown;
}

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
`;function v(e){return`${d}${e}${f}`}function y(e){return e?.map(e=>e.text??``).join(``)??``}function b(e){if(typeof e==`string`)return e;if(!e||typeof e!=`object`)return String(e??``);let t=e;return[b(t.messageText),Array.isArray(t.next)?t.next.map(b).filter(Boolean).join(`
`):``].filter(Boolean).join(`
`)}function x(e){return e.includes(`method`)||e.includes(`function`)?i.CompletionItemKind.Function:e.includes(`property`)||e.includes(`member`)?i.CompletionItemKind.Property:e.includes(`interface`)?i.CompletionItemKind.Interface:e.includes(`class`)?i.CompletionItemKind.Class:e.includes(`keyword`)?i.CompletionItemKind.Keyword:i.CompletionItemKind.Variable}function S(e){return e===0?a.Warning:e===2?a.Hint:e===3?a.Info:a.Error}function C(){return t.createWebWorker({moduleId:`vs/language/typescript/tsWorker`,label:`typescript`,keepIdleModels:!0,createData:{compilerOptions:{allowNonTsExtensions:!0,lib:[`lib.es2020.d.ts`],noEmit:!0,target:i.typescript.ScriptTarget.ES2020},extraLibs:{[l]:{content:_,version:1}},inlayHintsOptions:{}}})}function w(e,n){n.validationTimer&&globalThis.clearTimeout(n.validationTimer),n.changeSubscription.dispose(),n.disposeSubscription.dispose(),n.analysisModel.isDisposed()||n.analysisModel.dispose(),t.setModelMarkers(e,u,[]),g.delete(e)}function T(e){let r=g.get(e);if(r)return r.analysisModel;let i=++m,a=t.createModel(v(e.getValue()),o,n.parse(`${c}${i}.ts`)),s={};return s.analysisModel=a,s.validationVersion=0,s.changeSubscription=e.onDidChangeContent(()=>{a.setValue(v(e.getValue())),A(e)}),s.disposeSubscription=e.onWillDispose(()=>{w(e,s)}),g.set(e,s),a}async function E(e){let t=T(e);return h??=C(),{analysisModel:t,service:await h.withSyncedResources([t.uri])}}function D(e,t){if(!t)return;let n=d.length,i=Math.max(0,t.start-n),a=Math.max(i,i+t.length);return r.fromPositions(e.getPositionAt(Math.min(i,e.getValueLength())),e.getPositionAt(Math.min(a,e.getValueLength())))}function O(e,t){if(typeof t.start!=`number`)return;let n=d.length,r=t.start-n;if(r<0||r>e.getValueLength())return;let i=Math.min(e.getValueLength(),r+Math.max(1,t.length??1)),a=e.getPositionAt(r),o=e.getPositionAt(i);return{code:String(t.code),message:b(t.messageText),severity:S(t.category),startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:o.lineNumber,endColumn:o.column}}async function k(e){let{analysisModel:t,service:n}=await E(e),r=t.uri.toString();return(await Promise.all([n.getSyntacticDiagnostics(r),n.getSemanticDiagnostics(r)])).flat().map(t=>O(e,t)).filter(e=>!!e)}function A(e){let n=g.get(e);if(!n||e.isDisposed())return;n.validationTimer&&globalThis.clearTimeout(n.validationTimer);let r=++n.validationVersion;n.validationTimer=globalThis.setTimeout(()=>{k(e).then(n=>{e.isDisposed()||g.get(e)?.validationVersion!==r||t.setModelMarkers(e,u,n)}).catch(()=>void 0)},180)}async function j(e,t){let{analysisModel:n,service:r}=await E(e);return r.getCompletionsAtPosition(n.uri.toString(),d.length+t)}function M(e){F();let r=++m,i=t.createModel(e,o,n.parse(`${s}${r}.js`));return T(i),A(i),i}function N(e){return e.getValue()}function P(e,t){e.setValue(t)}function F(){p||(p=!0,i.register({id:o,aliases:[`Button JavaScript`]}),i.setLanguageConfiguration(o,{comments:{lineComment:`//`,blockComment:[`/*`,`*/`]},brackets:[[`{`,`}`],[`[`,`]`],[`(`,`)`]],autoClosingPairs:[{open:`{`,close:`}`},{open:`[`,close:`]`},{open:`(`,close:`)`},{open:`"`,close:`"`,notIn:[`string`]},{open:`'`,close:`'`,notIn:[`string`,`comment`]},{open:"`",close:"`",notIn:[`string`,`comment`]}],surroundingPairs:[{open:`{`,close:`}`},{open:`[`,close:`]`},{open:`(`,close:`)`},{open:`"`,close:`"`},{open:`'`,close:`'`},{open:"`",close:"`"}]}),i.setMonarchTokensProvider(o,e(()=>import(`./javascript-DTDD2RIr.js`).then(e=>e.language),__vite__mapDeps([0,1,2,3]))),i.registerCompletionItemProvider(o,{triggerCharacters:[`.`],async provideCompletionItems(e,t){let n=await j(e,e.getOffsetAt(t)),i=e.getWordUntilPosition(t),a=new r(t.lineNumber,i.startColumn,t.lineNumber,i.endColumn);return{suggestions:(n?.entries??[]).map(t=>({label:t.name,insertText:t.name,sortText:t.sortText,kind:x(String(t.kind??``)),range:D(e,t.replacementSpan)??a}))}}}),i.registerHoverProvider(o,{async provideHover(e,t){let{analysisModel:n,service:r}=await E(e),i=await r.getQuickInfoAtPosition(n.uri.toString(),d.length+e.getOffsetAt(t));return i?{range:D(e,i.textSpan),contents:[{value:`\`\`\`typescript\n${y(i.displayParts)}\n\`\`\``},{value:y(i.documentation)}].filter(e=>e.value)}:null}}),i.registerSignatureHelpProvider(o,{signatureHelpTriggerCharacters:[`(`,`,`],async provideSignatureHelp(e,t){let{analysisModel:n,service:r}=await E(e),i=await r.getSignatureHelpItems(n.uri.toString(),d.length+e.getOffsetAt(t),{triggerReason:{kind:`invoked`}});return i?{value:{activeSignature:i.selectedItemIndex??0,activeParameter:i.argumentIndex??0,signatures:(i.items??[]).map(e=>({label:`${y(e.prefixDisplayParts)}${(e.parameters??[]).map(e=>y(e.displayParts)).join(y(e.separatorDisplayParts))}${y(e.suffixDisplayParts)}`,documentation:y(e.documentation),parameters:(e.parameters??[]).map(e=>({label:y(e.displayParts),documentation:y(e.documentation)}))}))},dispose(){}}:null}}))}export{P as a,F as i,M as n,N as r,o as t};