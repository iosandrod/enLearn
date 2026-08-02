# tldraw-vue-phase-one-pro

Pro feature plugin bundle for `tldraw-vue-phase-one`.

## Install

```sh
npm install tldraw-vue-phase-one tldraw-vue-phase-one-pro
```

## Usage

```vue
<script setup lang="ts">
import TldrawVue from 'tldraw-vue-phase-one'
import { createTldrawVueProPlugin } from 'tldraw-vue-phase-one-pro'
import 'tldraw-vue-phase-one/style.css'

const plugins = [createTldrawVueProPlugin()]
</script>

<template>
  <div style="width: 100vw; height: 100vh">
    <TldrawVue :plugins="plugins" />
  </div>
</template>
```

The first Pro package version includes QR, material layout, history shortcuts, and optional print command helpers.
