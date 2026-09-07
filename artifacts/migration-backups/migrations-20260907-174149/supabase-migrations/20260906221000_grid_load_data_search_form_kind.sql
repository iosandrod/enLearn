-- Include dedicated searchForm blocks in grid loadData filters.

begin;

do $$
declare
  v_source_code text;
  v_old text := $old$.filter((candidate) => candidate.kind === 'form' && candidate.formType === 'search')$old$;
  v_new text := $new$.filter((candidate) =>
      candidate.kind === 'searchForm' ||
      (candidate.kind === 'form' && candidate.formType === 'search')
    )$new$;
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

  if position(v_old in v_source_code) > 0 then
    v_source_code := replace(v_source_code, v_old, v_new);
  elsif position($already$candidate.kind === 'searchForm' ||$already$ in v_source_code) = 0 then
    raise exception 'Low-code grid loadData action has an unsupported search-form filter.';
  end if;

  update public.lowcode_node_actions
  set source_code = v_source_code,
      updated_at = timezone('utc'::text, now())
  where node_type = 'grid'
    and action_code = 'loadData';
end $$;

commit;
