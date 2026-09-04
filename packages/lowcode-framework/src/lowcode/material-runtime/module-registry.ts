import * as Vue from 'vue';
import * as VxePcUi from 'vxe-pc-ui';
import * as VueFlow from '@vue-flow/core';
import * as SvarGantt from '@svar-ui/vue-gantt';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@svar-ui/vue-gantt/style.css';

import LowCodeBlockChildren from '../../components/LowCodeBlockChildren.vue';
import LowCodeForm from '../../components/LowCodeForm.vue';
import LowCodeGrid from '../../components/LowCodeGrid.vue';
import LowCodeTreeItem from '../../components/LowCodeTreeItem.vue';
import * as LegacyWidgets from '../../components/LegacyWidgets';
import * as Host from '../../core/host';
import * as SystemSettings from '../../core/system-settings';
import * as FormSchema from '../form-schema';
import * as FormDefinitionLoader from '../form-definition-loader';
import * as BlockHelpers from '../block-materials/helpers';
import * as BlockEditor from '../../runtime/block-editor';
import * as PageRuntime from '../../runtime/page-runtime';
import * as ButtonDisabled from '../../runtime/button-disabled';
import * as EditPageMode from '../../runtime/edit-page-mode';
import * as GlobalDialog from '../../runtime/global-dialog';
import * as GlobalDialogCore from '../../runtime/global-dialog-core';
import * as GlobalDrawerCore from '../../runtime/global-drawer-core';
import * as LowCodeContextDrawer from '../../runtime/lowcode-context-drawer';
import * as LowCodeContext from '../../runtime/lowcode-context';
import * as LowCodePages from '../../runtime/lowcode-pages';
import * as OptionSourceRegistry from '../../runtime/option-source-registry';
import * as ScriptContextProvider from '../../runtime/script-context-provider';
import * as LowCodeUtils from '../../utils/lowcode';
import * as RuntimeFormDesigner from '../block-materials/runtime-form-designer';
import * as RuntimeFormFieldEditor from '../block-materials/runtime-form-field-editor';
import * as PageGridMenu from '../block-materials/grid/page-grid-menu';
import * as RuntimeGridFieldEditor from '../block-materials/grid/runtime-grid-field-editor';
import * as RuntimeGridDesigner from '../block-materials/grid/runtime-grid-designer';
import * as RelateInfo from '../form-materials/base-info/relate-info';
import * as FormMaterialModel from '../form-materials/useLowCodeFormMaterialModel';
import * as ButtonGroupDesigner from '../../visual-editor/components/button-group-designer/button-group-designer.service';
import * as ButtonScriptMonaco from '../../visual-editor/components/button-group-designer/button-script-monaco';
import * as MonacoModule from '../../visual-editor/components/common/monaco-editor/monaco';
import GanttDisplaySettings from '../block-materials/planning-gantt/GanttDisplaySettings.vue';
import * as GanttSettings from '../block-materials/planning-gantt/display-settings';
import * as ComponentBridge from './component-bridge';
import type { LowCodeMaterialModule, LowCodeMaterialModuleResolver } from './types';

type LowCodeMaterialModuleLoader = () => LowCodeMaterialModule;

const component = (read: () => unknown): LowCodeMaterialModuleLoader =>
  () => ({ __esModule: true, default: read() });
const module = (read: () => LowCodeMaterialModule): LowCodeMaterialModuleLoader => read;

// Keep every bridge entry lazy. Several runtime components import the material
// registries themselves, so reading an imported binding while this module is
// initialized would trigger an ESM temporal-dead-zone error.
const moduleLoaders: Record<string, LowCodeMaterialModuleLoader> = {
  vue: module(() => Vue),
  'vxe-pc-ui': module(() => VxePcUi),
  '@vue-flow/core': module(() => VueFlow),
  '@svar-ui/vue-gantt': module(() => SvarGantt),
  '@vue-flow/core/dist/style.css': () => ({}),
  '@vue-flow/core/dist/theme-default.css': () => ({}),
  '@svar-ui/vue-gantt/style.css': () => ({}),
  '/components/LowCodeBlockChildren.vue': component(() =>
    resolveGlobalComponent('LowCodeBlockChildren') ?? LowCodeBlockChildren),
  '/components/LowCodeForm.vue': component(() =>
    resolveGlobalComponent('LowCodeForm') ?? LowCodeForm),
  '/components/LowCodeGrid.vue': component(() =>
    resolveGlobalComponent('LowCodeGrid') ?? LowCodeGrid),
  '/components/LowCodeTreeItem.vue': component(() =>
    resolveGlobalComponent('LowCodeTreeItem') ?? LowCodeTreeItem),
  '/components/LegacyWidgets': module(() => LegacyWidgets),
  '/core/host': module(() => Host),
  '/core/system-settings': module(() => SystemSettings),
  '/lowcode/form-schema': module(() => FormSchema),
  '/lowcode/form-definition-loader': module(() => FormDefinitionLoader),
  '/lowcode/block-materials/helpers': module(() => BlockHelpers),
  '/runtime/block-editor': module(() => BlockEditor),
  '/runtime/page-runtime': module(() => PageRuntime),
  '/runtime/button-disabled': module(() => ButtonDisabled),
  '/runtime/edit-page-mode': module(() => EditPageMode),
  '/runtime/global-dialog': module(() => GlobalDialog),
  '/runtime/global-dialog-core': module(() => GlobalDialogCore),
  '/runtime/global-drawer-core': module(() => GlobalDrawerCore),
  '/runtime/lowcode-context-drawer': module(() => LowCodeContextDrawer),
  '/runtime/lowcode-context': module(() => LowCodeContext),
  '/runtime/lowcode-pages': module(() => LowCodePages),
  '/runtime/option-source-registry': module(() => OptionSourceRegistry),
  '/runtime/script-context-provider': module(() => ScriptContextProvider),
  '/utils/lowcode': module(() => LowCodeUtils),
  '/lowcode/block-materials/runtime-form-designer': module(() => RuntimeFormDesigner),
  '/lowcode/block-materials/runtime-form-field-editor': module(() => RuntimeFormFieldEditor),
  '/lowcode/block-materials/grid/page-grid-menu': module(() => PageGridMenu),
  '/lowcode/block-materials/grid/runtime-grid-field-editor': module(() => RuntimeGridFieldEditor),
  '/lowcode/block-materials/grid/runtime-grid-designer': module(() => RuntimeGridDesigner),
  '/lowcode/form-materials/base-info/relate-info': module(() => RelateInfo),
  '/lowcode/form-materials/useLowCodeFormMaterialModel': module(() => FormMaterialModel),
  // Some database snapshots retain the historical path relative to a
  // form-material directory (`../../material-runtime/...`). Keep this alias
  // so cold-start SFC compilation remains compatible after source files are
  // retired from the workspace.
  '/lowcode/material-runtime/component-bridge': module(() => ComponentBridge),
  '/visual-editor/components/button-group-designer/button-group-designer.service': module(() => ButtonGroupDesigner),
  '/visual-editor/components/button-group-designer/button-script-monaco': module(() => ButtonScriptMonaco),
  '/visual-editor/components/common/monaco-editor/monaco': module(() => MonacoModule),
  '/lowcode/block-materials/planning-gantt/GanttDisplaySettings.vue': component(() => GanttDisplaySettings),
  '/lowcode/block-materials/planning-gantt/display-settings': module(() => GanttSettings),
};

// Components registered by the host app are preferred over eagerly imported
// bridge values. This avoids circular-initialization artefacts while still
// allowing database SFCs to render components that are globally registered.
function resolveGlobalComponent(name: string) {
  if (typeof window === 'undefined') return undefined;
  const app = (window as typeof window & { __LOWCODE_APP__?: { component?: (name: string) => unknown } }).__LOWCODE_APP__;
  return app?.component?.(name);
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function dirname(path: string) {
  const normalized = normalizePath(path);
  return normalized.slice(0, normalized.lastIndexOf('/')) || '/';
}

function moduleCandidates(path: string) {
  const normalized = normalizePath(path);
  return [
    normalized,
    normalized.replace(/\.(?:ts|tsx|js|mjs)$/, ''),
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.vue`,
    `${normalized}/index.ts`,
    `${normalized}/index.vue`,
  ];
}

export function resolveLowCodeMaterialModule(
  sourcePath: string,
  request: string,
  resolveDynamic?: LowCodeMaterialModuleResolver,
) {
  const globalName = request.startsWith('.') || request.startsWith('/') ? undefined : request;
  const globalComponent = globalName ? resolveGlobalComponent(globalName) : undefined;
  if (globalComponent) return { __esModule: true, default: globalComponent };
  if (!request.startsWith('.') && !request.startsWith('/')) {
    const bareModule = moduleLoaders[request];
    if (bareModule) return bareModule();
    throw new Error(`Material dependency is not allowed: ${request}`);
  }

  const requestedPath = request.startsWith('/')
    ? request
    : `${dirname(sourcePath)}/${request}`;
  for (const candidate of moduleCandidates(requestedPath)) {
    const registered = moduleLoaders[candidate];
    if (registered) return registered();
    const dynamic = resolveDynamic?.(sourcePath, candidate);
    if (dynamic) return dynamic;
  }

  throw new Error(`Material dependency is not registered: ${request} from ${sourcePath}`);
}

export function getLowCodeMaterialRuntimeModules() {
  return Object.fromEntries(
    Object.entries(moduleLoaders).map(([key, load]) => [key, load()]),
  );
}
