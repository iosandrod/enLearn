begin;

-- The grid designer uses the array-table material for its column editor. Make
-- the existing tree child action readable when that material is configured for
-- nested column groups.
update public.lowcode_materials
   set source_text = replace(
         source_text,
         '              子' || chr(10) || '            </button>',
         '              {{ addChildText }}' || chr(10) || '            </button>'
       ),
       source_hash = md5(replace(
         source_text,
         '              子' || chr(10) || '            </button>',
         '              {{ addChildText }}' || chr(10) || '            </button>'
       )),
       material_version = '1.2.4',
       updated_at = timezone('utc'::text, now())
 where material_kind = 'form'
   and code = 'lc-array-table';

do $validate_array_table_material$
begin
  if not exists (
    select 1
      from public.lowcode_materials
     where material_kind = 'form'
       and code = 'lc-array-table'
       and position('childAddable' in source_text) > 0
       and position('{{ addChildText }}' in source_text) > 0
  ) then
    raise exception 'lc-array-table child action migration did not install correctly.';
  end if;
end;
$validate_array_table_material$;

select pg_notify('pgrst', 'reload schema');

commit;
