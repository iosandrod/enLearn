import type {
  LowCodeFormSchema,
  LowCodePageRecord,
} from '@enlearn/lowcode-framework/types/lowcode';
import type { LowCodeContextSource } from '@enlearn/lowcode-framework/runtime';

export const PAGE_INFO_DESIGN_FORM_CODE = 'page-info-design';

export type LowCodeFormDefinitionRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  schema: LowCodeFormSchema;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ServiceApi = {
  invoke<TResponse = unknown>(
    serviceName: string,
    serviceMethod: string,
    postData?: Record<string, unknown>,
  ): Promise<TResponse>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createPageFunctionContextSource(page: LowCodePageRecord): LowCodeContextSource {
  return {
    page: {
      id: page.id,
      code: page.code,
      route: page.route,
      title: page.title,
      schema: page.schema,
    },
    data: Object.fromEntries(
      Object.keys(page.schema.dataSources ?? {}).map((sourceKey) => [sourceKey, null]),
    ),
    apiNames: Array.isArray(page.schema.scriptPolicy?.apiNames)
      ? page.schema.scriptPolicy.apiNames
      : [],
    capabilities: [
      ...(Array.isArray(page.schema.scriptPolicy?.capabilities)
        ? page.schema.scriptPolicy.capabilities
        : []),
      ...((page.schema.functions?.length ?? 0) > 0
        ? ['action.execute' as const, 'pageFunction.execute' as const]
        : []),
      ...(Object.keys(page.schema.apis ?? {}).length > 0
        ? ['http.execute' as const]
        : []),
    ].filter((capability, index, capabilities) =>
      capabilities.indexOf(capability) === index,
    ),
  };
}

export function assertLowCodeFormSchema(value: unknown): asserts value is LowCodeFormSchema {
  if (!isRecord(value)) {
    throw new Error('表单定义 schema 必须是对象。');
  }
  if (!Array.isArray(value.fields) || !value.fields.length) {
    throw new Error('表单定义 schema.fields 不能为空。');
  }
  if (!Array.isArray(value.actions)) {
    throw new Error('表单定义 schema.actions 必须是数组。');
  }

  const fieldNames = new Set<string>();
  value.fields.forEach((field, index) => {
    if (!isRecord(field)) {
      throw new Error(`表单定义 schema.fields[${index}] 必须是对象。`);
    }
    const fieldName = typeof field.field === 'string' ? field.field.trim() : '';
    const component = typeof field.component === 'string' ? field.component.trim() : '';
    if (!fieldName || !component) {
      throw new Error(`表单定义 schema.fields[${index}] 缺少 field 或 component。`);
    }
    if (fieldNames.has(fieldName)) {
      throw new Error(`表单定义存在重复字段：${fieldName}。`);
    }
    fieldNames.add(fieldName);
  });

  if (value.layout !== undefined && !Array.isArray(value.layout)) {
    throw new Error('表单定义 schema.layout 必须是数组。');
  }
}

function hydratePageInfoRuntimeBindings(
  schema: LowCodeFormSchema,
  page: LowCodePageRecord,
) {
  const functionsField = schema.fields.find((field) => field.field === 'functions');
  const columns = isRecord(functionsField?.props) && Array.isArray(functionsField.props.columns)
    ? functionsField.props.columns
    : [];
  const scriptColumn = columns.find(
    (column) => isRecord(column) && column.field === 'script',
  );

  if (!isRecord(scriptColumn)) {
    throw new Error('页面信息表单缺少 functions.script 编辑列。');
  }

  const columnProps = isRecord(scriptColumn.props) ? scriptColumn.props : {};
  scriptColumn.props = {
    ...columnProps,
    contextSource: createPageFunctionContextSource(page),
  };
}

export function hydratePageInfoDesignSchema(
  value: unknown,
  page: LowCodePageRecord,
) {
  const schema = structuredClone(value);
  assertLowCodeFormSchema(schema);
  hydratePageInfoRuntimeBindings(schema, page);
  return schema;
}

export async function loadLowCodeFormDefinition(
  serviceApi: ServiceApi,
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

  if (!definition) {
    throw new Error(`低代码表单定义“${code}”不存在或已停用。`);
  }

  assertLowCodeFormSchema(definition.schema);
  return definition;
}
