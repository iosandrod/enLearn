import type { Component } from 'vue';
import type { LowCodeHostServiceApi } from '../../core/host';

export type LowCodeMaterialKind = 'page' | 'form';

export type LowCodeMaterialRow = {
  id: string;
  material_kind: LowCodeMaterialKind;
  code: string;
  label: string;
  description?: string | null;
  category: string;
  renderer_type: 'code' | 'schema' | 'vue-sfc';
  source_path: string;
  source_text: string;
  source_hash: string;
  material_version: string;
  aliases: string[];
  sort_order: number;
  manifest: Record<string, unknown>;
  dependencies: string[];
  status: 'draft' | 'published' | 'deprecated' | 'disabled';
  enabled: boolean;
  is_system: boolean;
};

export type LowCodeMaterialCatalogResult = {
  rows: LowCodeMaterialRow[];
  compiled: number;
  errors: LowCodeMaterialLoadError[];
};

export type LowCodeMaterialLoadError = {
  kind: LowCodeMaterialKind;
  code: string;
  message: string;
};

export type LowCodeMaterialModule = Record<string, unknown> & { default?: unknown };

export type LowCodeMaterialModuleResolver = (
  sourcePath: string,
  request: string,
) => LowCodeMaterialModule | undefined;

export type LowCodeCompiledMaterial = {
  component: Component;
  styleId?: string;
};

export type LowCodeMaterialServiceApi = Pick<LowCodeHostServiceApi, 'invoke'>;
