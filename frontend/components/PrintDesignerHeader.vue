<template>
  <header ref="headerRef" class="print-app-header">
    <div class="print-app-header__inner">
      <RouterLink class="print-app-brand" to="/" aria-label="返回研峰打印设计器首页">
        <span class="print-app-brand__mark" aria-hidden="true">
          <i class="ri-printer-line" />
        </span>
        <span class="print-app-brand__copy">
          <strong>研峰设计</strong>
          <small>PRINT STUDIO</small>
        </span>
      </RouterLink>

      <span class="print-app-header__divider" aria-hidden="true" />

      <div class="print-app-context">
        <strong>{{ accountSetting ? '账号设置' : '打印设计器' }}</strong>
        <span><i aria-hidden="true" />{{ accountSetting ? '账号中心' : '在线工作区' }}</span>
      </div>

      <div v-if="!accountSetting" class="print-app-workspace">
        <div class="print-app-template" aria-label="当前模板信息">
          <span class="print-app-template__icon" aria-hidden="true">
            <i class="ri-file-text-line" />
          </span>
          <span class="print-app-template__copy" :title="templateName">
            <small>当前模板</small>
            <strong>{{ templateName }}</strong>
          </span>
          <span class="print-app-template__status" :class="{ 'is-dirty': templateDirty }">
            <i :class="templateDirty ? 'ri-edit-circle-line' : 'ri-checkbox-circle-line'" aria-hidden="true" />
            {{ templateStatus }}
          </span>
        </div>

        <div class="print-app-mode-switch" role="tablist" aria-label="设计模式">
          <button
            type="button"
            role="tab"
            :aria-selected="designerMode === 'print'"
            :class="{ 'is-active': designerMode === 'print' }"
            @click="changeDesignerMode('print')"
          >
            <i class="ri-printer-line" aria-hidden="true" />
            <span>打印设计</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="designerMode === 'presentation'"
            :class="{ 'is-active': designerMode === 'presentation' }"
            @click="changeDesignerMode('presentation')"
          >
            <i class="ri-slideshow-3-line" aria-hidden="true" />
            <span>PPT 设计</span>
          </button>
        </div>

        <div
          id="print-designer-header-actions"
          class="print-app-header__designer-actions"
          aria-label="打印设计器操作"
        />
      </div>

      <nav
        class="print-app-actions"
        :class="{ 'print-app-actions--push': accountSetting }"
        aria-label="设计器快捷导航"
      >
        <RouterLink class="print-app-action-link print-app-action-link--home" to="/">
          <i class="ri-home-5-line" aria-hidden="true" />
          <span>首页</span>
        </RouterLink>

        <span v-if="!authReady" class="print-app-auth-loading" role="status">
          <i class="ri-loader-4-line" aria-hidden="true" />
          <span>读取账号</span>
        </span>

        <template v-else-if="signedIn">
          <RouterLink class="print-app-action-link print-app-action-link--dashboard" to="/dashboard">
            <i class="ri-layout-grid-line" aria-hidden="true" />
            <span>工作台</span>
          </RouterLink>

          <div class="print-app-user">
            <button
              class="print-app-user__trigger"
              type="button"
              :aria-expanded="userMenuOpen"
              aria-controls="print-app-user-menu"
              aria-haspopup="dialog"
              @click="userMenuOpen = !userMenuOpen"
            >
              <span class="print-app-user__avatar" aria-hidden="true">{{ userInitial }}</span>
              <span class="print-app-user__copy">
                <strong>{{ displayName }}</strong>
                <small>{{ accountName }}</small>
              </span>
              <i
                :class="userMenuOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"
                aria-hidden="true"
              />
            </button>

            <div
              v-if="userMenuOpen"
              id="print-app-user-menu"
              class="print-app-user-menu"
              role="dialog"
              aria-label="用户信息"
            >
              <div class="print-app-user-menu__summary">
                <span class="print-app-user-menu__avatar" aria-hidden="true">{{ userInitial }}</span>
                <span>
                  <strong>{{ displayName }}</strong>
                  <small>{{ displayEmail }}</small>
                </span>
              </div>

              <div class="print-app-user-menu__account">
                <i class="ri-building-2-line" aria-hidden="true" />
                <span>
                  <small>当前账套</small>
                  <strong>{{ accountName }}</strong>
                </span>
              </div>

              <div class="print-app-user-menu__links">
                <RouterLink to="/dashboard" @click="closeUserMenu">
                  <i class="ri-layout-grid-line" aria-hidden="true" />
                  进入工作台
                </RouterLink>
                <RouterLink to="/print-account-setting" @click="closeUserMenu">
                  <i class="ri-user-settings-line" aria-hidden="true" />
                  账号设置
                </RouterLink>
                <button type="button" :disabled="signingOut" @click="handleSignOut">
                  <i :class="signingOut ? 'ri-loader-4-line print-app-spin' : 'ri-logout-box-r-line'" aria-hidden="true" />
                  {{ signingOut ? '正在退出' : '退出登录' }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <RouterLink v-else class="print-app-login" to="/signin">
          <i class="ri-user-3-line" aria-hidden="true" />
          <span>登录</span>
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

defineProps<{ accountSetting?: boolean }>();

const auth = useAuth();
const headerRef = ref<HTMLElement | null>(null);
const userMenuOpen = ref(false);
const signingOut = ref(false);
const templateName = ref('新建模板');
const templateStatus = ref('尚未保存');
const templateDirty = ref(false);
const designerMode = ref<'print' | 'presentation'>('print');

type TemplateInfoDetail = {
  name?: unknown;
  status?: unknown;
  dirty?: unknown;
};

type PrintTemplateInfoWindow = Window & {
  __ENLEARN_PRINT_TEMPLATE_INFO__?: TemplateInfoDetail;
};

const authReady = computed(() => auth.ready.value);
const signedIn = computed(() => Boolean(auth.user.value));

function readDisplayString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

const displayEmail = computed(() => auth.user.value?.email ?? '已登录用户');
const displayName = computed(() => {
  const profile = auth.profile.value ?? {};
  return readDisplayString(profile.full_name ?? profile.nickname ?? profile.name)
    || auth.user.value?.email?.split('@')[0]
    || '设计用户';
});
const accountName = computed(() => auth.activeAccount.value?.name ?? '个人工作区');
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase());

function closeUserMenu() {
  userMenuOpen.value = false;
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!headerRef.value?.contains(event.target as Node)) closeUserMenu();
}

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeUserMenu();
}

function applyTemplateInfo(detail: TemplateInfoDetail | undefined) {
  if (!detail) return;

  const name = readDisplayString(detail.name);
  const status = readDisplayString(detail.status);
  templateName.value = name || '新建模板';
  templateStatus.value = status || '尚未保存';
  templateDirty.value = detail.dirty === true;
}

function handleTemplateInfoChange(event: Event) {
  applyTemplateInfo((event as CustomEvent<TemplateInfoDetail>).detail);
}

function changeDesignerMode(mode: 'print' | 'presentation') {
  designerMode.value = mode;
  window.dispatchEvent(new CustomEvent('enlearn:print-designer-mode-change', {
    detail: { mode },
  }));
}

function handleDesignerModeChange(event: Event) {
  const mode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
  if (mode === 'print' || mode === 'presentation') designerMode.value = mode;
}

async function handleSignOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    await auth.signOut();
  } finally {
    signingOut.value = false;
    closeUserMenu();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeyDown);
  window.addEventListener('enlearn:print-template-info-change', handleTemplateInfoChange);
  window.addEventListener('enlearn:print-designer-mode-change', handleDesignerModeChange);
  window.addEventListener('enlearn:print-designer-mode-state', handleDesignerModeChange);
  applyTemplateInfo((window as PrintTemplateInfoWindow).__ENLEARN_PRINT_TEMPLATE_INFO__);
  void auth.init();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeyDown);
  window.removeEventListener('enlearn:print-template-info-change', handleTemplateInfoChange);
  window.removeEventListener('enlearn:print-designer-mode-change', handleDesignerModeChange);
  window.removeEventListener('enlearn:print-designer-mode-state', handleDesignerModeChange);
});
</script>

<style scoped>
.print-app-header {
  position: relative;
  z-index: 120;
  flex: 0 0 64px;
  width: 100%;
  border-bottom: 1px solid #dfe5ea;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 1px 0 rgb(15 23 42 / 2%), 0 8px 28px rgb(15 23 42 / 4%);
  color: #182230;
}

.print-app-header__inner {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  align-items: center;
  gap: 18px;
  padding: 0 22px;
}

.print-app-brand {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}

.print-app-brand__mark {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(145deg, #1e2a3b, #101827);
  box-shadow: 0 6px 14px rgb(15 23 42 / 18%);
  color: #fff;
  font-size: 19px;
}

.print-app-brand__copy,
.print-app-context,
.print-app-user__copy {
  display: grid;
  min-width: 0;
}

.print-app-brand__copy { gap: 3px; }
.print-app-brand__copy strong { font-size: 15px; line-height: 1; white-space: nowrap; }
.print-app-brand__copy small {
  color: #8a95a5;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 1.65px;
  line-height: 1;
}

.print-app-header__divider {
  width: 1px;
  height: 27px;
  flex: 0 0 1px;
  background: #e2e7ec;
}

.print-app-context { flex: 0 0 auto; gap: 4px; }
.print-app-context strong { font-size: 14px; line-height: 1; white-space: nowrap; }
.print-app-context span {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #7c8795;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}
.print-app-context span i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #2fb978;
  box-shadow: 0 0 0 3px rgb(47 185 120 / 12%);
}

.print-app-workspace {
  display: flex;
  min-width: 0;
  align-items: center;
  flex: 1 1 auto;
  justify-content: center;
  gap: 18px;
  overflow: hidden;
}

.print-app-template {
  display: flex;
  min-width: 0;
  align-items: center;
  flex: 0 1 auto;
  gap: 10px;
  overflow: hidden;
}

.print-app-mode-switch {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid #dfe5ea;
  border-radius: 9px;
  background: #f5f7f8;
}

.print-app-mode-switch button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #7a8592;
  padding: 0 9px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.print-app-mode-switch button:hover { color: #334155; }

.print-app-mode-switch button.is-active {
  border-color: #d6e5df;
  background: #fff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
  color: #24775a;
}

.print-app-mode-switch button i { font-size: 14px; }

.print-app-header__designer-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  flex: 0 1 auto;
}

.print-app-header__designer-actions :deep(.lc-node-button-group) {
  width: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.print-app-header__designer-actions :deep(.lc-button-group) {
  display: flex !important;
  min-width: 0;
  align-items: center;
  flex-wrap: nowrap !important;
  gap: 5px !important;
}

.print-app-header__designer-actions :deep(.vxe-button) {
  height: 34px !important;
  min-height: 34px !important;
  margin: 0 !important;
  padding: 0 11px !important;
  border-color: #d9e0e8 !important;
  border-radius: 8px !important;
  background: #fff !important;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%) !important;
  color: #445064 !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  white-space: nowrap;
}

.print-app-header__designer-actions :deep(.vxe-button:hover:not(.is--disabled)) {
  border-color: #aebbc9 !important;
  background: #f7f9fb !important;
  color: #172033 !important;
}

.print-app-header__designer-actions :deep(.vxe-button.theme--primary) {
  border-color: #5b4bdd !important;
  background: #5b4bdd !important;
  color: #fff !important;
}

.print-app-header__designer-actions :deep(.vxe-button.theme--primary:hover:not(.is--disabled)) {
  border-color: #4939c7 !important;
  background: #4939c7 !important;
  color: #fff !important;
}

.print-app-header__designer-actions :deep(.vxe-button.theme--success) {
  border-color: #15945c !important;
  background: #15945c !important;
  color: #fff !important;
}

.print-app-header__designer-actions :deep(.vxe-button.theme--success:hover:not(.is--disabled)) {
  border-color: #117b4d !important;
  background: #117b4d !important;
  color: #fff !important;
}

.print-app-header__designer-actions :deep(.vxe-button .vxe-button--icon) {
  font-size: 14px;
}

.print-app-template__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border: 1px solid #dce5e2;
  border-radius: 9px;
  background: #f6faf8;
  color: #3b6658;
  font-size: 16px;
}

.print-app-template__copy {
  display: grid;
  min-width: 0;
  max-width: 260px;
  gap: 3px;
}

.print-app-template__copy small {
  color: #8a95a2;
  font-size: 9px;
  line-height: 1;
}

.print-app-template__copy strong {
  overflow: hidden;
  color: #283444;
  font-size: 12px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.print-app-template__status {
  display: inline-flex;
  height: 25px;
  max-width: 190px;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #eef8f3;
  color: #27805e;
  padding: 0 9px;
  font-size: 10px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.print-app-template__status.is-dirty {
  background: #fff5e8;
  color: #b36a13;
}

.print-app-actions {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  flex: 0 0 auto;
  gap: 7px;
}
.print-app-actions--push { margin-left: auto; }

.print-app-action-link,
.print-app-login {
  display: inline-flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 9px;
  color: #566172;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}

.print-app-action-link:hover { background: #f3f6f8; color: #182230; }

.print-app-login {
  min-width: 78px;
  border: 1px solid #182230;
  background: #182230;
  color: #fff;
}
.print-app-login:hover { border-color: #2e3c50; background: #2e3c50; }

.print-app-auth-loading {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 7px;
  color: #7c8795;
  padding: 0 8px;
  font-size: 11px;
}
.print-app-auth-loading i { animation: print-app-spin 900ms linear infinite; }

.print-app-user { position: relative; }
.print-app-user__trigger {
  display: flex;
  height: 44px;
  max-width: 222px;
  align-items: center;
  gap: 9px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: #182230;
  padding: 3px 7px 3px 4px;
  cursor: pointer;
  text-align: left;
  transition: background 160ms ease, border-color 160ms ease;
}
.print-app-user__trigger:hover,
.print-app-user__trigger[aria-expanded='true'] { border-color: #e1e6eb; background: #f7f9fa; }

.print-app-user__avatar,
.print-app-user-menu__avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid #d6e5e0;
  border-radius: 10px;
  background: linear-gradient(145deg, #e8f2ee, #f5f8f7);
  color: #315d50;
  font-size: 13px;
  font-weight: 800;
}

.print-app-user__copy { max-width: 126px; flex: 1 1 auto; gap: 2px; }
.print-app-user__copy strong,
.print-app-user__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.print-app-user__copy strong { font-size: 12px; line-height: 1.2; }
.print-app-user__copy small { color: #8a94a1; font-size: 10px; line-height: 1.2; }
.print-app-user__trigger > i { flex: 0 0 auto; color: #8b96a4; font-size: 15px; }

.print-app-user-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 260px;
  overflow: hidden;
  border: 1px solid #dfe5ea;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 48px rgb(15 23 42 / 16%);
}

.print-app-user-menu__summary {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 16px;
}
.print-app-user-menu__summary > span:last-child { display: grid; min-width: 0; gap: 3px; }
.print-app-user-menu__summary strong,
.print-app-user-menu__summary small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.print-app-user-menu__summary strong { font-size: 13px; }
.print-app-user-menu__summary small { color: #7b8795; font-size: 11px; }

.print-app-user-menu__account {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 10px 10px;
  border: 1px solid #e6ebee;
  border-radius: 10px;
  background: #f8fafb;
  color: #687484;
  padding: 10px 11px;
}
.print-app-user-menu__account > i { font-size: 17px; }
.print-app-user-menu__account span { display: grid; min-width: 0; gap: 2px; }
.print-app-user-menu__account small { color: #8b96a3; font-size: 9px; }
.print-app-user-menu__account strong { overflow: hidden; color: #344050; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }

.print-app-user-menu__links {
  display: grid;
  border-top: 1px solid #edf0f2;
  padding: 7px;
}
.print-app-user-menu__links a,
.print-app-user-menu__links button {
  display: flex;
  width: 100%;
  height: 36px;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #485465;
  padding: 0 10px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: left;
  text-decoration: none;
}
.print-app-user-menu__links a:hover,
.print-app-user-menu__links button:hover { background: #f3f6f8; color: #182230; }
.print-app-user-menu__links button:last-child { color: #b84a4a; }
.print-app-user-menu__links button:disabled { cursor: wait; opacity: .65; }
.print-app-spin { animation: print-app-spin 900ms linear infinite; }

@keyframes print-app-spin { to { transform: rotate(360deg); } }

@media (max-width: 1080px) {
  .print-app-template { display: none; }
  .print-app-workspace { justify-content: flex-start; }
}

@media (max-width: 860px) {
  .print-app-header__inner { gap: 12px; padding: 0 14px; }
  .print-app-action-link--home span { display: none; }
  .print-app-action-link--home { width: 36px; padding: 0; }
}

@media (max-width: 680px) {
  .print-app-header { flex-basis: 58px; }
  .print-app-brand__copy small,
  .print-app-context,
  .print-app-action-link--dashboard { display: none; }
  .print-app-header__divider { display: none; }
  .print-app-workspace {
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .print-app-workspace::-webkit-scrollbar { display: none; }
  .print-app-mode-switch button span { display: none; }
  .print-app-mode-switch button { width: 32px; justify-content: center; padding: 0; }
  .print-app-header__designer-actions { flex: 0 0 auto; }
  .print-app-user__trigger { max-width: 170px; }
}

@media (max-width: 480px) {
  .print-app-header__inner { gap: 8px; padding: 0 9px; }
  .print-app-brand__copy,
  .print-app-header__divider,
  .print-app-action-link--home,
  .print-app-user__copy { display: none; }
  .print-app-brand__mark { width: 34px; height: 34px; flex-basis: 34px; }
  .print-app-context strong { font-size: 13px; }
  .print-app-user__trigger { width: 42px; padding: 3px; }
  .print-app-user__trigger > i { display: none; }
  .print-app-user-menu { right: -2px; width: min(260px, calc(100vw - 18px)); }
}
</style>
