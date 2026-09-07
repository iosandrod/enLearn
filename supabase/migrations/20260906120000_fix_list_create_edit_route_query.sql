-- A list-page create action must not reuse the currently selected row. The
-- shared runtime script previously passed rows[0] to both create and edit,
-- which caused create to open the edit page with the selected record id.

begin;

update public.lowcode_page_runtime
set
  source_code = replace(
    source_code,
    $$    case 'navigateToEdit':
      if (spec.singleSelection) requireRows(true);
      add('page.navigateToEdit', rows[0] ? { row: rows[0] } : {});
      return { effects, resultEffect: 0 };$$,
    $$    case 'navigateToEdit':
      if (spec.singleSelection) requireRows(true);
      add('page.navigateToEdit', spec.singleSelection ? { row: rows[0] } : {});
      return { effects, resultEffect: 0 };$$
  ),
  source_hash = md5(
    replace(
      source_code,
      $$    case 'navigateToEdit':
      if (spec.singleSelection) requireRows(true);
      add('page.navigateToEdit', rows[0] ? { row: rows[0] } : {});
      return { effects, resultEffect: 0 };$$,
      $$    case 'navigateToEdit':
      if (spec.singleSelection) requireRows(true);
      add('page.navigateToEdit', spec.singleSelection ? { row: rows[0] } : {});
      return { effects, resultEffect: 0 };$$
    ) || runtime_spec::text
  ),
  updated_at = timezone('utc'::text, now())
where runtime_key in ('system:page:list.create', 'system:page:list.edit')
  and is_system
  and function_type = 'page_function'
  and source_code like '%add(''page.navigateToEdit'', rows[0] ? { row: rows[0] } : {});%';

commit;
