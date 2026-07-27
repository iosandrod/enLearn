<template>
  <vxe-modal v-model="dialogVisible" class-name="h5-preview" :show-header="false" width="360px">
    <iframe
      v-if="dialogVisible"
      :style="{ width: '100%', height: '100%' }"
      :src="previewUrl"
      frameborder="0"
      scrolling="auto"
    ></iframe>
  </vxe-modal>
</template>

<script lang="ts" setup>
  import { useVModel } from '@vueuse/core';
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
