-- Allow declarative button actions (for example refreshDataSource) to reach
-- the runtime event bus even when they do not have a JavaScript script.
do $migration$
declare
  old_block text := $button_old$  const script = typeof action.script === 'string' ? action.script.trim() : '';
  if (!script) {
    reportButtonError(new Error(`按钮“${readButtonContent(action)}”未配置脚本。`));
    return;
  }

$button_old$;
  new_block text := $button_new$  const script = typeof action.script === 'string' ? action.script.trim() : '';
  const hasDirectives = Array.isArray(action.directives) && action.directives.length > 0;
  if (!script && !hasDirectives) {
    reportButtonError(new Error(`按钮“${readButtonContent(action)}”未配置脚本。`));
    return;
  }

$button_new$;
  old_executor_guard text := $executor_old$if (runtimeBlockEditor?.executeButtonScript) {$executor_old$;
  new_executor_guard text := $executor_new$if (script && runtimeBlockEditor?.executeButtonScript) {$executor_new$;
  updated_source text;
begin
  update public.lowcode_materials
  set source_text = replace(source_text, old_block, new_block),
      source_hash = encode(
        digest(convert_to(replace(source_text, old_block, new_block), 'UTF8'), 'sha256'),
        'hex'
      )
  where material_kind = 'page'
    and code = 'buttonGroup'
    and source_text like '%const script = typeof action.script%'
    and source_text like '%reportButtonError%';

  update public.lowcode_materials
  set source_text = replace(source_text, old_executor_guard, new_executor_guard),
      source_hash = encode(
        digest(convert_to(replace(source_text, old_executor_guard, new_executor_guard), 'UTF8'), 'sha256'),
        'hex'
      )
  where material_kind = 'page'
    and code = 'buttonGroup'
    and source_text like '%if (runtimeBlockEditor?.executeButtonScript)%';

  select source_text into updated_source
  from public.lowcode_materials
  where material_kind = 'page' and code = 'buttonGroup';

  if updated_source is null
    or position('const hasDirectives = Array.isArray(action.directives)' in updated_source) = 0
    or position('if (script && runtimeBlockEditor?.executeButtonScript)' in updated_source) = 0 then
    raise exception 'buttonGroup material source was not updated';
  end if;
end
$migration$;
