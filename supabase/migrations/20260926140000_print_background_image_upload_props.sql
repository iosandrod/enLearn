begin;

update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{fields}',
  (
    select jsonb_agg(
      case
        when field.value ->> 'field' = 'imageUrl' then
          jsonb_set(
            field.value,
            '{props}',
            coalesce(field.value -> 'props', '{}'::jsonb) || jsonb_build_object(
              'fileTypes', jsonb_build_array('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'),
              'imageTypes', jsonb_build_array('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'),
              'mode', 'image',
              'multiple', false,
              'limitCount', 1,
              'limitSize', 8,
              'showList', true,
              'showUploadButton', true,
              'showRemoveButton', true,
              'showDownloadButton', false,
              'showPreview', false,
              'previewType', 'image',
              'buttonText', '选择图片',
              'buttonIcon', 'ri-image-add-line'
            ),
            true
          )
        else field.value
      end
      order by field.ordinality
    )
    from jsonb_array_elements(schema -> 'fields') with ordinality as field(value, ordinality)
  ),
  true
),
updated_at = timezone('utc', now())
where code = 'print-designer.background'
  and enabled
  and jsonb_typeof(schema -> 'fields') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(schema -> 'fields') field(value)
    where field.value ->> 'field' = 'imageUrl'
  );

commit;
