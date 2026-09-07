-- Make grid loadData respect relations configured on detail grids.

begin;

do $$
declare
  v_source_code text;
begin
  select source_code
  into v_source_code
  from public.lowcode_node_actions
  where node_type = 'grid'
    and action_code = 'loadData'
  for update;

  if v_source_code is null then
    raise exception 'Low-code grid loadData action does not exist.';
  end if;

  if position('function readDetailRelation(block)' in v_source_code) = 0 then
    if position('function inferFilterMap(filters, requiredFilters, mainRow) {' in v_source_code) = 0 then
      raise exception 'Low-code grid loadData action has an unsupported source format.';
    end if;

    v_source_code := replace(
      v_source_code,
      $old_helpers$function inferFilterMap(filters, requiredFilters, mainRow) {$old_helpers$,
      $new_helpers$function firstRecord(value) {
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
function inferFilterMap(filters, requiredFilters, mainRow) {$new_helpers$
    );
  end if;

  if position('const detailRelation = readDetailRelation(block);' in v_source_code) = 0 then
    if position($old_relation$    const explicitFilters = isRecord(options.filters) ? options.filters : {};
    const searchFilters = isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {};
    const configuredMap = isRecord(options.filterMap)$old_relation$ in v_source_code) = 0 then
      raise exception 'Low-code grid loadData action is missing its detail filter anchor.';
    end if;

    v_source_code := replace(
      v_source_code,
      $old_relation$    const explicitFilters = isRecord(options.filters) ? options.filters : {};
    const searchFilters = isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {};
    const configuredMap = isRecord(options.filterMap)$old_relation$,
      $new_relation$    const explicitFilters = isRecord(options.filters) ? options.filters : {};
    const searchFilters = isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {};
    const detailRelation = readDetailRelation(block);
    const detailParent = detailRelation
      ? resolveDetailParentRecord(detailRelation, blocks, this.data, this.forms, this.grids)
      : undefined;
    const detailRelationFilters = detailRelation && detailParent
      ? { [detailRelation.foreignKey]: detailParent[detailRelation.parentKey] }
      : {};
    const configuredMap = isRecord(options.filterMap)$new_relation$
    );

    v_source_code := replace(
      v_source_code,
      $old_filters$      ...relationFilters,
      ...explicitFilters,
    };$old_filters$,
      $new_filters$      ...relationFilters,
      ...explicitFilters,
      ...detailRelationFilters,
    };$new_filters$
    );
    v_source_code := replace(
      v_source_code,
      $old_required$      ...requiredFilters,
      ...Object.keys(filterMap),
      ...runtimeFields,$old_required$,
      $new_required$      ...requiredFilters,
      ...Object.keys(filterMap),
      ...(detailRelation ? [detailRelation.foreignKey] : []),
      ...runtimeFields,$new_required$
    );
  end if;

  v_source_code := replace(
    v_source_code,
    $old_enabled$  if (config.enabled === false) return undefined;
$old_enabled$,
    ''
  );

  update public.lowcode_node_actions
  set
    description = '主表使用查询条件；明细表优先按子表配置中的主表字段和关联外键过滤数据。',
    source_code = v_source_code,
    updated_at = timezone('utc'::text, now())
  where node_type = 'grid'
    and action_code = 'loadData';
end $$;

commit;
