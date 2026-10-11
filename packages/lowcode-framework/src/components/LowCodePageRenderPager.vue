<template>
  <VxePager
    class="lc-page-pager"
    v-bind="pagerConfig"
    :transfer="true"
    :current-page="currentPage"
    :page-size="pageSize"
    :total="total"
    :loading="loading"
    align="right"
    @page-change="handlePageChange"
  />
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { VxePager, type VxePagerDefines, type VxePagerProps } from 'vxe-pc-ui';
import {
  resolveSystemPagerConfig,
  resolveSystemTableConfig,
  useSystemSettings,
} from '../core/system-settings';

const props = withDefaults(defineProps<{
  currentPage: number;
  pageSize: number;
  total: number;
  loading?: boolean;
}>(), { loading: false });

const emit = defineEmits<{
  'update:currentPage': [value: number];
  'update:pageSize': [value: number];
  'page-change': [params: VxePagerDefines.PageChangeParams];
}>();
const systemSettings = useSystemSettings();
const pagerConfig = computed(() =>
  resolveSystemPagerConfig(resolveSystemTableConfig(systemSettings)) as VxePagerProps,
);

function handlePageChange(params: VxePagerDefines.PageChangeParams) {
  if (props.loading) return;
  const currentPage = params.type === 'size' ? 1 : params.currentPage;
  emit('update:currentPage', currentPage);
  emit('update:pageSize', params.pageSize);
  emit('page-change', { type: params.type, currentPage, pageSize: params.pageSize });
}
</script>

<style scoped>
.lc-page-pager {
  flex: 0 0 auto;
  min-width: 0;
  overflow-x: auto;
  border-top: 1px solid var(--lc-color-border, #d8dee8);
}

.lc-page-pager.is--loading {
  pointer-events: none;
}
</style>
