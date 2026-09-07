-- Show only normal route-order edges in the planning flow graph.
begin;

do $migration$
declare
  v_source_text text;
begin
  select source_text
    into v_source_text
  from public.lowcode_materials
  where material_kind = 'page'
    and code = 'planningFlow'
  for update;

  if v_source_text is null then
    raise exception 'Low-code page material planningFlow does not exist.';
  end if;

  -- Keep the migration idempotent for local bootstrap/replay scripts.
  v_source_text := replace(
    v_source_text,
    $$const relation = readString(row.relation, 'dependency');$$,
    $$const relation = readString(row.relation, 'routing');$$
  );
  v_source_text := replace(
    v_source_text,
    $$if (!sourceId || !targetId || relation === 'owner') return;$$,
    $$if (!sourceId || !targetId || relation !== 'routing') return;$$
  );
  v_source_text := replace(
    v_source_text,
    $$          strokeDasharray: tone === 'dependency' ? '8 6' : undefined,
$$,
    ''
  );
  v_source_text := replace(v_source_text, 'title="流程与约束视图"', 'title="流程图"');
  v_source_text := replace(v_source_text, 'aria-label="流程与约束视图"', 'aria-label="流程图"');
  v_source_text := replace(v_source_text, 'border-style: dashed;', 'border-style: solid;');
  v_source_text := replace(
    v_source_text,
    $header$          <template v-if="dependencyCount"> · {{ dependencyCount }} 条前置约束</template>
$header$,
    ''
  );
  v_source_text := replace(
    v_source_text,
    $node$                  <template v-if="incomingDependencyCount(node.id)">
                    <dt>前置</dt>
                    <dd :title="incomingDependencyTitle(node.id)">{{ incomingDependencyCount(node.id) }} 个约束</dd>
                  </template>
$node$,
    ''
  );
  v_source_text := replace(
    v_source_text,
    $functions$function incomingDependencies(nodeId: string) {
  return rawEdges.value.filter((edge) => {
    return readString(edge.relation) === 'dependency' && readString(edge.target) === nodeId;
  });
}

function incomingDependencyCount(nodeId: string) {
  return incomingDependencies(nodeId).length;
}

function incomingDependencyTitle(nodeId: string) {
  return incomingDependencies(nodeId)
    .map((edge) => readString(allNodeById.value.get(readString(edge.source))?.data.label, readString(edge.source)))
    .join('、');
}

$functions$,
    ''
  );

  update public.lowcode_materials
  set source_text = v_source_text,
      source_hash = encode(digest(convert_to(v_source_text, 'UTF8'), 'sha256'), 'hex'),
      material_version = '1.1.0',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'page'
    and code = 'planningFlow';
end
$migration$;

select pg_notify('pgrst', 'reload schema');
commit;
