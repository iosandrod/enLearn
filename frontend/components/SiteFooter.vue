<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <section class="site-footer__brand">
        <RouterLink class="site-footer__logo" to="/">
          <span aria-hidden="true">峰</span>
          <strong>{{ SITE_NAME }}</strong>
        </RouterLink>
        <p>{{ SITE_DESCRIPTION }}，记录个人对低代码、APS 与制造软件的学习实践。</p>
        <div class="site-footer__status">
          <i aria-hidden="true"></i>
          学习站点正常运行
        </div>
      </section>

      <nav class="site-footer__links" aria-label="页脚导航">
        <div v-for="group in footerGroups" :key="group.title">
          <h2>{{ group.title }}</h2>
          <a v-for="link in group.links" :key="link.href" :href="link.href">
            {{ link.label }}
          </a>
        </div>
      </nav>
    </div>

    <div class="site-footer__legal">
      <span>© {{ currentYear }} {{ SITE_NAME }}. All rights reserved.</span>
      <div>
        <a href="/docs">隐私政策</a>
        <a href="/docs">服务条款</a>
        <span class="site-footer__filing">备案信息预留：ICP备案号 / 公安备案号</span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { SITE_DESCRIPTION, SITE_NAME } from '../config/site';

const currentYear = new Date().getFullYear();
const footerGroups = [
  {
    title: '内容',
    links: [
      { label: '学习主题', href: '/#capabilities' },
      { label: '组件体验', href: '/#experience' },
      { label: '技术结构', href: '/#architecture' },
    ],
  },
  {
    title: '专题',
    links: [
      { label: '智能排程', href: '/#experience' },
      { label: '制造执行', href: '/#scenarios' },
      { label: '业务自动化', href: '/#scenarios' },
    ],
  },
  {
    title: '更多',
    links: [
      { label: '学习文档', href: '/docs' },
      { label: '学习记录', href: '/blog' },
      { label: '登录学习空间', href: '/signin' },
    ],
  },
];
</script>

<style scoped>
.site-footer {
  display: block;
  width: 100%;
  margin: 0;
  border-top: 1px solid #dfe7e5;
  background: #0e2523;
  color: #dce8e5;
  padding: 0;
}

.site-footer__inner,
.site-footer__legal {
  width: min(1240px, calc(100% - 40px));
  margin: 0 auto;
}

.site-footer__inner {
  display: grid;
  grid-template-columns: minmax(260px, 1.35fr) 2fr;
  gap: 80px;
  padding: 64px 0 46px;
}

.site-footer__brand p {
  max-width: 320px;
  margin: 18px 0;
  color: #91a7a3;
  font-size: 14px;
  line-height: 1.8;
}

.site-footer__logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
}

.site-footer__logo span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid #7f9f78;
  border-radius: 5px;
  color: #b8ef50;
  font-weight: 800;
}

.site-footer__status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #91a7a3;
  font-size: 12px;
}

.site-footer__status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #91dc62;
  box-shadow: 0 0 0 4px rgb(145 220 98 / 10%);
}

.site-footer__links {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 32px;
}

.site-footer__links h2 {
  margin: 0 0 18px;
  color: #f4f8f7;
  font-size: 13px;
}

.site-footer__links a {
  display: block;
  margin: 0 0 12px;
  color: #91a7a3;
  font-size: 13px;
  transition: color 150ms ease;
}

.site-footer__links a:hover { color: #dce8e5; }

.site-footer__legal {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border-top: 1px solid rgb(255 255 255 / 9%);
  color: #748a86;
  font-size: 11px;
}

.site-footer__legal div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 20px;
}

.site-footer__filing {
  color: #819894;
}

@media (max-width: 760px) {
  .site-footer__inner,
  .site-footer__legal { width: calc(100% - 32px); }
  .site-footer__inner { grid-template-columns: 1fr; gap: 38px; padding: 46px 0 34px; }
  .site-footer__links { gap: 18px; }
  .site-footer__legal { align-items: flex-start; flex-direction: column; padding: 22px 0; }
  .site-footer__legal div { justify-content: flex-start; gap: 12px 18px; }
  .site-footer__filing { flex-basis: 100%; }
}
</style>
