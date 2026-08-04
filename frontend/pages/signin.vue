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
          <button
            v-if="step === 'account'"
            type="button"
            class="erp-login-panel__back"
            title="返回账号登录"
            aria-label="返回账号登录"
            @click="backToCredentials"
          >
            <i class="ri-arrow-left-line" aria-hidden="true" />
          </button>
          <div>
            <p>{{ step === 'credentials' ? '欢迎回来' : '进入业务账套' }}</p>
            <h2>{{ step === 'credentials' ? '登录管理平台' : '选择账套' }}</h2>
          </div>
          <span class="erp-login-panel__step">{{ step === 'credentials' ? '1 / 2' : '2 / 2' }}</span>
        </header>

        <template v-if="step === 'credentials'">
          <p class="erp-login-panel__description">验证身份后选择本次工作的账套。</p>
          <LowCodeForm
            ref="loginFormRef"
            v-model="form"
            :schema="signInSchema"
            :loading="loading"
            @submit="handleSubmit"
          />

          <label class="erp-login-panel__remember">
            <input v-model="rememberLoginAccount" type="checkbox" />
            <span>记住登录账号</span>
          </label>

          <button
            class="erp-login-panel__primary"
            type="button"
            :disabled="loading"
            @click="submitLoginForm"
          >
            <i :class="loading ? 'ri-loader-4-line erp-spin' : 'ri-arrow-right-line'" aria-hidden="true" />
            <span>{{ loading ? '正在验证...' : '下一步' }}</span>
          </button>

          <button class="erp-login-panel__oauth" type="button" :disabled="loading" @click="handleGithub">
            <i class="ri-github-fill" aria-hidden="true" />
            <span>使用 GitHub 登录</span>
          </button>
        </template>

        <template v-else>
          <p class="erp-login-panel__description">
            当前账号：<strong>{{ auth.user.value?.email ?? String(form.email) }}</strong>
          </p>

          <label class="erp-account-search">
            <i class="ri-search-line" aria-hidden="true" />
            <input v-model="accountSearch" type="search" placeholder="搜索账套编码或名称" />
          </label>

          <div class="erp-account-list" role="listbox" aria-label="可用账套">
            <button
              v-for="account in filteredAccounts"
              :key="account.account_id"
              type="button"
              role="option"
              :disabled="!isAccountEnabled(account)"
              :aria-selected="selectedAccountId === account.account_id"
              :class="{ 'is-selected': selectedAccountId === account.account_id }"
              @click="selectedAccountId = account.account_id"
            >
              <span class="erp-account-list__code">{{ account.code ?? '---' }}</span>
              <span class="erp-account-list__content">
                <strong>{{ account.name ?? '未命名账套' }}</strong>
                <small>
                  {{ account.account_role === 'owner' ? '账套主管' : '账套成员' }}
                  <template v-if="account.base_currency"> · {{ account.base_currency }}</template>
                </small>
              </span>
              <span class="erp-account-list__status" :class="account.status ?? 'active'">
                {{ accountStatusLabel(account) }}
              </span>
              <i
                :class="selectedAccountId === account.account_id ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'"
                aria-hidden="true"
              />
            </button>

            <p v-if="!filteredAccounts.length" class="erp-account-list__empty">
              没有匹配的可用账套
            </p>
          </div>

          <label class="erp-login-panel__remember">
            <input v-model="preferSelectedAccount" type="checkbox" />
            <span>下次优先使用该账套</span>
          </label>

          <button
            class="erp-login-panel__primary"
            type="button"
            :disabled="loading || !selectedAccountId"
            @click="activateSelectedAccount"
          >
            <i :class="loading ? 'ri-loader-4-line erp-spin' : 'ri-login-box-line'" aria-hidden="true" />
            <span>{{ loading ? '正在进入...' : '进入工作台' }}</span>
          </button>
        </template>

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

const auth = useAuth();
const loading = ref(false);
const message = ref('');
const step = ref<'credentials' | 'account'>('credentials');
const accountSearch = ref('');
const selectedAccountId = ref('');
const rememberLoginAccount = ref(true);
const preferSelectedAccount = ref(true);
const loginFormRef = ref<{
  validate: () => Promise<boolean>;
  snapshot: () => Record<string, unknown>;
} | null>(null);
const form = ref<Record<string, unknown>>({
  email: import.meta.server ? '' : window.localStorage.getItem('enlearn_login_account') ?? '',
  password: ''
});
const filteredAccounts = computed(() => {
  const keyword = accountSearch.value.trim().toLowerCase();
  const rows = auth.accounts.value;
  if (!keyword) return rows;
  return rows.filter((account) =>
    [account.code, account.name, account.slug]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  );
});

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
    await auth.signInWithPassword({
      email: String(values.email),
      password: String(values.password)
    });
    if (rememberLoginAccount.value) {
      window.localStorage.setItem('enlearn_login_account', String(values.email));
    } else {
      window.localStorage.removeItem('enlearn_login_account');
    }
    if (!auth.accounts.value.length) {
      throw new Error('当前账号尚未分配可用账套，请联系系统管理员。');
    }
    selectedAccountId.value = preferredAccountId();
    step.value = 'account';
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'You could not be signed in.';
  } finally {
    loading.value = false;
  }
}

function preferredAccountId() {
  const preferred = auth.accounts.value.find(
    (item) => item.is_default && isAccountEnabled(item)
  ) ?? [...auth.accounts.value]
    .filter(isAccountEnabled)
    .sort((left, right) => String(left.code ?? '').localeCompare(String(right.code ?? '')))[0];
  return preferred?.account_id ?? '';
}

function isAccountEnabled(account: AppAccountSummary) {
  return account.status !== 'inactive' && account.status !== 'archived';
}

function accountStatusLabel(account: AppAccountSummary) {
  if (account.status === 'inactive') return '已停用';
  if (account.status === 'archived') return '已归档';
  return '正常';
}

function backToCredentials() {
  auth.clearActiveAccount();
  step.value = 'credentials';
  message.value = '';
  form.value.password = '';
}

async function activateSelectedAccount() {
  if (!selectedAccountId.value || loading.value) return;
  loading.value = true;
  message.value = '';
  try {
    await auth.selectAccount(selectedAccountId.value, {
      setDefault: preferSelectedAccount.value
    });
    await navigateTo('/dashboard');
  } catch (error) {
    message.value = error instanceof Error ? error.message : '账套启用失败，请重试。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (auth.user.value && !auth.activeAccount.value && auth.accounts.value.length) {
    selectedAccountId.value = preferredAccountId();
    step.value = 'account';
  }
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
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
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

.erp-login-panel__step {
  color: #7990a3;
  font-size: 11px;
  font-weight: 700;
}

.erp-login-panel__back {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #ccd6df;
  border-radius: 4px;
  background: #fff;
  color: #315570;
  cursor: pointer;
}

.erp-login-panel__description {
  margin: 0 0 24px;
  color: #71808f;
  font-size: 13px;
}

.erp-login-panel__description strong {
  color: #31465a;
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

.erp-login-panel :deep(.vxe-input) {
  height: 42px;
}

.erp-login-panel__remember {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 16px 0;
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

.erp-account-search {
  display: grid;
  height: 38px;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  border: 1px solid #c9d4de;
  border-radius: 4px;
  background: #fff;
  color: #71808f;
  padding: 0 8px;
}

.erp-account-search input {
  min-width: 0;
  border: 0;
  outline: 0;
  color: #263b4d;
  font: inherit;
  font-size: 13px;
}

.erp-account-list {
  display: grid;
  max-height: min(330px, 42vh);
  gap: 6px;
  margin-top: 10px;
  overflow-y: auto;
}

.erp-account-list > button {
  display: grid;
  width: 100%;
  min-height: 62px;
  grid-template-columns: 48px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 10px;
  border: 1px solid #d4dce4;
  border-radius: 5px;
  background: #fff;
  color: #263b4d;
  cursor: pointer;
  padding: 8px 10px;
  text-align: left;
}

.erp-account-list > button:hover:not(:disabled),
.erp-account-list > button.is-selected {
  border-color: #2e84bc;
  background: #f2f8fc;
}

.erp-account-list > button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.erp-account-list__code {
  display: grid;
  min-height: 28px;
  place-items: center;
  border: 1px solid #bfd3e1;
  border-radius: 3px;
  background: #edf6fb;
  color: #176ea9;
  font-size: 11px;
  font-weight: 800;
}

.erp-account-list__content {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.erp-account-list__content strong,
.erp-account-list__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.erp-account-list__content strong {
  font-size: 13px;
}

.erp-account-list__content small {
  color: #71808f;
  font-size: 11px;
}

.erp-account-list__status {
  color: #27815b;
  font-size: 10px;
}

.erp-account-list__status.inactive,
.erp-account-list__status.archived {
  color: #a04b3d;
}

.erp-account-list > button > i {
  color: #2381bd;
  font-size: 17px;
}

.erp-account-list__empty {
  margin: 0;
  border: 1px dashed #ccd6df;
  color: #71808f;
  padding: 30px 12px;
  text-align: center;
  font-size: 12px;
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

  .erp-account-list {
    max-height: 300px;
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

  .erp-account-list {
    max-height: min(280px, 36vh);
  }

  .erp-account-list > button {
    grid-template-columns: 44px minmax(0, 1fr) 18px;
    gap: 8px;
  }

  .erp-account-list__status {
    display: none;
  }
}
</style>
