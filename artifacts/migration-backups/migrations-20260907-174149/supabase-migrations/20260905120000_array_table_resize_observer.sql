-- Recalculate the database-backed array table when its containing element changes height.
begin;

do $migration$
declare
  v_source_text text;
begin
  select source_text
    into v_source_text
  from public.lowcode_materials
  where material_kind = 'form'
    and code = 'lc-array-table'
  for update;

  if v_source_text is null then
    raise exception 'Low-code form material lc-array-table does not exist.';
  end if;

  -- Keep the migration safe if it is reapplied by a local bootstrap script.
  if position('const measuredFillHeight = ref<number>();' in v_source_text) > 0 then
    return;
  end if;

  if position('class="lc-array-table"' in v_source_text) = 0
     or position('const tableRef = ref<' in v_source_text) = 0
     or position('onMounted(() => {' in v_source_text) = 0 then
    raise exception 'Low-code form material lc-array-table has an unsupported source format.';
  end if;

  v_source_text := replace(
    v_source_text,
    $root_anchor$  <div
    class="lc-array-table"
    :class="{ 'lc-array-table--fill': fillAvailableHeight }"
  >$root_anchor$,
    $root_replacement$  <div
    ref="arrayTableRef"
    class="lc-array-table"
    :class="{ 'lc-array-table--fill': fillAvailableHeight }"
  >$root_replacement$
  );

  -- Upgrade the first observer implementation as well as older materials that
  -- did not yet have an observer. The latter replacements are harmless when the
  -- source already contains the ref and lifecycle blocks.
  v_source_text := replace(
    v_source_text,
    'let lastArrayTableHeight: number | undefined;',
    $declaration_replacement$let arrayTableResizeFrame: number | undefined;
const measuredFillHeight = ref<number>();$declaration_replacement$
  );

  v_source_text := replace(
    v_source_text,
    'const tableHeight = computed(() => readSize(tableConfig.value.height));',
    $height_replacement$const tableHeight = computed(() => {
  const configuredHeight = readSize(tableConfig.value.height);
  return isFillHeight(configuredHeight) && measuredFillHeight.value
    ? measuredFillHeight.value
    : configuredHeight;
});$height_replacement$
  );

  v_source_text := replace(
    v_source_text,
    $table_height_line$    tableHeight.value,
$table_height_line$,
    ''
  );

  v_source_text := replace(
    v_source_text,
    $ref_anchor$}>();
const systemSettings = useSystemSettings();$ref_anchor$,
    $ref_replacement$}>();
const arrayTableRef = ref<HTMLElement>();
let arrayTableResizeObserver: ResizeObserver | undefined;
let arrayTableResizeFrame: number | undefined;
const measuredFillHeight = ref<number>();
const systemSettings = useSystemSettings();$ref_replacement$
  );

  v_source_text := replace(
    v_source_text,
    $lifecycle_anchor$function handleArrayTableResize(entries: ResizeObserverEntry[]) {
  const height = entries[0]?.contentRect.height;
  if (typeof height !== 'number' || height === lastArrayTableHeight) return;
  lastArrayTableHeight = height;
  recalculateTable();
}

onMounted(() => {
  setTimeout(() => recalculateTable(), 10);

  const element = arrayTableRef.value;
  if (element && typeof ResizeObserver !== 'undefined') {
    arrayTableResizeObserver = new ResizeObserver(handleArrayTableResize);
    arrayTableResizeObserver.observe(element);
  }
});
onBeforeUnmount(() => {
  unsubscribeOptionSources?.();
  arrayTableResizeObserver?.disconnect();
  arrayTableResizeObserver = undefined;
});$lifecycle_anchor$,
    $lifecycle_replacement$function handleArrayTableResize(entries: ResizeObserverEntry[]) {
  const height = entries[0]?.contentRect.height;
  if (typeof height !== 'number' || height === lastArrayTableHeight) return;
  lastArrayTableHeight = height;
  recalculateTable();
}

onMounted(() => {
  setTimeout(() => recalculateTable(), 10);

  const element = arrayTableRef.value;
  if (element && typeof ResizeObserver !== 'undefined') {
    arrayTableResizeObserver = new ResizeObserver(handleArrayTableResize);
    arrayTableResizeObserver.observe(element);
  }
});
onBeforeUnmount(() => {
  unsubscribeOptionSources?.();
  arrayTableResizeObserver?.disconnect();
  arrayTableResizeObserver = undefined;
});$lifecycle_replacement$
  );

  -- Older installations may still have the pre-observer lifecycle block.
  v_source_text := replace(
    v_source_text,
    $legacy_lifecycle$onMounted(() => {
  //
  setTimeout(() => recalculateTable(), 10);//
});
onBeforeUnmount(() => unsubscribeOptionSources?.());$legacy_lifecycle$,
    $legacy_replacement$function handleArrayTableResize(entries: ResizeObserverEntry[]) {
  const height = entries[0]?.contentRect.height;
  if (typeof height !== 'number' || height === lastArrayTableHeight) return;
  lastArrayTableHeight = height;
  recalculateTable();
}

onMounted(() => {
  setTimeout(() => recalculateTable(), 10);

  const element = arrayTableRef.value;
  if (element && typeof ResizeObserver !== 'undefined') {
    arrayTableResizeObserver = new ResizeObserver(handleArrayTableResize);
    arrayTableResizeObserver.observe(element);
  }
});
onBeforeUnmount(() => {
  unsubscribeOptionSources?.();
  arrayTableResizeObserver?.disconnect();
  arrayTableResizeObserver = undefined;
});$legacy_replacement$
  );

  v_source_text := replace(
    v_source_text,
    $old_resize$function handleArrayTableResize(entries: ResizeObserverEntry[]) {
  const height = entries[0]?.contentRect.height;
  if (typeof height !== 'number' || height === lastArrayTableHeight) return;
  lastArrayTableHeight = height;
  recalculateTable();
}

onMounted(() => {
  setTimeout(() => recalculateTable(), 10);

  const element = arrayTableRef.value;
  if (element && typeof ResizeObserver !== 'undefined') {
    arrayTableResizeObserver = new ResizeObserver(handleArrayTableResize);
    arrayTableResizeObserver.observe(element);
  }
});
onBeforeUnmount(() => {
  unsubscribeOptionSources?.();
  arrayTableResizeObserver?.disconnect();
  arrayTableResizeObserver = undefined;
});$old_resize$,
    $new_resize$function measureFillHeight() {
  arrayTableResizeFrame = undefined;
  if (!isFillHeight(tableConfig.value.height)) {
    measuredFillHeight.value = undefined;
    return;
  }

  const root = arrayTableRef.value;
  if (!root) return;

  const heights: number[] = [];
  let element: HTMLElement | null = root;
  while (element && element !== document.body) {
    const height = element.getBoundingClientRect().height;
    if (height > 0) heights.push(height);
    element = element.parentElement;
  }
  const constrainedHeight = Math.min(...heights);
  if (!Number.isFinite(constrainedHeight)) return;
  const toolbarHeight = root.querySelector<HTMLElement>('.lc-array-table__toolbar')?.getBoundingClientRect().height ?? 0;
  const nextHeight = Math.max(0, Math.floor(constrainedHeight - toolbarHeight - 8));
  if (nextHeight === measuredFillHeight.value) return;
  measuredFillHeight.value = nextHeight;
  recalculateTable();
}

function scheduleFillHeightMeasurement() {
  if (typeof requestAnimationFrame === 'undefined') {
    measureFillHeight();
    return;
  }
  if (typeof arrayTableResizeFrame === 'number') cancelAnimationFrame(arrayTableResizeFrame);
  arrayTableResizeFrame = requestAnimationFrame(measureFillHeight);
}

onMounted(() => {
  setTimeout(() => recalculateTable(), 10);

  const element = arrayTableRef.value;
  if (element && typeof ResizeObserver !== 'undefined') {
    arrayTableResizeObserver = new ResizeObserver(scheduleFillHeightMeasurement);
    let observed: HTMLElement | null = element;
    while (observed && observed !== document.body) {
      arrayTableResizeObserver.observe(observed);
      observed = observed.parentElement;
    }
  }
  scheduleFillHeightMeasurement();
});
onBeforeUnmount(() => {
  unsubscribeOptionSources?.();
  arrayTableResizeObserver?.disconnect();
  arrayTableResizeObserver = undefined;
  if (typeof arrayTableResizeFrame === 'number') cancelAnimationFrame(arrayTableResizeFrame);
  arrayTableResizeFrame = undefined;
});$new_resize$
  );

  update public.lowcode_materials
  set
    source_text = v_source_text,
    source_hash = '87348ed642227f7ea42fd07f2b9ad77298de75a008a6cc412a2f07d072bc6c45',
    material_version = '1.2.0',
    updated_at = timezone('utc'::text, now())
  where material_kind = 'form'
    and code = 'lc-array-table';
end
$migration$;

select pg_notify('pgrst', 'reload schema');
commit;
