import { reactive, type InjectionKey } from 'vue';
import type { LowCodeHostServiceApi } from '../core/host';
import type { LowCodePageBlock, LowCodePageFormBlock, LowCodePageRecord, LowCodePageSearchFormBlock } from '../types/lowcode';
import type { LowCodePageRuntimeContext } from './page-runtime';
import { createLowCodeSearchFilters } from '../lowcode/search-query-logic';
import { cloneRuntimeValue, isRecord } from './renderer-value-utils';

export type SearchModel = {
  id: string;
  name: string;
  active: boolean;
  query_values: Record<string, unknown>;
};
type SearchBlock = LowCodePageFormBlock | LowCodePageSearchFormBlock;

export function isSearchBlock(block: { kind: string; formType?: unknown }): block is SearchBlock {
  return block.kind === 'searchForm' || (block.kind === 'form' && block.formType === 'search');
}

export class SearchModelController {
  readonly state = reactive({ models: [] as SearchModel[], activeId: '', loading: false, ready: false });
  private pageCode = '';
  private generation = 0;
  private defaults: Record<string, Record<string, unknown>> = {};

  constructor(private readonly dependencies: {
    getPage(): LowCodePageRecord;
    getBlocks(): LowCodePageBlock[];
    getApi(): LowCodeHostServiceApi;
    runtime: LowCodePageRuntimeContext;
    getSourceKeys(block: SearchBlock): string[];
    refresh(sourceKeys: string[]): Promise<unknown>;
    commitForms(): Promise<unknown>;
    reportError(error: unknown): void;
  }) {}

  readonly enabled = (block: { kind: string; formType?: unknown }) =>
    this.dependencies.getPage().page_type === 'list' && isSearchBlock(block);

  readonly serviceApi = () => this.dependencies.getApi();

  private blocks() { return this.dependencies.getBlocks().filter(isSearchBlock); }

  private bind(model: SearchModel) {
    const forms = isRecord(model.query_values.forms) ? model.query_values.forms : {};
    const sources = new Set<string>();
    for (const block of this.blocks()) {
      const savedValues = forms[block.id];
      const values = cloneRuntimeValue(isRecord(savedValues) ? savedValues : this.defaults[block.id] ?? {});
      this.dependencies.runtime.replaceForm(block.id, values);
      const filters = createLowCodeSearchFilters(values, block.queryLogic ?? block.schema.queryLogic);
      for (const key of this.dependencies.getSourceKeys(block)) {
        this.dependencies.runtime.replaceSearch(key, filters);
        sources.add(key);
      }
    }
    return [...sources];
  }

  /** Runs after defaults are initialized and before any grid request can auto-save. */
  readonly hydrate = async (page: LowCodePageRecord) => {
    if (page.page_type !== 'list' || !this.blocks().length) {
      this.reset('');
      return;
    }
    if (this.pageCode !== page.code) this.reset(page.code);
    if (this.state.ready) return;
    const generation = this.generation;
    this.state.loading = true;
    this.defaults = Object.fromEntries(this.blocks().map((block) => [
      block.id, cloneRuntimeValue(this.dependencies.runtime.state.forms[block.id] ?? {}),
    ]));
    try {
      const rows = await this.dependencies.getApi().invoke<SearchModel[]>('lowcode', 'listSearchModels', { pageCode: page.code });
      if (generation !== this.generation || page.code !== this.dependencies.getPage().code) return;
      this.state.models = rows;
      const active = rows.find((model) => model.active);
      this.state.activeId = active?.id ?? '';
      if (active) this.bind(active);
      this.state.ready = true;
    } finally {
      if (generation === this.generation) this.state.loading = false;
    }
  };

  private reset(pageCode: string) {
    this.generation += 1;
    this.pageCode = pageCode;
    this.state.models = [];
    this.state.activeId = '';
    this.state.ready = false;
    this.defaults = {};
  }

  readonly acceptSaved = (value: unknown) => {
    if (!isRecord(value) || typeof value.id !== 'string' || value.page_code !== this.dependencies.getPage().code) return;
    const model = value as unknown as SearchModel;
    const exists = this.state.models.some((row) => row.id === model.id);
    this.state.models = (exists
      ? this.state.models.map((row) => row.id === model.id ? model : row)
      : [...this.state.models, model])
      .map((row) => ({ ...row, active: row.id === model.id }));
    this.state.activeId = model.id;
  };

  readonly select = async (model: SearchModel) => {
    if (this.state.loading || model.id === this.state.activeId) return;
    this.state.loading = true;
    const pageCode = this.dependencies.getPage().code;
    try {
      const saved = await this.dependencies.getApi().invoke<SearchModel>('lowcode', 'saveSearchModel', {
        pageCode, modelId: model.id, queryValues: model.query_values,
      });
      if (pageCode !== this.dependencies.getPage().code) return;
      this.acceptSaved(saved);
      await this.dependencies.refresh(this.bind(saved));
    } catch (error) {
      this.dependencies.reportError(error);
    } finally { this.state.loading = false; }
  };

  readonly create = async (name: string) => {
    if (this.state.loading) return false;
    this.state.loading = true;
    const pageCode = this.dependencies.getPage().code;
    try {
      await this.dependencies.commitForms();
      const forms = Object.fromEntries(this.blocks().map((block) => [
        block.id, cloneRuntimeValue(this.dependencies.runtime.state.forms[block.id] ?? {}),
      ]));
      const saved = await this.dependencies.getApi().invoke<SearchModel>('lowcode', 'createSearchModel', {
        pageCode, name: name.trim(), queryValues: { forms },
      });
      if (pageCode !== this.dependencies.getPage().code) return false;
      this.acceptSaved(saved);
      try {
        await this.dependencies.refresh(this.bind(saved));
      } catch (error) {
        // The scheme has been saved even if its data query subsequently fails.
        this.dependencies.reportError(error);
      }
      return true;
    } catch (error) {
      this.dependencies.reportError(error);
      return false;
    } finally { this.state.loading = false; }
  };
}

export const searchModelControllerKey: InjectionKey<SearchModelController> = Symbol('searchModelController');
