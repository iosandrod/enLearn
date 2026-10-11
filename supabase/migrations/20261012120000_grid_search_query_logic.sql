begin;

update public.lowcode_node_actions
set source_code = $action$
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function readList(value) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}
function hasValue(value) {
  if (value === undefined || value === null || value === '' || value === '__none__') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return hasValue(value.value);
  return true;
}
function isPlaceholder(value) {
  return value === '__none__' ||
    (typeof value === 'string' && /\{\{[\s\S]*?\}\}/.test(value));
}
function currentRow(grid) {
  return grid?.currentRow ?? grid?.selectedRows?.[0] ?? grid?.contextRow ?? null;
}
function firstRecord(value) {
  if (Array.isArray(value)) return value.find(isRecord);
  if (!isRecord(value)) return undefined;
  for (const key of ['rows', 'items', 'records', 'data', 'result']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const record = firstRecord(value[key]);
      if (record) return record;
    }
  }
  return value;
}
function readDetailRelation(block) {
  const config = isRecord(block?.schema?.detailConfig)
    ? block.schema.detailConfig
    : {};
  const parentSourceKey = readString(config.parentSourceKey ?? config.parent_source_key);
  const foreignKey = readString(config.foreignKey ?? config.foreign_key);
  if (!parentSourceKey || !foreignKey) return undefined;
  return {
    parentSourceKey,
    foreignKey,
    parentKey: readString(config.parentKey ?? config.parent_key, 'id'),
  };
}
function resolveDetailParentRecord(relation, blocks, data, forms, grids) {
  const parentGrid = blocks.find((candidate) => candidate.kind === 'grid' && (
    candidate.id === relation.parentSourceKey || candidate.sourceKey === relation.parentSourceKey
  ));
  const gridRecord = parentGrid ? currentRow(grids[parentGrid.id]) : undefined;
  if (isRecord(gridRecord)) return gridRecord;

  const parentForm = blocks.find((candidate) => candidate.kind === 'form' && (
    candidate.id === relation.parentSourceKey || candidate.sourceKey === relation.parentSourceKey
  ));
  const formRecord = parentForm
    ? firstRecord(forms[parentForm.id])
    : firstRecord(forms[relation.parentSourceKey]);
  if (formRecord) return formRecord;

  return firstRecord(data[relation.parentSourceKey]);
}
function inferFilterMap(filters, requiredFilters, mainRow) {
  const entries = readFilterEntries(filters);
  const relationFields = entries
    .filter(({ value }) => isPlaceholder(value))
    .map(({ field }) => field);
  const missing = requiredFilters.filter((field) => {
    const values = entries
      .filter((entry) => entry.field === field)
      .map((entry) => entry.value);
    return !values.length || values.some((value) =>
      !hasValue(value) || isPlaceholder(value));
  });
  return Object.fromEntries([...new Set([...relationFields, ...missing])].map((detailField) => {
    const configured = entries.find((entry) =>
      entry.field === detailField && isPlaceholder(entry.value))?.value ??
      entries.find((entry) => entry.field === detailField)?.value;
    const expressionField = typeof configured === 'string'
      ? configured.match(/\{\{\s*(?:(?:data|grids)\.[^.]+(?:\.currentRow)?|event\.row|row)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/)?.[1] ?? ''
      : '';
    const directField = detailField in mainRow ? detailField : '';
    const conventionalField = detailField.endsWith('_id') && 'id' in mainRow ? 'id' : '';
    return [detailField, expressionField || directField || conventionalField || detailField];
  }));
}
function readSearchQueryRules(block) {
  const value = Array.isArray(block?.queryLogic)
    ? block.queryLogic
    : block?.schema?.queryLogic;
  return Array.isArray(value) ? value : [];
}
function buildSearchFilters(values, queryLogic) {
  if (!queryLogic.length) {
    return Object.fromEntries(Object.entries(values).filter(([, value]) =>
      hasValue(value) && !isPlaceholder(value)
    ));
  }
  const conditions = queryLogic.flatMap((rule) => {
    if (!isRecord(rule) || rule.enabled === false) return [];
    const inputField = readString(rule.inputField ?? rule.sourceField ?? rule.field);
    const field = readString(rule.field, inputField);
    const op = readString(rule.op ?? rule.operator, 'eq');
    const value = values[inputField];
    if (!inputField || !field) return [];
    if (!['isNull', 'isNotNull'].includes(op) && (!hasValue(value) || isPlaceholder(value))) {
      return [];
    }
    return [{ field, op, value, logic: readString(rule.logic).toLowerCase() === 'or' ? 'or' : 'and' }];
  });
  if (!conditions.length) return {};
  let expression = {
    field: conditions[0].field,
    op: conditions[0].op,
    ...(!['isNull', 'isNotNull'].includes(conditions[0].op)
      ? { value: conditions[0].value }
      : {}),
  };
  conditions.slice(1).forEach((condition) => {
    expression = {
      logic: condition.logic,
      conditions: [
        expression,
        {
          field: condition.field,
          op: condition.op,
          ...(!['isNull', 'isNotNull'].includes(condition.op)
            ? { value: condition.value }
            : {}),
        },
      ],
    };
  });
  return Array.isArray(expression.conditions)
    ? expression
    : { logic: 'and', conditions: [expression] };
}
function searchFormTargetsSource(candidate, sourceKey, blocks, dataSources) {
  const targets = [...new Set([
    candidate.targetSourceKey,
    ...(Array.isArray(candidate.targetSourceKeys) ? candidate.targetSourceKeys : []),
  ].map((key) => readString(key)).filter(Boolean))];
  if (targets.includes(sourceKey)) return true;
  const knownKeys = new Set([
    ...Object.keys(dataSources),
    ...blocks.flatMap((node) => readString(node.sourceKey) ? [readString(node.sourceKey)] : []),
  ]);
  if (targets.some((key) => knownKeys.has(key))) return false;
  const listKeys = [...new Set(blocks.flatMap((node) =>
    node.kind === 'grid' && node.tableType !== 'detail' && readString(node.sourceKey)
      ? [readString(node.sourceKey)]
      : []
  ))];
  return listKeys.length === 1 && listKeys[0] === sourceKey;
}
function readSearchFormFilters(blocks, forms, sourceKey, dataSources) {
  return blocks
    .filter((candidate) =>
      (candidate.kind === 'searchForm' ||
        (candidate.kind === 'form' && candidate.formType === 'search')) &&
      searchFormTargetsSource(candidate, sourceKey, blocks, dataSources)
    )
    .reduce((result, candidate) => {
      const values = isRecord(forms[candidate.id]) ? forms[candidate.id] : {};
      return mergeListFilters(result, buildSearchFilters(values, readSearchQueryRules(candidate)));
    }, {});
}
function readSearchFormValues(blocks, forms, sourceKey, dataSources) {
  return Object.fromEntries(blocks
    .filter((candidate) =>
      (candidate.kind === 'searchForm' ||
        (candidate.kind === 'form' && candidate.formType === 'search')) &&
      searchFormTargetsSource(candidate, sourceKey, blocks, dataSources)
    )
    .map((candidate) => [
      candidate.id,
      isRecord(forms[candidate.id]) ? forms[candidate.id] : {},
    ]));
}
function isFilterGroup(value) {
  return isRecord(value) && Array.isArray(value.conditions) &&
    (value.logic === 'and' || value.logic === 'or');
}
function readFilterEntries(filters, conditionNode = false) {
  if (isFilterGroup(filters)) {
    return filters.conditions.flatMap((condition) => readFilterEntries(condition, true));
  }
  if (!isRecord(filters)) return [];
  if (conditionNode) {
    const field = readString(filters.field);
    return field ? [{ field, value: filters.value }] : [];
  }
  return Object.entries(filters).map(([field, value]) => ({ field, value }));
}
function pruneFilterFields(filters, fields, conditionNode = false) {
  if (isFilterGroup(filters)) {
    const conditions = filters.conditions
      .map((condition) => pruneFilterFields(condition, fields, true))
      .filter((condition) => condition !== undefined);
    return conditions.length ? { ...filters, conditions } : undefined;
  }
  if (!isRecord(filters)) return undefined;
  if (conditionNode) {
    return fields.has(readString(filters.field)) ? undefined : filters;
  }
  return Object.fromEntries(
    Object.entries(filters).filter(([field]) => !fields.has(field))
  );
}
function mergeListFilters(configured, additions) {
  if (isFilterGroup(additions)) {
    const fields = new Set(readFilterEntries(additions).map(({ field }) => field));
    const retained = pruneFilterFields(configured, fields);
    const retainedGroup = isFilterGroup(retained)
      ? retained
      : isRecord(retained) && Object.keys(retained).length
        ? {
            logic: 'and',
            conditions: Object.entries(retained).map(([field, value]) =>
              isRecord(value) && typeof value.op === 'string'
                ? { field, ...value }
                : value === null
                  ? { field, op: 'isNull' }
                  : { field, op: Array.isArray(value) ? 'in' : 'eq', value }
            ),
          }
        : undefined;
    return retainedGroup
      ? { logic: 'and', conditions: [retainedGroup, additions] }
      : additions;
  }
  const entries = Object.entries(additions || {});
  if (!entries.length) return isRecord(configured) ? configured : {};
  if (isFilterGroup(configured)) {
    const retained = pruneFilterFields(
      configured,
      new Set(entries.map(([field]) => field))
    );
    return {
      logic: 'and',
      conditions: [
        ...(retained ? [retained] : []),
        ...entries.map(([field, value]) => ({ field, value })),
      ],
    };
  }
  return { ...(isRecord(configured) ? configured : {}), ...additions };
}

async function main() {
  const action = this.event.payload.nodeAction;
  const { block, options, blocks, dataSources } = action;
  const sourceKey = readString(block.sourceKey);
  const source = dataSources[sourceKey];
  if (!source) throw new Error(`表格 "${block.id}" 没有可用的数据源。`);
  const configuredPostData = isRecord(source.postData) ? source.postData : {};
  const resolvedPostData = await this.$node.call('runtime.resolve', {
    value: configuredPostData,
  });
  const postData = {
    ...(isRecord(resolvedPostData) ? resolvedPostData : {}),
    ...(isRecord(options.postData) ? options.postData : {}),
  };
  let requestPostData;
  let skip = false;
  if (block.tableType !== 'detail') {
    const queryFormFilters = readSearchFormFilters(blocks, this.forms, sourceKey, dataSources);
    let filters = mergeListFilters(postData.filters, queryFormFilters);
    filters = mergeListFilters(
      filters,
      isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}
    );
    filters = mergeListFilters(
      filters,
      isRecord(options.filters) ? options.filters : {}
    );
    requestPostData = {
      ...postData,
      ...(Object.keys(filters).length ? { filters } : {}),
    };
  } else {
    const configuredFilters = isRecord(postData.filters) ? postData.filters : {};
    const rawFilters = isRecord(configuredPostData.filters)
      ? configuredPostData.filters
      : configuredFilters;
    const requiredFilters = readList(postData.requiredFilters ?? postData.required_filters);
    const gridBlocks = blocks.filter((candidate) => candidate.kind === 'grid');
    const requestedMain = readString(options.mainGrid);
    const mainGrid = requestedMain
      ? gridBlocks.find((candidate) => candidate.id === requestedMain)
      : gridBlocks.find((candidate) => candidate.tableType === 'main');
    const mainRow = currentRow(mainGrid ? this.grids[mainGrid.id] : undefined);
    const explicitFilters = isRecord(options.filters) ? options.filters : {};
    const searchFilters = isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {};
    const detailRelation = readDetailRelation(block);
    const detailParent = detailRelation
      ? resolveDetailParentRecord(detailRelation, blocks, this.data, this.forms, this.grids)
      : undefined;
    const detailRelationFilters = detailRelation && detailParent
      ? { [detailRelation.foreignKey]: detailParent[detailRelation.parentKey] }
      : {};
    const configuredMap = isRecord(options.filterMap)
      ? Object.fromEntries(Object.entries(options.filterMap)
          .map(([detailField, mainField]) => [detailField, readString(mainField)])
          .filter(([, mainField]) => Boolean(mainField)))
      : {};
    const filterMap = Object.keys(configuredMap).length
      ? configuredMap
      : inferFilterMap(rawFilters, requiredFilters, mainRow ?? {});
    const relationFilters = mainRow
      ? Object.fromEntries(Object.entries(filterMap).map(([detailField, mainField]) =>
          [detailField, mainRow[mainField]]))
      : {};
    let filters = mergeListFilters(configuredFilters, searchFilters);
    filters = mergeListFilters(filters, relationFilters);
    filters = mergeListFilters(filters, explicitFilters);
    filters = mergeListFilters(filters, detailRelationFilters);
    const runtimeFields = [
      ...readFilterEntries(searchFilters),
      ...readFilterEntries(explicitFilters),
    ]
      .filter(({ value }) => hasValue(value) && !isPlaceholder(value))
      .map(({ field }) => field);
    const nextRequired = [...new Set([
      ...requiredFilters,
      ...Object.keys(filterMap),
      ...(detailRelation ? [detailRelation.foreignKey] : []),
      ...runtimeFields,
    ])];
    const filterEntries = readFilterEntries(filters);
    const missingRequired = nextRequired.some((field) => {
      const values = filterEntries
        .filter((entry) => entry.field === field)
        .map((entry) => entry.value);
      return !values.length || values.some((value) =>
        !hasValue(value) || isPlaceholder(value));
    });
    const hasQueryFilters = filterEntries.some(({ value }) =>
      hasValue(value) && !isPlaceholder(value));
    skip = !hasQueryFilters || missingRequired;
    requestPostData = {
      ...postData,
      filters,
      ...(nextRequired.length ? { requiredFilters: nextRequired } : {}),
    };
  }

  const version = await this.$node.call('source.begin', { sourceKey });
  await this.$node.call('loading.grid', { loading: true });
  try {
    const value = skip
      ? []
      : await this.$node.call('source.invoke', { sourceKey, postData: requestPostData });
    const searchFormValues = readSearchFormValues(blocks, this.forms, sourceKey, dataSources);
    if (!skip && block.tableType !== 'detail' && Object.keys(searchFormValues).length) {
      await this.$node.call('searchModel.save', {
        queryValues: {
          sourceKey,
          forms: searchFormValues,
          searches: isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {},
          filters: isRecord(requestPostData.filters) ? requestPostData.filters : {},
        },
      });
    }
    if (await this.$node.call('source.isCurrent', { sourceKey, version })) {
      await this.$node.call('source.set', {
        sourceKey,
        value,
        resetGridBaseline: true,
      });
    }
    return value;
  } finally {
    const current = await this.$node.call('source.isCurrent', { sourceKey, version });
    await this.$node.call('source.finish', { sourceKey, version });
    if (current) await this.$node.call('loading.grid', { loading: false });
  }
}
$action$,
    updated_at = now()
where node_type = 'grid'
  and action_code = 'loadData';

do $$
begin
  if not exists (
    select 1
    from public.lowcode_node_actions
    where node_type = 'grid'
      and action_code = 'loadData'
      and position('function buildSearchFilters(values, queryLogic)' in source_code) > 0
      and position('function searchFormTargetsSource(candidate, sourceKey, blocks, dataSources)' in source_code) > 0
  ) then
    raise exception 'grid.loadData query logic update was not stored';
  end if;
end
$$;

commit;

