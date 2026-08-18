import type { LowCodeHostServiceApi } from '../core/host';
import { isLowCodeFormSchema } from './form-schema';
import type { LowCodeFormSchema } from '../types/lowcode';

export type LowCodeFormDefinitionRecord = {
  code: string;
  name?: string;
  schema: LowCodeFormSchema;
  enabled?: boolean;
};

export async function loadLowCodeFormDefinition(
  serviceApi: LowCodeHostServiceApi,
  code: string,
) {
  const rows = await serviceApi.invoke<LowCodeFormDefinitionRecord[]>(
    'lowcode',
    'listItems',
    {
      resource: 'lowcode_form_definitions',
      filters: { code, enabled: true },
      limit: 1,
    },
  );
  const definition = Array.isArray(rows) ? rows[0] : undefined;

  if (!definition || !isLowCodeFormSchema(definition.schema)) {
    throw new Error(`表单定义“${code}”不存在、已停用或 schema 无效。`);
  }

  return {
    ...definition,
    schema: structuredClone(definition.schema),
  };
}
