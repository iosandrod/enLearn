<template>
  <div class="home-page">
    <section class="home-hero">
      <div class="home-hero__backdrop" aria-hidden="true"></div>
      <div class="home-hero__grid" aria-hidden="true"></div>
      <div class="home-hero__inner">
        <div class="home-hero__copy">
          <p class="home-eyebrow"><span></span>个人开发者 · 低代码与 APS 学习交流</p>
          <h1>{{ SITE_NAME }}</h1>
          <p class="home-hero__statement">探索低代码，<strong>理解智能排程。</strong></p>
          <p class="home-hero__lead">
            围绕有限产能排程、低代码组件、流程编排与制造建模，
            记录个人学习过程，并开放可交互的组件实验。
          </p>
          <div class="home-hero__actions">
            <a class="home-button home-button--primary" href="#experience">
              <i class="ri-play-circle-line" aria-hidden="true" />
              免登录体验
            </a>
            <RouterLink class="home-button home-button--plain" to="/signin">
              登录学习空间
              <i class="ri-arrow-right-line" aria-hidden="true" />
            </RouterLink>
          </div>
          <div class="home-hero__trust">
            <span><i class="ri-shield-check-line"></i>个人学习记录</span>
            <span><i class="ri-git-merge-line"></i>组件交互实验</span>
            <span><i class="ri-smartphone-line"></i>技术交流整理</span>
          </div>
        </div>

        <div class="home-hero__signal" aria-label="排程实验摘要">
          <div class="signal-head">
            <span><i></i> DEMO DATA</span>
            <b>SAMPLE 01</b>
          </div>
          <div class="signal-chart">
            <span v-for="height in signalBars" :key="height" :style="{ height: `${height}%` }"></span>
          </div>
          <div class="signal-metrics">
            <div><small>今日计划达成</small><strong>96.8%</strong><em>+4.2%</em></div>
            <div><small>设备综合效率</small><strong>87.4%</strong><em>稳定</em></div>
            <div><small>在制订单</small><strong>128</strong><em>12 条产线</em></div>
          </div>
        </div>
      </div>
      <a class="home-hero__scroll" href="#capabilities" aria-label="向下浏览">
        <span>探索内容</span><i class="ri-arrow-down-line"></i>
      </a>
    </section>

    <section id="capabilities" class="home-section capabilities-section">
      <div class="section-intro reveal-block">
        <div>
          <p class="section-index">01 / STUDY TOPICS</p>
          <h2>不止于低代码，<br />更懂制造的复杂性</h2>
        </div>
        <p>
          {{ SITE_NAME }} 是个人学习与技术交流站点，用可运行组件记录页面构建、
          计划排程、流程自动化和制造建模方面的实践。
        </p>
      </div>

      <div class="capability-lines">
        <article v-for="(capability, index) in capabilities" :key="capability.title" class="capability-line reveal-block">
          <span class="capability-line__number">0{{ index + 1 }}</span>
          <div class="capability-line__icon"><i :class="capability.icon" aria-hidden="true" /></div>
          <div class="capability-line__copy">
            <p>{{ capability.kicker }}</p>
            <h3>{{ capability.title }}</h3>
            <span>{{ capability.description }}</span>
          </div>
          <ul>
            <li v-for="point in capability.points" :key="point"><i class="ri-check-line"></i>{{ point }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section id="experience" class="experience-section">
      <div class="home-section experience-section__inner">
        <div class="section-intro section-intro--light reveal-block">
          <div>
            <p class="section-index">02 / EXPERIENCE</p>
            <h2>现在就试，<br />无需登录</h2>
          </div>
          <p>
            选择一个工作区，直接操作真实组件。公开体验区以只读配置和独立演示数据运行，
            不会写入实际业务数据。
          </p>
        </div>
        <div class="experience-frame reveal-block">
          <HomePlatformDemo />
        </div>
      </div>
    </section>

    <section class="home-section product-proof">
      <div class="product-proof__heading reveal-block">
        <div>
          <p class="section-index">03 / REAL PRODUCT</p>
          <h2>真实组件，真实交互</h2>
        </div>
        <p>以下界面来自本站的个人学习与组件测试环境，而非概念效果图。</p>
      </div>

      <div class="proof-gallery">
        <article
          v-for="(proof, index) in productProofs"
          :key="proof.title"
          class="proof-item reveal-block"
          :class="{ 'proof-item--wide': index === 0 }"
        >
          <div class="proof-item__image">
            <img :src="proof.image" :alt="proof.alt" loading="lazy" />
            <span>{{ proof.badge }}</span>
          </div>
          <div class="proof-item__copy">
            <span>0{{ index + 1 }}</span>
            <div><h3>{{ proof.title }}</h3><p>{{ proof.description }}</p></div>
          </div>
        </article>
      </div>
    </section>

    <section id="scenarios" class="scenarios-section">
      <div class="home-section scenarios-section__inner">
        <div class="scenario-copy reveal-block">
          <p class="section-index">04 / USE CASES</p>
          <h2>技术练习，从办公室延伸到生产现场</h2>
          <p>同一份业务 Schema 在 Web 管理端与移动现场运行时复用，让变更一次完成、多端同步生效。</p>
          <div class="scenario-selector" role="tablist" aria-label="应用场景">
            <button
              v-for="(scenario, index) in scenarios"
              :key="scenario.name"
              type="button"
              role="tab"
              :aria-selected="activeScenario === index"
              :class="{ 'is-active': activeScenario === index }"
              @click="activeScenario = index"
            >
              <span>0{{ index + 1 }}</span>{{ scenario.name }}<i class="ri-arrow-right-line"></i>
            </button>
          </div>
        </div>

        <div class="scenario-visual reveal-block">
          <Transition name="scenario-change" mode="out-in">
            <article :key="activeScenario" :class="`scenario-panel scenario-panel--${activeScenario + 1}`">
              <header><span>{{ scenarios[activeScenario].tag }}</span><i :class="scenarios[activeScenario].icon"></i></header>
              <div>
                <p>{{ scenarios[activeScenario].label }}</p>
                <h3>{{ scenarios[activeScenario].headline }}</h3>
                <ul><li v-for="item in scenarios[activeScenario].features" :key="item">{{ item }}</li></ul>
              </div>
              <footer><span>ERP</span><i></i><span>{{ SITE_SHORT_NAME }}</span><i></i><span>现场终端</span></footer>
            </article>
          </Transition>
        </div>
      </div>
    </section>

    <section id="architecture" class="home-section architecture-section">
      <div class="architecture-heading reveal-block">
        <p class="section-index">05 / ARCHITECTURE</p>
        <h2>开放架构，为持续演进而生</h2>
        <p>通过清晰的服务边界与可扩展物料体系，理解复杂业务系统的组成与演进方式。</p>
      </div>
      <div class="architecture-flow reveal-block">
        <div v-for="(layer, index) in architectureLayers" :key="layer.title" class="architecture-node">
          <span>{{ layer.label }}</span>
          <i :class="layer.icon"></i>
          <strong>{{ layer.title }}</strong>
          <small>{{ layer.description }}</small>
          <b v-if="index < architectureLayers.length - 1"><i class="ri-arrow-right-line"></i></b>
        </div>
      </div>
      <div class="architecture-tags reveal-block">
        <span>Vue 3</span><span>Vite</span><span>Nest API</span><span>PostgreSQL</span><span>Redis</span><span>Trigger.dev</span><span>Hippy Mobile</span>
      </div>
    </section>

    <section class="home-cta">
      <div class="home-cta__grid" aria-hidden="true"></div>
      <div class="home-cta__inner reveal-block">
        <p>PERSONAL STUDY · OPEN EXPLORATION</p>
        <h2>把复杂问题，拆成可以动手验证的实验。</h2>
        <div>
          <a class="home-button home-button--accent" href="#experience">继续体验组件<i class="ri-arrow-up-line"></i></a>
          <RouterLink class="home-button home-button--dark-plain" to="/signin">登录学习空间</RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import HomePlatformDemo from '../components/HomePlatformDemo.vue';
import { SITE_DESCRIPTION, SITE_NAME, SITE_SHORT_NAME } from '../config/site';

const signalBars = [24, 38, 32, 52, 47, 68, 56, 78, 65, 88, 76, 92, 84, 98, 91, 96];
const activeScenario = ref(0);
let observer: IntersectionObserver | undefined;

const capabilities = [
  {
    kicker: 'APS · ADVANCED PLANNING', title: '有限产能智能排程', icon: 'ri-calendar-schedule-line',
    description: '综合订单交期、工艺约束、资源日历与物料可用性，生成可执行的生产计划。',
    points: ['多约束联合求解', '甘特图可视调整', '计划版本与诊断'],
  },
  {
    kicker: 'LOW-CODE · VISUAL BUILDER', title: '低代码可视化配置', icon: 'ri-layout-masonry-line',
    description: '把页面开发变成可视化配置，用统一 Schema 搭建表单、表格、统计与业务看板。',
    points: ['可复用组件物料', '数据源与事件编排', 'Web / 移动多端复用'],
  },
  {
    kicker: 'WORKFLOW · AUTOMATION', title: '业务流程编排', icon: 'ri-node-tree',
    description: '用节点和连线表达审批、数据同步与异步任务，沉淀可靠、可审计的业务流程。',
    points: ['条件与并行分支', '等待 / 重试 / 幂等', '人工任务与通知'],
  },
  {
    kicker: 'PRINT · DOCUMENT DESIGN', title: '打印与标签设计', icon: 'ri-printer-line',
    description: '自由布局业务字段、表格、条码与二维码，适配单据、标签和生产流转卡。',
    points: ['像素级画布设计', '动态数据绑定', '多规格打印输出'],
  },
  {
    kicker: 'ROUTING · PROCESS MODEL', title: '工艺路线设计', icon: 'ri-route-line',
    description: '建立产品、工序、资源与物料之间的关系，为排程和制造执行提供一致模型。',
    points: ['工序关系可视化', '资源与物料约束', '多版本替代路线'],
  },
];

const productProofs = [
  { title: '排程甘特图', badge: 'APS', image: '/site/planning-gantt.png', alt: `${SITE_NAME} 排程甘特图真实界面`, description: '订单、工序与资源计划集中呈现，支持从结果追溯约束。' },
  { title: '工艺路线设计', badge: 'ROUTING', image: '/site/routing-designer.png', alt: `${SITE_NAME} 工艺路线设计器真实界面`, description: '以图形方式管理工序、物料、工作中心和前后置关系。' },
  { title: '流程编排引擎', badge: 'WORKFLOW', image: '/site/workflow-designer.png', alt: `${SITE_NAME} 流程编排设计器真实界面`, description: '从触发到执行与监控，复杂自动化在同一画布完成。' },
  { title: '低代码设计器', badge: 'LOW CODE', image: '/site/lowcode-designer.png', alt: `${SITE_NAME} 低代码设计器真实界面`, description: '物料、画布与属性面板协同构建业务页面。' },
  { title: '单据打印设计', badge: 'PRINT', image: '/site/print-designer.png', alt: `${SITE_NAME} 打印设计器真实界面`, description: '销售、仓储和制造单据可绑定示例业务字段。' },
];

const scenarios = [
  { name: '智能制造', tag: 'MANUFACTURING', icon: 'ri-factory-line', label: '计划与执行闭环', headline: '从销售订单到车间执行，一张计划贯穿到底。', features: ['APS 有限产能排程', '工艺路线与 BOM', '工单与现场报工'] },
  { name: '移动现场', tag: 'MOBILE MES', icon: 'ri-smartphone-line', label: '现场即时响应', headline: '扫码、拍照、签名与离线提交，现场数据不再滞后。', features: ['扫码与原生能力', '大数据虚拟表格', '离线写入队列'] },
  { name: '协同流程', tag: 'COLLABORATION', icon: 'ri-team-line', label: '规则驱动协同', headline: '审批、通知和跨系统任务，按规则自动抵达正确的人。', features: ['可视审批流程', '超时与自动提醒', '完整流转审计'] },
  { name: '系统组合', tag: 'SYSTEM COMPOSITION', icon: 'ri-stack-line', label: '持续沉淀能力', headline: '把一次性练习代码，整理成可复用的业务物料。', features: ['低代码页面实验', '统一服务网关', '权限感知导航'] },
];

const architectureLayers = [
  { label: 'EXPERIENCE', title: '多端体验', description: 'Web · Mobile · Kiosk', icon: 'ri-device-line' },
  { label: 'COMPOSITION', title: '低代码运行时', description: 'Schema · Material · Event', icon: 'ri-layout-masonry-line' },
  { label: 'ORCHESTRATION', title: '流程与排程', description: 'Workflow · APS · Jobs', icon: 'ri-node-tree' },
  { label: 'SERVICE', title: '统一服务网关', description: 'Auth · Audit · API', icon: 'ri-cloud-line' },
  { label: 'DATA', title: '数据与存储', description: 'Database · Cache · Files', icon: 'ri-database-2-line' },
];

onMounted(() => {
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer?.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal-block').forEach((element) => observer?.observe(element));
});

onBeforeUnmount(() => observer?.disconnect());

useSeoMeta({
  title: `${SITE_NAME} | ${SITE_DESCRIPTION}`,
  description: `${SITE_NAME}是个人学习交流站点，展示智能排程、低代码组件、流程编排、打印设计和工艺路线等技术实践。`,
});
</script>

<style scoped>
.home-page { overflow:hidden; background:#f9fbfb; color:#142b28; }
.home-page :is(#capabilities,#experience,#scenarios,#architecture) { scroll-margin-top:68px; }
.home-section { width:min(1180px,calc(100% - 40px)); margin:0 auto; }
.home-hero { position:relative; display:flex; min-height:min(760px,calc(100vh - 26px)); align-items:center; margin-top:68px; overflow:hidden; background:#e9efed; }
.home-hero__backdrop { position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(245,249,248,.99) 0%,rgba(245,249,248,.97) 35%,rgba(245,249,248,.62) 63%,rgba(245,249,248,.22) 100%),linear-gradient(0deg,rgba(13,39,35,.18),transparent 45%),url('/site/planning-gantt.png');background-position:center,right center;background-size:cover,cover,74% auto;background-repeat:no-repeat;filter:saturate(.75); }
.home-hero__grid { position:absolute;inset:0;background-image:linear-gradient(rgb(32 76 67 / 5%) 1px,transparent 1px),linear-gradient(90deg,rgb(32 76 67 / 5%) 1px,transparent 1px);background-size:64px 64px;mask-image:linear-gradient(90deg,#000,transparent 67%); }
.home-hero__inner { position:relative;z-index:2;display:grid;width:min(1240px,calc(100% - 40px));margin:0 auto;grid-template-columns:minmax(0,1fr) 320px;align-items:center;gap:90px;padding:74px 0 92px; }
.home-hero__copy { max-width:720px; }.home-eyebrow { display:flex;align-items:center;gap:10px;margin:0 0 28px;color:#59706b;font-size:11px;font-weight:800;letter-spacing:2px; }.home-eyebrow span { width:28px;height:2px;background:#6ca16f; }
.home-hero h1 { margin:0;color:#102e2a;font-size:64px;font-weight:820;line-height:.96;letter-spacing:0; }.home-hero__statement { margin:18px 0 22px;color:#1d3934;font-size:34px;line-height:1.24; }.home-hero__statement strong { color:#39725f;font-weight:800; }
.home-hero__lead { max-width:610px;margin:0;color:#566a66;font-size:16px;line-height:1.9; }.home-hero__actions { display:flex;flex-wrap:wrap;gap:12px;margin-top:34px; }.home-button { display:inline-flex;min-height:46px;align-items:center;justify-content:center;gap:9px;border:1px solid transparent;border-radius:4px;padding:0 20px;font-size:13px;font-weight:750;transition:transform 160ms ease,background 160ms ease; }.home-button:hover { transform:translateY(-2px); }.home-button--primary { background:#153a34;color:#fff; }.home-button--primary:hover{background:#285d50}.home-button--plain{border-color:#aab9b6;background:rgb(255 255 255 / 54%);color:#27433d}.home-button--plain:hover{background:#fff}.home-hero__trust{display:flex;flex-wrap:wrap;gap:22px;margin-top:40px;color:#6c7d79;font-size:11px}.home-hero__trust span{display:inline-flex;align-items:center;gap:6px}.home-hero__trust i{color:#4d866b;font-size:15px}
.home-hero__signal { align-self:end;border:1px solid rgb(255 255 255 / 60%);border-radius:5px;background:rgb(14 39 35 / 88%);color:#eaf1ef;box-shadow:0 22px 60px rgb(14 39 35 / 24%);backdrop-filter:blur(8px);overflow:hidden; }.signal-head { display:flex;height:42px;align-items:center;justify-content:space-between;border-bottom:1px solid rgb(255 255 255 / 10%);padding:0 14px;color:#8ca19d;font-size:9px;letter-spacing:1px}.signal-head span{display:flex;align-items:center;gap:7px}.signal-head i{width:6px;height:6px;border-radius:50%;background:#a9e653;box-shadow:0 0 0 4px rgb(169 230 83 / 10%)}.signal-head b{font-size:8px}.signal-chart{display:flex;height:110px;align-items:flex-end;gap:5px;border-bottom:1px solid rgb(255 255 255 / 10%);padding:18px 14px 0}.signal-chart span{flex:1;min-width:3px;background:#79a873;animation:signal-rise 1.1s ease both;transform-origin:bottom}.signal-chart span:nth-child(3n){background:#b2dd5e}.signal-metrics{display:grid;grid-template-columns:repeat(3,1fr);padding:15px 10px}.signal-metrics div{display:grid;gap:5px;border-right:1px solid rgb(255 255 255 / 10%);padding:0 9px}.signal-metrics div:last-child{border-right:0}.signal-metrics small{color:#869b96;font-size:7px}.signal-metrics strong{font-size:15px}.signal-metrics em{color:#a9d57c;font-size:7px;font-style:normal}.home-hero__scroll{position:absolute;bottom:24px;left:50%;z-index:3;display:flex;align-items:center;gap:8px;color:#68807a;font-size:9px;letter-spacing:1px;transform:translateX(-50%)}.home-hero__scroll i{animation:scroll-nudge 1.8s ease-in-out infinite}
.capabilities-section{padding:112px 0 120px}.section-intro{display:grid;grid-template-columns:1.2fr 1fr;align-items:end;gap:70px;margin-bottom:68px}.section-index{margin:0 0 18px;color:#4e7b6d;font-size:10px;font-weight:800;letter-spacing:2px}.section-intro h2,.product-proof h2,.scenario-copy h2,.architecture-heading h2,.home-cta h2{margin:0;color:#16342f;font-size:38px;line-height:1.25;letter-spacing:0}.section-intro>p,.product-proof__heading>p,.scenario-copy>p,.architecture-heading>p{margin:0;color:#687b77;font-size:14px;line-height:1.9}.capability-lines{border-top:1px solid #d8e2df}.capability-line{display:grid;grid-template-columns:42px 62px minmax(260px,1fr) minmax(230px,.8fr);align-items:center;gap:24px;border-bottom:1px solid #d8e2df;padding:30px 10px;transition:background 180ms ease,padding 180ms ease}.capability-line:hover{background:#f0f5f3;padding-right:18px;padding-left:18px}.capability-line__number{color:#93a29f;font:10px ui-monospace,monospace}.capability-line__icon{display:grid;width:46px;height:46px;place-items:center;border:1px solid #cad8d4;border-radius:4px;background:#fff;color:#3e7463;font-size:21px}.capability-line__copy p{margin:0 0 6px;color:#6c8c81;font-size:8px;font-weight:800;letter-spacing:1.3px}.capability-line__copy h3{margin:0 0 7px;color:#1c3933;font-size:20px}.capability-line__copy span{color:#72817e;font-size:12px;line-height:1.7}.capability-line ul{display:grid;gap:7px;margin:0;padding:0;list-style:none}.capability-line li{color:#536863;font-size:11px}.capability-line li i{margin-right:7px;color:#4d916f}
.experience-section{background:#102a27;color:#dce8e5}.experience-section__inner{padding:108px 0 120px}.section-intro--light h2{color:#f0f6f4}.section-intro--light>p{color:#8ea49f}.section-intro--light .section-index{color:#a9d85e}.experience-frame{position:relative}.experience-frame::before{position:absolute;inset:-14px;border:1px solid rgb(181 221 98 / 13%);content:'';pointer-events:none}
.product-proof{padding:112px 0 126px}.product-proof__heading{display:flex;align-items:end;justify-content:space-between;gap:60px;margin-bottom:52px}.product-proof__heading>p{max-width:400px;text-align:right}.proof-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:54px 28px}.proof-item--wide{grid-column:1/-1}.proof-item__image{position:relative;overflow:hidden;border:1px solid #cfdbd8;background:#eaf0ee;aspect-ratio:16/8.6}.proof-item:not(.proof-item--wide) .proof-item__image{aspect-ratio:16/10}.proof-item__image img{width:100%;height:100%;object-fit:cover;object-position:top;filter:saturate(.84);transition:transform 500ms ease,filter 300ms ease}.proof-item:hover img{transform:scale(1.018);filter:saturate(1)}.proof-item__image>span{position:absolute;top:12px;left:12px;border:1px solid rgb(255 255 255 / 55%);border-radius:3px;background:rgb(16 42 39 / 86%);color:#dce8e5;padding:7px 9px;font-size:8px;font-weight:800;letter-spacing:1px}.proof-item__copy{display:grid;grid-template-columns:28px 1fr;gap:15px;border-top:2px solid #244b43;padding-top:16px;margin-top:12px}.proof-item__copy>span{color:#82938f;font:9px ui-monospace,monospace}.proof-item__copy h3{margin:0 0 6px;color:#1d3934;font-size:16px}.proof-item__copy p{margin:0;color:#6e7f7b;font-size:11px;line-height:1.7}
.scenarios-section{background:#e8efed}.scenarios-section__inner{display:grid;grid-template-columns:1fr 1fr;min-height:690px}.scenario-copy{padding:110px 80px 100px 0}.scenario-copy>p:not(.section-index){max-width:520px;margin:22px 0 36px}.scenario-selector{border-top:1px solid #c9d6d2}.scenario-selector button{display:grid;width:100%;height:64px;grid-template-columns:32px 1fr auto;align-items:center;border:0;border-bottom:1px solid #c9d6d2;background:transparent;color:#506762;cursor:pointer;padding:0 8px;text-align:left;font-size:13px;font-weight:700}.scenario-selector button span{color:#8a9a96;font:9px ui-monospace,monospace}.scenario-selector button i{opacity:0;transform:translateX(-8px);transition:all 170ms ease}.scenario-selector button.is-active{color:#235746}.scenario-selector button.is-active i{opacity:1;transform:none}.scenario-visual{display:grid;place-items:center;border-left:1px solid #ccd8d4;padding:70px}.scenario-panel{display:flex;width:100%;max-width:430px;min-height:480px;flex-direction:column;justify-content:space-between;border-radius:6px;background:#153a34;color:#e6f0ed;padding:30px;box-shadow:22px 24px 0 #c7d6d1}.scenario-panel header{display:flex;align-items:center;justify-content:space-between}.scenario-panel header span{font-size:9px;letter-spacing:1.5px}.scenario-panel header i{font-size:32px}.scenario-panel>div p{margin:0 0 12px;color:#a4bbb5;font-size:10px}.scenario-panel>div h3{margin:0 0 24px;font-size:25px;line-height:1.4}.scenario-panel ul{display:grid;gap:10px;margin:0;padding:0;list-style:none}.scenario-panel li{border-left:2px solid #a9d85e;padding-left:10px;color:#b9cac6;font-size:11px}.scenario-panel footer{display:flex;align-items:center;justify-content:space-between;color:#9fb3ae;font-size:8px;letter-spacing:.7px}.scenario-panel footer i{width:24px;height:1px;background:#6b817c}.scenario-panel--2{background:#365c73}.scenario-panel--3{background:#554e72}.scenario-panel--4{background:#654d3f}.scenario-change-enter-active,.scenario-change-leave-active{transition:opacity 180ms ease,transform 180ms ease}.scenario-change-enter-from{opacity:0;transform:translateX(12px)}.scenario-change-leave-to{opacity:0;transform:translateX(-12px)}
.architecture-section{padding:112px 0 120px}.architecture-heading{max-width:720px;margin-bottom:58px}.architecture-heading>p:last-child{margin-top:18px}.architecture-flow{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #d5dfdc}.architecture-node{position:relative;display:flex;min-height:210px;align-items:flex-start;flex-direction:column;border-right:1px solid #d5dfdc;padding:23px}.architecture-node:last-child{border-right:0}.architecture-node>span{color:#849590;font-size:7px;font-weight:800;letter-spacing:1.2px}.architecture-node>i{margin:34px 0 20px;color:#3d7563;font-size:27px}.architecture-node strong{color:#213c36;font-size:13px}.architecture-node small{margin-top:7px;color:#7b8a87;font-size:9px}.architecture-node>b{position:absolute;top:50%;right:-13px;z-index:2;display:grid;width:26px;height:26px;place-items:center;border:1px solid #ccd8d4;border-radius:50%;background:#f9fbfb;color:#66827a;font-size:11px}.architecture-tags{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:28px}.architecture-tags span{border:1px solid #d2ddda;border-radius:3px;background:#fff;color:#647672;padding:7px 12px;font:9px ui-monospace,monospace}
.home-cta{position:relative;overflow:hidden;background:#173b35;color:#eff6f4}.home-cta__grid{position:absolute;inset:0;background-image:linear-gradient(rgb(255 255 255 / 4%) 1px,transparent 1px),linear-gradient(90deg,rgb(255 255 255 / 4%) 1px,transparent 1px);background-size:56px 56px}.home-cta__inner{position:relative;display:flex;width:min(1180px,calc(100% - 40px));min-height:410px;align-items:center;justify-content:center;flex-direction:column;margin:0 auto;text-align:center}.home-cta__inner>p{margin:0 0 20px;color:#a9d85e;font-size:9px;letter-spacing:2px}.home-cta h2{max-width:760px;color:#eff6f4;font-size:40px}.home-cta__inner>div{display:flex;gap:12px;margin-top:34px}.home-button--accent{background:#b7e65f;color:#18392f}.home-button--dark-plain{border-color:#6a867f;color:#e4eeeb}
.reveal-block{opacity:0;transform:translateY(18px);transition:opacity 650ms ease,transform 650ms ease}.reveal-block.is-visible{opacity:1;transform:none}
@keyframes signal-rise{from{transform:scaleY(0)}}@keyframes scroll-nudge{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
@media (max-width: 980px){.home-hero__inner{grid-template-columns:1fr;gap:35px}.home-hero__signal{width:320px;align-self:auto}.home-hero__backdrop{background-size:cover,cover,1100px auto;background-position:center,center,52% center}.capability-line{grid-template-columns:34px 52px 1fr}.capability-line ul{grid-column:3}.scenario-copy{padding-right:40px}.scenario-visual{padding:40px}.architecture-flow{grid-template-columns:repeat(3,1fr)}.architecture-node:nth-child(3){border-right:0}.architecture-node:nth-child(n+4){border-top:1px solid #d5dfdc}.architecture-node>b{display:none}}
@media (max-width: 720px){.home-section{width:calc(100% - 32px)}.home-hero{min-height:720px}.home-hero__inner{width:calc(100% - 32px);padding:64px 0 82px}.home-hero h1{font-size:48px}.home-hero__statement{font-size:27px}.home-hero__lead{font-size:14px}.home-hero__signal{width:100%;max-width:340px}.home-hero__trust{gap:12px 18px}.section-intro,.product-proof__heading{grid-template-columns:1fr;align-items:start;gap:24px;margin-bottom:42px}.section-intro h2,.product-proof h2,.scenario-copy h2,.architecture-heading h2,.home-cta h2{font-size:30px}.capabilities-section,.product-proof,.architecture-section{padding:82px 0}.capability-line{grid-template-columns:34px 48px 1fr;gap:12px;padding:22px 0}.capability-line:hover{padding-right:0;padding-left:0}.capability-line__copy span{display:block}.capability-line ul{grid-column:1/-1;margin-left:94px}.experience-section__inner{width:100%;padding:80px 0 92px}.experience-section .section-intro{width:calc(100% - 32px);margin-right:auto;margin-left:auto}.experience-frame::before{display:none}.product-proof__heading{display:grid}.product-proof__heading>p{text-align:left}.proof-gallery{grid-template-columns:1fr;gap:42px}.proof-item--wide{grid-column:auto}.proof-item__image,.proof-item:not(.proof-item--wide) .proof-item__image{aspect-ratio:16/10}.scenarios-section__inner{width:100%;grid-template-columns:1fr}.scenario-copy{padding:78px 16px 42px}.scenario-visual{border-top:1px solid #ccd8d4;border-left:0;padding:46px 24px 64px}.scenario-panel{min-height:410px}.architecture-flow{grid-template-columns:1fr}.architecture-node{min-height:130px;border-right:0;border-bottom:1px solid #d5dfdc}.architecture-node:last-child{border-bottom:0}.architecture-node:nth-child(n+4){border-top:0}.architecture-node>i{margin:20px 0 12px}.home-cta__inner{width:calc(100% - 32px);min-height:370px}.home-cta__inner>div{width:100%;flex-direction:column}.home-button{width:100%}.home-hero__actions .home-button{width:auto}.reveal-block{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.reveal-block{opacity:1;transform:none;transition:none}.signal-chart span,.home-hero__scroll i{animation:none}}
</style>
