<template>
  <header class="site-header" :class="{ 'is-open': menuOpen }">
    <div class="site-header__inner">
      <RouterLink class="site-brand" to="/" :aria-label="`${SITE_NAME} 首页`" @click="closeMenu">
        <span class="site-brand-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
        <span class="site-brand-copy">
          <strong>{{ SITE_NAME }}</strong>
          <small>个人学习交流站</small>
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

      <nav id="site-navigation" class="site-nav" aria-label="首页导航">
        <a v-for="item in navItems" :key="item.href" :href="item.href" @click="closeMenu">
          {{ item.label }}
        </a>
      </nav>

      <div class="site-actions">
        <RouterLink v-if="signedIn" class="site-console-link" to="/dashboard">
          <i class="ri-layout-grid-line" aria-hidden="true" />
          进入工作台
        </RouterLink>
        <template v-else>
          <RouterLink class="site-login-link" to="/signin">登录</RouterLink>
          <a class="site-console-link" href="/#experience" @click="closeMenu">
            立即体验
            <i class="ri-arrow-right-up-line" aria-hidden="true" />
          </a>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { SITE_NAME } from '../config/site';

const auth = useAuth();
const signedIn = computed(() => Boolean(auth.user.value));
const menuOpen = ref(false);
const navItems = [
  { label: '学习主题', href: '/#capabilities' },
  { label: '组件体验', href: '/#experience' },
  { label: '实践场景', href: '/#scenarios' },
  { label: '技术结构', href: '/#architecture' },
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
  background: rgb(250 252 253 / 88%);
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
  grid-template-columns: repeat(3, 4px);
  align-items: end;
  justify-content: center;
  gap: 3px;
  border-radius: 6px;
  background: #112c2a;
  padding-bottom: 8px;
}

.site-brand-mark span {
  display: block;
  width: 4px;
  border-radius: 1px;
  background: #b8ef50;
}

.site-brand-mark span:nth-child(1) { height: 9px; }
.site-brand-mark span:nth-child(2) { height: 17px; }
.site-brand-mark span:nth-child(3) { height: 13px; }

.site-brand-copy {
  display: grid;
  gap: 1px;
}

.site-brand-copy strong {
  color: #112c2a;
  font-size: 17px;
  line-height: 1;
}

.site-brand-copy small {
  color: #6e7c7a;
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
  color: #40504e;
  font-size: 13px;
  font-weight: 600;
}

.site-nav a::after {
  position: absolute;
  right: 0;
  bottom: -9px;
  left: 0;
  height: 2px;
  background: #4f8e72;
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
  background: #112c2a;
  color: #ffffff;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 700;
  transition: background 160ms ease, transform 160ms ease;
}

.site-console-link:hover {
  background: #26564a;
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
    color: #112c2a;
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
    top: 260px;
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
