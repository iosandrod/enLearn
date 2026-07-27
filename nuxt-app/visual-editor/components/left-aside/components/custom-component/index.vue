<!--自定义组件-->
<template>自定义组件</template>

<script lang="ts">
  import { Upload } from '@/visual-editor/components/common/remix-icons';

  export default {
    name: 'CustomComponent',
    label: '自定义组件',
    order: 6,
    icon: Upload,
  };
</script>

<style scoped></style>
