<template>
  <main class="erp-signin">
    <section class="erp-signin__brand" aria-label="打印设计器">
      <div class="erp-signin__brand-copy">
        <div class="erp-signin__product">
          <span class="erp-signin__product-mark">P</span>
          <span>Print Designer</span>
        </div>
        <p class="erp-signin__eyebrow">可视化打印模板设计</p>
        <h1>打印设计器</h1>
        <p class="erp-signin__lead">
          拖拽排版业务单据，绑定数据字段并实时预览，快速制作规范、易用的打印模板。
        </p>
        <div class="erp-signin__signals" aria-hidden="true">
          <span><i class="ri-layout-4-line" />可视化排版</span>
          <span><i class="ri-links-line" />数据字段绑定</span>
          <span><i class="ri-eye-line" />实时预览</span>
        </div>
      </div>
    </section>

    <section class="erp-signin__workspace">
      <div class="erp-login-panel">
        <header class="erp-login-panel__header">
          <div>
            <p>欢迎回来</p>
            <h2>登录打印设计器</h2>
          </div>
        </header>

        <p class="erp-login-panel__description">
          请输入登录信息。
        </p>

        <LowCodeForm
          ref="loginFormRef"
          v-model="form"
          :schema="loginSchema"
          :loading="loading"
          @submit="handleSubmit"
        />

        <div class="erp-login-panel__preferences">
          <label class="erp-login-panel__remember">
            <input v-model="rememberLoginAccount" type="checkbox" />
            <span>记住登录账号</span>
          </label>
        </div>

        <button
          class="erp-login-panel__primary"
          type="button"
          :disabled="loading"
          @click="submitLoginForm"
        >
          <i :class="loading ? 'ri-loader-4-line erp-spin' : 'ri-login-box-line'" aria-hidden="true" />
          <span>{{ loading ? '正在登录...' : selectingAccountForSession ? '进入工作台' : '登录' }}</span>
        </button>

        <button
          v-if="!selectingAccountForSession"
          class="erp-login-panel__register"
          type="button"
          @click="navigateTo('/signup')"
        >
          <i class="ri-user-add-line" aria-hidden="true" />
          <span>注册账号</span>
        </button>

        <p v-if="message" class="erp-login-panel__error" role="alert">
          <i class="ri-error-warning-line" aria-hidden="true" />
          {{ message }}
        </p>
      </div>

      <footer class="erp-signin__footer">{{ SITE_NAME }} · 个人学习交流站点</footer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { signInSchema } from '~/schemas/auth';
import { SITE_NAME } from '../config/site';

const LOGIN_ACCOUNT_KEY = 'enlearn_login_account';
const LOGIN_ACCOUNT_SET_KEY = 'enlearn_login_account_set_id';
const auth = useAuth();
const loading = ref(false);
const message = ref('');
const rememberLoginAccount = ref(true);
const loginFormRef = ref<{
  validate: () => Promise<boolean>;
  snapshot: () => Record<string, unknown>;
} | null>(null);
const form = ref<Record<string, unknown>>({
  email: import.meta.server ? '' : window.localStorage.getItem(LOGIN_ACCOUNT_KEY) ?? '',
  password: ''
});
const selectingAccountForSession = computed(() =>
  Boolean(auth.user.value && !auth.activeAccount.value)
);
const loginSchema = signInSchema;

async function submitLoginForm() {
  const loginForm = loginFormRef.value;
  if (!loginForm || loading.value) return;
  if (!(await loginForm.validate())) return;
  await handleSubmit(loginForm.snapshot());
}

function isAccountEnabled(account: { status?: string | null }) {
  return account.status !== 'inactive' && account.status !== 'archived';
}

function preferredAccount() {
  const availableAccounts = auth.accounts.value.filter(isAccountEnabled);
  const savedAccountId = window.localStorage.getItem(LOGIN_ACCOUNT_SET_KEY) ?? '';
  return availableAccounts.find((account) => account.account_id === savedAccountId)
    ?? availableAccounts.find((account) => account.is_last_used)
    ?? availableAccounts.find((account) => account.is_default)
    ?? availableAccounts[0];
}

async function activatePreferredAccount() {
  const account = preferredAccount();
  if (!account) {
    throw new Error('该登录账号没有可用账套，请联系系统管理员。');
  }

  await auth.selectAccount(account.account_id, { setDefault: true });
  window.localStorage.setItem(LOGIN_ACCOUNT_SET_KEY, account.account_id);
}

async function handleSubmit(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  try {
    if (selectingAccountForSession.value) {
      await activatePreferredAccount();
    } else {
      await auth.signInWithPassword({
        email: String(values.email),
        password: String(values.password)
      });
      if (rememberLoginAccount.value) {
        window.localStorage.setItem(LOGIN_ACCOUNT_KEY, String(values.email));
      } else {
        window.localStorage.removeItem(LOGIN_ACCOUNT_KEY);
      }
    }
    await navigateTo('/');
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : '登录失败，请检查登录信息。';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!selectingAccountForSession.value) return;

  try {
    await activatePreferredAccount();
    await navigateTo('/');
  } catch (error) {
    message.value = error instanceof Error ? error.message : '登录失败，请检查登录信息。';
  }
});

</script>

<style scoped>
.erp-signin {
  --erp-signin-workspace-background: #f6f8fa;

  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(0, 1.25fr) minmax(430px, 0.75fr);
  background: var(--erp-signin-workspace-background);
}

.erp-signin__brand {
  position: relative;
  display: grid;
  min-height: 100vh;
  align-content: center;
  overflow: hidden;
  background: #163653;
  color: #ffffff;
  padding: 7vh clamp(36px, 7vw, 110px);
}

.erp-signin__brand::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgb(11 31 49 / 88%), rgb(20 67 92 / 54%)),
    url('/site/print-designer.png') center / cover;
  content: '';
  filter: saturate(0.72) contrast(1.06);
}

.erp-signin__brand::after {
  position: absolute;
  inset: auto 0 0;
  height: 38%;
  background: linear-gradient(0deg, rgb(7 29 45 / 88%), transparent);
  content: '';
}

.erp-signin__brand-copy {
  position: relative;
  z-index: 1;
  max-width: 640px;
}

.erp-signin__product {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 70px;
  color: rgb(255 255 255 / 84%);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
}

.erp-signin__product-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  background: #e33b32;
  color: #fff;
  font-size: 16px;
}

.erp-signin__eyebrow {
  margin: 0 0 10px;
  color: #80c6f1;
  font-size: 14px;
  font-weight: 700;
}

.erp-signin__brand h1 {
  max-width: 10ch;
  margin: 0;
  font-size: 58px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.08;
}

.erp-signin__lead {
  max-width: 40ch;
  margin: 22px 0 0;
  color: rgb(255 255 255 / 78%);
  font-size: 16px;
  line-height: 1.8;
}

.erp-signin__signals {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 36px;
  color: rgb(255 255 255 / 78%);
  font-size: 12px;
}

.erp-signin__signals span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.erp-signin__signals i {
  color: #87c9f0;
  font-size: 17px;
}

.erp-signin__workspace {
  display: grid;
  min-height: 100vh;
  align-content: center;
  background: var(--erp-signin-workspace-background);
  padding: 36px clamp(32px, 5vw, 76px);
}

.erp-login-panel {
  width: 100%;
  max-width: 440px;
  justify-self: center;
}

.erp-login-panel__header {
  margin-bottom: 10px;
}

.erp-login-panel__header p {
  margin: 0 0 3px;
  color: #6a7888;
  font-size: 12px;
}

.erp-login-panel__header h2 {
  margin: 0;
  color: #172b3d;
  font-size: 27px;
  line-height: 1.2;
}

.erp-login-panel__description {
  margin: 0 0 24px;
  color: #71808f;
  font-size: 13px;
}

.erp-login-panel :deep(.lc-form) {
  background: var(--erp-signin-workspace-background);
  gap: 16px;
}

.erp-login-panel :deep(.lc-field) {
  gap: 7px;
}

.erp-login-panel :deep(.lc-field label) {
  color: #40566a;
  font-size: 12px;
}

.erp-login-panel :deep(.vxe-input),
.erp-login-panel :deep(.vxe-select) {
  height: 42px;
}

.erp-login-panel__preferences {
  display: flex;
  min-height: 47px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.erp-login-panel__remember {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 15px 0;
  color: #5f6f7f;
  cursor: pointer;
  font-size: 12px;
}

.erp-login-panel__remember input {
  width: 15px;
  height: 15px;
  accent-color: #1674b7;
}

.erp-login-panel__primary,
.erp-login-panel__register {
  display: flex;
  width: 100%;
  height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.erp-login-panel__primary {
  border: 1px solid #176ea9;
  background: #1778b9;
  color: #fff;
}

.erp-login-panel__primary:hover:not(:disabled) {
  background: #12689f;
}

.erp-login-panel__primary:disabled,
.erp-login-panel__register:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.erp-login-panel__register {
  margin-top: 11px;
  border: 1px solid #cbd4dc;
  background: #fff;
  color: #354b5e;
}

.erp-login-panel__register:hover:not(:disabled) {
  border-color: #9fb3c4;
  background: #f9fbfc;
}

.erp-login-panel__error {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 14px 0 0;
  border-left: 3px solid #c3493c;
  background: #fff5f3;
  color: #a3382d;
  padding: 9px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.erp-signin__footer {
  align-self: end;
  justify-self: center;
  margin-top: 38px;
  color: #91a0ad;
  font-size: 10px;
}

.erp-spin {
  animation: erp-spin 0.8s linear infinite;
}

@keyframes erp-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 880px) {
  .erp-signin {
    grid-template-columns: 1fr;
  }

  .erp-signin__brand {
    min-height: 210px;
    align-content: end;
    padding: 26px 24px;
  }

  .erp-signin__product {
    margin-bottom: 24px;
  }

  .erp-signin__brand h1 {
    max-width: none;
    font-size: 34px;
  }

  .erp-signin__lead,
  .erp-signin__signals {
    display: none;
  }

  .erp-signin__workspace {
    min-height: calc(100vh - 210px);
    align-content: start;
    padding: 32px 20px 22px;
  }

}

@media (max-width: 520px) {
  .erp-signin__brand {
    min-height: 156px;
    padding: 20px;
  }

  .erp-signin__product {
    margin-bottom: 16px;
  }

  .erp-signin__brand h1 {
    font-size: 28px;
  }

  .erp-signin__eyebrow {
    font-size: 12px;
  }

  .erp-signin__workspace {
    min-height: calc(100vh - 156px);
    padding: 24px 16px 18px;
  }

  .erp-login-panel__header h2 {
    font-size: 23px;
  }

  .erp-login-panel__preferences {
    align-items: flex-start;
    flex-direction: column;
    gap: 0;
  }
}
</style>
