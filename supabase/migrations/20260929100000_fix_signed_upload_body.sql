-- Signed upload endpoints receive the file bytes directly. Multipart form data
-- is not a valid body for Supabase signed upload URLs and can be rejected by
-- the real Storage service even when a local adapter accepts it.
begin;

do $update_material$
declare
  v_source text;
begin
  select source_text
    into v_source
    from public.lowcode_materials
   where material_kind = 'form'
     and code = 'vxe-upload'
   for update;

  if v_source is null then
    raise notice 'vxe-upload material is not installed; skipping signed upload body fix.';
    return;
  end if;

  v_source := replace(v_source,
    $$const body = new FormData(); body.append('cacheControl', '3600'); body.append('', file); xhr.send(body);$$,
    $$xhr.send(file);$$
  );

  update public.lowcode_materials
     set source_text = v_source,
         source_hash = md5(v_source),
         material_version = '1.3.1',
         updated_at = timezone('utc'::text, now())
   where material_kind = 'form'
     and code = 'vxe-upload';
end;
$update_material$;

do $validation$
declare
  v_source text;
begin
  select source_text
    into v_source
    from public.lowcode_materials
   where material_kind = 'form'
     and code = 'vxe-upload';

  if v_source is not null and position('new FormData()' in v_source) > 0 then
    raise exception 'Signed upload body fix did not remove multipart FormData.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
