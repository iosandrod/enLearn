<template>
  <div class="site-shell">
    <SiteHeader />
    <main class="site-main">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style>
html:has(.site-shell),
html:has(.site-shell) body {
  height: auto;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}

html:has(.site-shell) #app {
  height: auto;
  min-height: 100vh;
  overflow: visible;
}
</style>
