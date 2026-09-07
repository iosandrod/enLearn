-- Do not send empty query-form values as data-source filters.

begin;

do $$
declare
  v_source_code text;
  v_old text := $old$function readSearchFormFilters(blocks, forms) {
  return blocks
    .filter((candidate) =>
      candidate.kind === 'searchForm' ||
      (candidate.kind === 'form' && candidate.formType === 'search')
    )
    .reduce((result, candidate) => {
      const values = isRecord(forms[candidate.id]) ? forms[candidate.id] : {};
      return { ...result, ...values };
    }, {});
}$old$;
  v_new text := $new$function readSearchFormFilters(blocks, forms) {
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
}$new$;
begin
  select source_code
    into v_source_code
  from public.lowcode_node_actions
  where node_type = 'grid'
    and action_code = 'loadData';

  if v_source_code is null then
    raise exception 'Low-code grid loadData action does not exist.';
  end if;

  if position(v_old in v_source_code) > 0 then
    v_source_code := replace(v_source_code, v_old, v_new);
  elsif position($already$Object.entries(values).forEach(([field, value]) => {$already$ in v_source_code) = 0 then
    raise exception 'Low-code grid loadData action has an unsupported search-form filter.';
  end if;

  update public.lowcode_node_actions
  set source_code = v_source_code,
      updated_at = timezone('utc'::text, now())
  where node_type = 'grid'
    and action_code = 'loadData';
end $$;

commit;
