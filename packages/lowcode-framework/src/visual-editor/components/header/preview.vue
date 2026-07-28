<template>
  <LcVxeModalRenderer :modals="modalConfigs" />
</template>

<script lang="ts" setup>
  import { computed, h } from 'vue';
  import { useVModel } from '@vueuse/core';
  import LcVxeModalRenderer, { type LcVxeModalConfig } from '../../../components/LcVxeModalRenderer';
  import { BASE_URL } from '../../utils';

  defineOptions({
    name: 'Preview',
  });

  const props = defineProps({
    visible: {
      type: Boolean,
      default: false,
    },
  });
  const emits = defineEmits(['update:visible']);

  const dialogVisible = useVModel(props, 'visible', emits);
  const previewUrl = `${BASE_URL}preview/${location.hash}`;
  const modalConfigs = computed<LcVxeModalConfig[]>(() => [
    {
      id: 'h5-preview',
      visible: dialogVisible.value,
      width: '360px',
      props: {
        className: 'h5-preview',
        showHeader: false,
      },
      onVisibleChange: (visible) => {
        dialogVisible.value = visible;
      },
      body: () =>
        dialogVisible.value
          ? h('iframe', {
              style: { width: '100%', height: '100%' },
              src: previewUrl,
              frameborder: '0',
              scrolling: 'auto',
            })
          : null,
    },
  ]);
</script>

<style lang="scss">
  .h5-preview {
    overflow: hidden;

    .vxe-modal--body,
    .vxe-modal--content {
      width: 360px;
      height: 640px;
      padding: 0;
    }

    .vxe-modal--header {
      display: none;
    }

    .simulator {
      padding-right: 0;

      &::-webkit-scrollbar {
        width: 0;
      }
    }
  }
</style>
