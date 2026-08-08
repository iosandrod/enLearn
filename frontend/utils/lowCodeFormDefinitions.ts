import type {
  LowCodeFormSchema,
  LowCodePageRecord,
} from '@enlearn/lowcode-framework/types/lowcode';
import type { LowCodeContextSource } from '@enlearn/lowcode-framework/runtime';

export const PAGE_INFO_DESIGN_FORM_CODE = 'page-info-design';

export const LOW_CODE_FORM_CODES = {
  accountProfile: 'account-profile',
  accountEmail: 'account-email',
  dashboardSettings: 'dashboard-settings',
  postEditor: 'post-editor',
  lowCodePageEditor: 'lowcode-page-editor',
  entityDesignTable: 'entity-design-table',
  entityDesignColumn: 'entity-design-column',
  entityDesignColumns: 'entity-design-columns',
  entityDesignRelation: 'entity-design-relation',
  entityDesignLeftPanel: 'entity-design-left-panel',
  entityDesignRightPanel: 'entity-design-right-panel',
  entityDesignLoadPhysicalTables: 'entity-design-load-physical-tables',
  pageInfoDesign: PAGE_INFO_DESIGN_FORM_CODE,
} as const;

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

export function createEmptyLowCodeFormSchema(): LowCodeFormSchema {
  return { fields: [], actions: [] };
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
  const definitions = await loadLowCodeFormDefinitions(serviceApi, [code]);
  return definitions[code];
}

export async function loadLowCodeFormDefinitions<TCode extends string>(
  serviceApi: ServiceApi,
  codes: readonly TCode[],
) {
  const requestedCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))] as TCode[];
  if (!requestedCodes.length) return {} as Record<TCode, LowCodeFormDefinitionRecord>;

  const rows = await serviceApi.invoke<LowCodeFormDefinitionRecord[]>(
    'lowcode',
    'listItems',
    {
      resource: 'lowcode_form_definitions',
      filters: { code: requestedCodes, enabled: true },
      limit: requestedCodes.length,
    },
  );
  const definitions = Object.fromEntries(
    (Array.isArray(rows) ? rows : []).map((definition) => {
      try {
        assertLowCodeFormSchema(definition.schema);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'schema 格式不正确。';
        throw new Error(`低代码表单定义“${definition.code}”无效：${message}`);
      }

      return [
        definition.code,
        {
          ...definition,
          schema: structuredClone(definition.schema),
        },
      ];
    }),
  ) as Record<string, LowCodeFormDefinitionRecord>;
  const missingCodes = requestedCodes.filter((code) => !definitions[code]);

  if (missingCodes.length) {
    throw new Error(`低代码表单定义“${missingCodes.join('、')}”不存在或已停用。`);
  }

  return definitions as Record<TCode, LowCodeFormDefinitionRecord>;
}
