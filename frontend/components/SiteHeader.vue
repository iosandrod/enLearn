<template>
  <header class="site-header" :class="{ 'is-open': menuOpen }">
    <div class="site-header__inner">
      <RouterLink class="site-brand" to="/" aria-label="研峰打印设计器首页" @click="closeMenu">
        <span class="site-brand-mark" aria-hidden="true">
          <i class="ri-printer-line" />
        </span>
        <span class="site-brand-copy">
          <strong>研峰打印设计器</strong>
          <small>可视化打印与批量出图</small>
        </span>
      </RouterLink>

      <button
        class="site-menu-button"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="site-navigation"
        aria-label="切换导航菜单"
        @click="menuOpen = !menuOpen"
      >
        <i :class="menuOpen ? 'ri-close-line' : 'ri-menu-3-line'" aria-hidden="true" />
      </button>

      <nav id="site-navigation" class="site-nav" aria-label="打印设计器导航">
        <a v-for="item in navItems" :key="item.href" :href="item.href" @click="closeMenu">
          {{ item.label }}
        </a>
      </nav>

      <div class="site-actions">
        <RouterLink v-if="signedIn" class="site-login-link" to="/dashboard" @click="closeMenu">
          <i class="ri-layout-grid-line" aria-hidden="true" />
          工作台
        </RouterLink>
        <RouterLink v-else class="site-login-link" to="/signin" @click="closeMenu">登录</RouterLink>
        <RouterLink class="site-console-link" to="/print-designer" @click="closeMenu">
          <i class="ri-pencil-ruler-2-line" aria-hidden="true" />
          进入设计器
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
const auth = useAuth();
const signedIn = computed(() => Boolean(auth.user.value));
const menuOpen = ref(false);
const navItems = [
  { label: '在线体验', href: '/#designer-preview' },
  { label: '核心能力', href: '/#capabilities' },
  { label: '开始设计', href: '/#start-design' },
];

function closeMenu() {
  menuOpen.value = false;
}

onMounted(() => {
  void auth.init();
});
</script>

<style scoped>
.site-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 100;
  display: block;
  height: 68px;
  padding: 0;
  border-bottom: 1px solid rgb(15 23 42 / 8%);
  background: rgb(248 250 251 / 92%);
  backdrop-filter: blur(18px) saturate(150%);
}

.site-header__inner {
  display: grid;
  width: min(1240px, calc(100% - 40px));
  height: 100%;
  margin: 0 auto;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 34px;
}

.site-brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}

.site-brand-mark {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 6px;
  background: #152238;
}

.site-brand-mark i { color: #ffffff; font-size: 19px; }

.site-brand-copy {
  display: grid;
  gap: 1px;
}

.site-brand-copy strong {
  color: #152238;
  font-size: 17px;
  line-height: 1;
}

.site-brand-copy small {
  color: #7a8798;
  font-size: 9px;
  letter-spacing: 1.6px;
}

.site-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 30px;
}

.site-nav a,
.site-login-link {
  position: relative;
  color: #455266;
  font-size: 13px;
  font-weight: 600;
}

.site-nav a::after {
  position: absolute;
  right: 0;
  bottom: -9px;
  left: 0;
  height: 2px;
  background: #e35f37;
  content: '';
  transform: scaleX(0);
  transform-origin: right;
  transition: transform 180ms ease;
}

.site-nav a:hover::after,
.site-nav a:focus-visible::after {
  transform: scaleX(1);
  transform-origin: left;
}

.site-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 16px;
}

.site-console-link {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 4px;
  background: #e35f37;
  color: #ffffff;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 700;
  transition: background 160ms ease, transform 160ms ease;
}

.site-console-link:hover {
  background: #c94f2d;
  transform: translateY(-1px);
}

.site-menu-button { display: none; }

@media (max-width: 860px) {
  .site-header__inner {
    width: calc(100% - 28px);
    grid-template-columns: 1fr auto;
  }

  .site-menu-button {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border: 1px solid #d9e1df;
    border-radius: 4px;
    background: #ffffff;
    color: #152238;
    cursor: pointer;
    font-size: 20px;
  }

  .site-nav,
  .site-actions {
    position: fixed;
    right: 0;
    left: 0;
    display: none;
    background: #fafdfe;
  }

  .site-nav {
    top: 68px;
    align-items: stretch;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid #e4e9e8;
    padding: 12px 22px 4px;
  }

  .site-nav a { padding: 12px 0; }
  .site-nav a::after { display: none; }

  .site-actions {
    top: 216px;
    align-items: stretch;
    gap: 10px;
    border-bottom: 1px solid #dfe6e4;
    padding: 8px 22px 20px;
    box-shadow: 0 18px 30px rgb(15 23 42 / 8%);
  }

  .site-header.is-open .site-nav,
  .site-header.is-open .site-actions { display: flex; }
  .site-login-link { padding: 10px 0; text-align: center; }
}
</style>
