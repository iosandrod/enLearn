-- Include values from search-type forms when a main grid loads its data.
-- This keeps the filtering rule in the database-backed grid loadData action.

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

  if position('function readSearchFormFilters(blocks, forms)' in v_source_code) = 0 then
    if position('async function main() {' in v_source_code) = 0 then
      raise exception 'Low-code grid loadData action has an unsupported source format.';
    end if;

    v_source_code := replace(
      v_source_code,
      'async function main() {',
      $helper$function readSearchFormFilters(blocks, forms) {
  return blocks
    .filter((candidate) =>
      candidate.kind === 'searchForm' ||
      (candidate.kind === 'form' && candidate.formType === 'search')
    )
    .reduce((result, candidate) => {
      const values = isRecord(forms[candidate.id]) ? forms[candidate.id] : {};
      Object.entries(values).forEach(([field, value]) => {
        if (hasValue(value) && !isPlaceholder(value)) result[field] = value;
      });
      return result;
    }, {});
}
async function main() {$helper$
    );
  end if;

  if position('const queryFormFilters = readSearchFormFilters(blocks, this.forms);' in v_source_code) = 0 then
    if position($old_filters$    const filters = {
      ...(isRecord(postData.filters) ? postData.filters : {}),
      ...(isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}),
      ...(isRecord(options.filters) ? options.filters : {}),
    };$old_filters$ in v_source_code) = 0 then
      raise exception 'Low-code grid loadData action is missing its main filter anchor.';
    end if;

    v_source_code := replace(
      v_source_code,
      $old_filters$    const filters = {
      ...(isRecord(postData.filters) ? postData.filters : {}),
      ...(isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}),
      ...(isRecord(options.filters) ? options.filters : {}),
    };$old_filters$,
      $new_filters$    const queryFormFilters = readSearchFormFilters(blocks, this.forms);
    const filters = {
      ...(isRecord(postData.filters) ? postData.filters : {}),
      ...queryFormFilters,
      ...(isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}),
      ...(isRecord(options.filters) ? options.filters : {}),
    };$new_filters$
    );
  end if;

  update public.lowcode_node_actions
  set
    description = '主表使用查询表单和查询条件；明细表优先按子表配置中的主表字段和关联外键过滤数据。',
    source_code = v_source_code,
    updated_at = timezone('utc'::text, now())
  where node_type = 'grid'
    and action_code = 'loadData';
end $$;

commit;
