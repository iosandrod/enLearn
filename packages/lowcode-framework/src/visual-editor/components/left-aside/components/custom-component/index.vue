<template>
  <MaterialPalette :items="[]" empty-text="暂无自定义组件" />
</template>

<script lang="ts">
  import { Upload } from '../../../common/remix-icons';
  import MaterialPalette from '../../material-palette';

  export default {
    name: 'CustomComponent',
    label: '自定义组件',
    order: 6,
    icon: Upload,
    components: { MaterialPalette },
  };
</script>
