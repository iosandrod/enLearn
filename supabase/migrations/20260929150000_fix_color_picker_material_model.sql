begin;

do $update_material$
declare
  next_source text := $material$
<template>
  <vxe-color-picker
    ref="pickerRef"
    :id="field.field"
    :model-value="model"
    v-bind="field.props"
    @update:model-value="handleColorUpdate"
    @change="handleColorChange"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LowCodeFormMaterialProps } from '../types';
import { useLowCodeFormMaterialModel } from '../useLowCodeFormMaterialModel';

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const model = useLowCodeFormMaterialModel(props, emit);
const pickerRef = ref<{
  reactData?: {
    selectTyle?: string;
    selectColor?: string;
    hexValue?: string;
  };
} | null>(null);

function readColor(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const eventValue = (value as { value?: unknown }).value;
    return typeof eventValue === 'string' ? eventValue : '';
  }
  return '';
}

function emitColor(value: unknown) {
  const color = readColor(value);
  if (color && color !== props.modelValue) {
    emit('update:modelValue', color);
  }
}

function handleColorUpdate(value: unknown) {
  emitColor(value);
}

function handleColorChange(event: unknown) {
  emitColor(event);
}

watch(
  () => {
    const pickerData = pickerRef.value?.reactData;
    if (!pickerData) return '';
    return pickerData.selectTyle === 'hex' ? pickerData.hexValue : pickerData.selectColor;
  },
  (value) => emitColor(value),
);

function commitPendingValue() {
  const pickerData = pickerRef.value?.reactData;
  if (!pickerData) return;

  const value = pickerData.selectTyle === 'hex'
    ? pickerData.hexValue
    : pickerData.selectColor;
  emitColor(value);
}

defineExpose({ commitPendingValue });
</script>
$material$;
begin
  if not exists (
    select 1
      from public.lowcode_materials
     where material_kind = 'form'
       and code = 'lc-color-picker'
  ) then
    raise exception 'lc-color-picker material was not found.';
  end if;

  update public.lowcode_materials
     set source_text = next_source,
         source_hash = md5(next_source),
         material_version = '1.0.1',
         updated_at = timezone('utc'::text, now())
   where material_kind = 'form'
     and code = 'lc-color-picker';
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
     and code = 'lc-color-picker';

  if position($marker$@update:model-value="handleColorUpdate"$marker$ in v_source) = 0
     or position($marker$function handleColorChange$marker$ in v_source) = 0
     or position($marker$function commitPendingValue$marker$ in v_source) = 0 then
    raise exception 'lc-color-picker model update migration did not install correctly.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
