-- Signed upload URLs already encode the non-upsert policy. Do not send the
-- x-upsert header from the database-backed upload material: it adds a custom
-- CORS preflight header and is rejected by some storage deployments.
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
    raise notice 'vxe-upload material is not installed; skipping signed upload CORS fix.';
    return;
  end if;

  v_source := replace(
    v_source,
    $old$    xhr.open('PUT', url); xhr.setRequestHeader('x-upsert', 'false');
    const body = new FormData(); body.append('cacheControl', '3600'); body.append('', file); xhr.send(body);$old$,
    $new$    xhr.open('PUT', url);
    const body = new FormData(); body.append('cacheControl', '3600'); body.append('', file); xhr.send(body);$new$
  );

  update public.lowcode_materials
     set source_text = v_source,
         source_hash = md5(v_source),
         material_version = '1.3.0',
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

  if v_source is not null and position('x-upsert' in v_source) > 0 then
    raise exception 'Signed upload CORS fix did not remove x-upsert from vxe-upload.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
