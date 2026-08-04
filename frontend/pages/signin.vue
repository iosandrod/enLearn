<template>
  <main class="erp-signin">
    <section class="erp-signin__brand" aria-label="工厂制造管理平台">
      <div class="erp-signin__brand-copy">
        <div class="erp-signin__product">
          <span class="erp-signin__product-mark">M</span>
          <span>Manufacturing ERP</span>
        </div>
        <p class="erp-signin__eyebrow">制造业一体化管理</p>
        <h1>工厂制造管理平台</h1>
        <p class="erp-signin__lead">
          从计划、采购到生产与交付，在同一套可信数据中协同工作。
        </p>
        <div class="erp-signin__signals" aria-hidden="true">
          <span><i class="ri-building-2-line" />多组织核算</span>
          <span><i class="ri-git-merge-line" />流程协同</span>
          <span><i class="ri-shield-check-line" />账套隔离</span>
        </div>
      </div>
      <div class="erp-signin__factory" aria-hidden="true">
        <span class="erp-signin__factory-label">数字化工厂</span>
        <div class="erp-signin__factory-grid" />
        <i class="ri-building-4-line" />
      </div>
    </section>

    <section class="erp-signin__workspace">
      <div class="erp-login-panel">
        <header class="erp-login-panel__header">
          <div>
            <p>欢迎回来</p>
            <h2>{{ selectingAccountForSession ? '选择账套' : '登录管理平台' }}</h2>
          </div>
        </header>

        <p class="erp-login-panel__description">
          {{ selectingAccountForSession ? `当前账号：${auth.user.value?.email ?? ''}` : '请输入登录信息并选择业务账套。' }}
        </p>

        <LowCodeForm
          ref="loginFormRef"
          v-model="form"
          :schema="loginSchema"
          :option-sources="accountOptionSources"
          :loading="loading || accountOptionsLoading"
          @submit="handleSubmit"
        />

        <div class="erp-login-panel__preferences">
          <label v-if="!selectingAccountForSession" class="erp-login-panel__remember">
            <input v-model="rememberLoginAccount" type="checkbox" />
            <span>记住登录账号</span>
          </label>
          <label class="erp-login-panel__remember">
            <input v-model="preferSelectedAccount" type="checkbox" />
            <span>下次优先使用该账套</span>
          </label>
        </div>

        <button
          class="erp-login-panel__primary"
          type="button"
          :disabled="loading || accountOptionsLoading"
          @click="submitLoginForm"
        >
          <i :class="loading ? 'ri-loader-4-line erp-spin' : 'ri-login-box-line'" aria-hidden="true" />
          <span>{{ loading ? '正在登录...' : selectingAccountForSession ? '进入工作台' : '登录' }}</span>
        </button>

        <button
          v-if="!selectingAccountForSession"
          class="erp-login-panel__oauth"
          type="button"
          :disabled="loading || accountOptionsLoading"
          @click="handleGithub"
        >
          <i class="ri-github-fill" aria-hidden="true" />
          <span>使用 GitHub 登录</span>
        </button>

        <p v-if="message" class="erp-login-panel__error" role="alert">
          <i class="ri-error-warning-line" aria-hidden="true" />
          {{ message }}
        </p>
      </div>

      <footer class="erp-signin__footer">EnLearn Manufacturing · 企业管理系统</footer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { signInSchema } from '~/schemas/auth';
import type { AppAccountSummary } from '~/composables/useAuthState';

type LoginAccountOption = Pick<
  AppAccountSummary,
  'account_id' | 'code' | 'name' | 'base_currency' | 'status'
>;

const LOGIN_ACCOUNT_KEY = 'enlearn_login_account';
const LOGIN_ACCOUNT_SET_KEY = 'enlearn_login_account_set_id';
const auth = useAuth();
const loading = ref(false);
const accountOptionsLoading = ref(true);
const message = ref('');
const accountOptions = ref<LoginAccountOption[]>([]);
const rememberLoginAccount = ref(true);
const preferSelectedAccount = ref(true);
let accountOptionsRequestId = 0;
let accountOptionsTimer: ReturnType<typeof setTimeout> | undefined;
const loginFormRef = ref<{
  validate: () => Promise<boolean>;
  snapshot: () => Record<string, unknown>;
} | null>(null);
const form = ref<Record<string, unknown>>({
  email: import.meta.server ? '' : window.localStorage.getItem(LOGIN_ACCOUNT_KEY) ?? '',
  password: '',
  accountId: import.meta.server ? '' : window.localStorage.getItem(LOGIN_ACCOUNT_SET_KEY) ?? ''
});
const selectingAccountForSession = computed(() =>
  Boolean(auth.user.value && !auth.activeAccount.value)
);
const loginAccount = computed(() => String(form.value.email ?? '').trim());
const loginSchema = computed(() => ({
  ...signInSchema,
  fields: signInSchema.fields
    .filter((field) => !selectingAccountForSession.value || field.field === 'accountId')
    .map((field) => field.field === 'accountId'
      ? {
          ...field,
          props: {
            ...field.props,
            disabled: accountOptionsLoading.value || (
              !selectingAccountForSession.value && !loginAccount.value
            ),
            placeholder: accountOptionsLoading.value
              ? '正在加载账套...'
              : !selectingAccountForSession.value && !loginAccount.value
                ? '请先输入登录账号'
                : '请选择账套'
          }
        }
      : field)
}));
const accountOptionSources = computed(() => ({
  accounts: accountOptions.value.map((account) => ({
    ...account,
    label: [account.code, account.name].filter(Boolean).join(' · ') || '未命名账套'
  }))
}));

async function submitLoginForm() {
  const loginForm = loginFormRef.value;
  if (!loginForm || loading.value) return;
  if (!(await loginForm.validate())) return;
  await handleSubmit(loginForm.snapshot());
}

async function handleSubmit(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  try {
    const accountId = String(values.accountId ?? '');
    if (selectingAccountForSession.value) {
      await auth.selectAccount(accountId, {
        setDefault: preferSelectedAccount.value
      });
    } else {
      await auth.signInWithPassword({
        email: String(values.email),
        password: String(values.password),
        accountId,
        setDefault: preferSelectedAccount.value
      });
      if (rememberLoginAccount.value) {
        window.localStorage.setItem(LOGIN_ACCOUNT_KEY, String(values.email));
      } else {
        window.localStorage.removeItem(LOGIN_ACCOUNT_KEY);
      }
    }
    window.localStorage.setItem(LOGIN_ACCOUNT_SET_KEY, accountId);
    await navigateTo('/dashboard');
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : '登录失败，请检查登录信息。';
  } finally {
    loading.value = false;
  }
}

function isAccountEnabled(account: AppAccountSummary) {
  return account.status !== 'inactive' && account.status !== 'archived';
}

async function loadAccountOptions(login = loginAccount.value) {
  const requestId = ++accountOptionsRequestId;
  if (!selectingAccountForSession.value && !login) {
    accountOptions.value = [];
    form.value.accountId = '';
    accountOptionsLoading.value = false;
    return;
  }

  accountOptionsLoading.value = true;
  try {
    if (selectingAccountForSession.value) {
      accountOptions.value = auth.accounts.value.filter(isAccountEnabled);
    } else {
      const payload = await $fetch<{ accounts: LoginAccountOption[] }>('/api/auth/account-options', {
        query: { login }
      });
      if (requestId !== accountOptionsRequestId) return;
      accountOptions.value = Array.isArray(payload.accounts) ? payload.accounts : [];
    }

    const selectedAccountId = String(form.value.accountId ?? '');
    if (!accountOptions.value.some((account) => account.account_id === selectedAccountId)) {
      const preferredAccount = selectingAccountForSession.value
        ? auth.accounts.value.find((account) => account.is_default && isAccountEnabled(account))
        : undefined;
      form.value.accountId = preferredAccount?.account_id ?? accountOptions.value[0]?.account_id ?? '';
    }

    message.value = accountOptions.value.length
      ? ''
      : '该登录账号没有可用账套，请联系系统管理员。';
  } catch (error) {
    if (requestId !== accountOptionsRequestId) return;
    accountOptions.value = [];
    message.value = error instanceof Error ? error.message : '账套加载失败，请稍后重试。';
  } finally {
    if (requestId === accountOptionsRequestId) {
      accountOptionsLoading.value = false;
    }
  }
}

onMounted(() => {
  void loadAccountOptions();
});

watch(loginAccount, (login, previousLogin) => {
  if (selectingAccountForSession.value || login === previousLogin) return;
  accountOptionsRequestId += 1;
  accountOptions.value = [];
  form.value.accountId = '';
  message.value = '';
  accountOptionsLoading.value = Boolean(login);
  if (accountOptionsTimer) clearTimeout(accountOptionsTimer);
  if (!login) {
    accountOptionsLoading.value = false;
    return;
  }
  accountOptionsTimer = setTimeout(() => {
    void loadAccountOptions(login);
  }, 300);
});

onBeforeUnmount(() => {
  if (accountOptionsTimer) clearTimeout(accountOptionsTimer);
});

async function handleGithub() {
  loading.value = true;
  message.value = '';

  try {
    await auth.signInWithOAuth('github');
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'GitHub sign in failed.';
    loading.value = false;
  }
}
</script>

<style scoped>
.erp-signin {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(0, 1.25fr) minmax(430px, 0.75fr);
  background: #f4f7fa;
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
    url('/hikari-dashboard.png') center / cover;
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

.erp-signin__brand-copy,
.erp-signin__factory {
  position: relative;
  z-index: 1;
}

.erp-signin__brand-copy {
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

.erp-signin__factory {
  position: absolute;
  right: clamp(28px, 5vw, 80px);
  bottom: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(255 255 255 / 55%);
  font-size: 11px;
}

.erp-signin__factory-grid {
  width: 84px;
  height: 1px;
  background: rgb(255 255 255 / 25%);
}

.erp-signin__factory > i {
  font-size: 18px;
}

.erp-signin__workspace {
  display: grid;
  min-height: 100vh;
  align-content: center;
  background: #f6f8fa;
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
.erp-login-panel__oauth {
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
.erp-login-panel__oauth:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.erp-login-panel__oauth {
  margin-top: 11px;
  border: 1px solid #cbd4dc;
  background: #fff;
  color: #354b5e;
}

.erp-login-panel__oauth:hover:not(:disabled) {
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
  .erp-signin__signals,
  .erp-signin__factory {
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
