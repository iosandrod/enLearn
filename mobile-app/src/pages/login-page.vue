<template>
  <div class="login-screen">
    <div class="login-brand">
      <div class="brand-mark">
        <span class="brand-mark-text">M</span>
      </div>
      <div class="brand-copy">
        <span class="brand-product">MANUFACTURING ERP</span>
        <span class="brand-title">工厂制造管理平台</span>
        <span class="brand-description">连接计划、采购、生产与交付</span>
      </div>
    </div>

    <div class="login-workspace">
      <div class="login-panel">
        <span class="login-eyebrow">欢迎回来</span>
        <span class="login-title">登录管理平台</span>
        <span class="login-description">请输入登录信息并选择业务账套。</span>

        <div class="login-field">
          <span class="field-label">登录账号</span>
          <input
            class="field-input"
            type="text"
            :value="loginAccount"
            placeholder="admin"
            @change="handleAccountChange"
          />
        </div>

        <div class="login-field">
          <span class="field-label">登录密码</span>
          <input
            class="field-input"
            type="password"
            :value="password"
            placeholder="请输入密码"
            @change="password = readInputValue($event)"
          />
        </div>

        <div class="login-field">
          <span class="field-label">选择账套</span>
          <div v-if="accountLoading" class="account-state">
            <span class="account-state-text">正在加载账套...</span>
          </div>
          <div v-else-if="!accounts.length" class="account-state">
            <span class="account-state-text">{{ loginAccount ? '暂无可用账套' : '请先输入登录账号' }}</span>
          </div>
          <div v-else class="account-list">
            <button
              v-for="account in accounts"
              :key="account.account_id"
              :class="['account-option', { 'is-selected': account.account_id === accountId }]"
              @click="accountId = account.account_id"
            >
              <div :class="['account-radio', { 'is-selected': account.account_id === accountId }]">
                <div v-if="account.account_id === accountId" class="account-radio-dot" />
              </div>
              <div class="account-copy">
                <span class="account-name">{{ account.name || '未命名账套' }}</span>
                <span class="account-meta">{{ accountMeta(account) }}</span>
              </div>
            </button>
          </div>
        </div>

        <button class="preference-row" @click="preferSelectedAccount = !preferSelectedAccount">
          <div :class="['preference-check', { 'is-checked': preferSelectedAccount }]">
            <span v-if="preferSelectedAccount" class="preference-check-text">✓</span>
          </div>
          <span class="preference-label">下次优先使用该账套</span>
        </button>

        <div v-if="message" class="login-error">
          <span class="login-error-text">{{ message }}</span>
        </div>

        <button
          :class="['login-submit', { 'is-disabled': submitting || accountLoading }]"
          :disabled="submitting || accountLoading"
          @click="submitLogin"
        >
          <span class="login-submit-text">{{ submitting ? '正在登录...' : '登录' }}</span>
        </button>
      </div>

      <span class="login-footer">EnLearn Manufacturing · 企业管理系统</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from '@vue/runtime-core';
import { useRoute, useRouter } from '@hippy/vue-router-next-history';

import {
  readMobileStorage,
  updateRuntimeAuth,
  writeMobileStorage,
} from '../config';
import {
  createMobileAuthApi,
  type MobileAccountOption,
} from '../runtime/auth-api';

const emit = defineEmits<{
  pageTitleChange: [title: string];
}>();

const route = useRoute();
const router = useRouter();
const authApi = createMobileAuthApi();
const loginAccount = ref('');
const password = ref('');
const accountId = ref('');
const accounts = ref<MobileAccountOption[]>([]);
const accountLoading = ref(false);
const submitting = ref(false);
const preferSelectedAccount = ref(true);
const message = ref('');
const restoringLoginAccount = ref(false);
let accountRequestId = 0;
let accountTimer: ReturnType<typeof setTimeout> | undefined;

function readInputValue(event: unknown) {
  if (event && typeof event === 'object' && 'value' in event) {
    return String((event as { value?: unknown }).value ?? '');
  }
  return '';
}

function accountMeta(account: MobileAccountOption) {
  return [account.code, account.base_currency].filter(Boolean).join(' · ');
}

function returnPath() {
  const value = route.query.redirect;
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

function handleAccountChange(event: unknown) {
  loginAccount.value = readInputValue(event).trim();
}

async function loadAccountOptions(login = loginAccount.value) {
  const normalizedLogin = login.trim();
  const requestId = ++accountRequestId;
  accounts.value = [];
  accountId.value = '';
  message.value = '';

  if (!normalizedLogin) {
    accountLoading.value = false;
    return;
  }

  accountLoading.value = true;
  try {
    const rows = await authApi.listAccountOptions(normalizedLogin);
    if (requestId !== accountRequestId) return;

    accounts.value = rows.filter((account) =>
      account.status !== 'inactive' && account.status !== 'archived'
    );
    const savedAccountId = await readMobileStorage('loginAccountId');
    if (requestId !== accountRequestId) return;
    accountId.value = accounts.value.find((account) => account.account_id === savedAccountId)
      ?.account_id ?? accounts.value[0]?.account_id ?? '';
    if (!accounts.value.length) message.value = '该登录账号没有可用账套，请联系系统管理员。';
  } catch (error) {
    if (requestId !== accountRequestId) return;
    message.value = error instanceof Error ? error.message : '账套加载失败，请稍后重试。';
  } finally {
    if (requestId === accountRequestId) accountLoading.value = false;
  }
}

async function submitLogin() {
  if (submitting.value) return;
  message.value = '';

  if (!loginAccount.value) {
    message.value = '请输入登录账号。';
    return;
  }
  if (!password.value) {
    message.value = '请输入登录密码。';
    return;
  }
  if (!accountId.value) {
    message.value = '请选择业务账套。';
    return;
  }

  submitting.value = true;
  try {
    const payload = await authApi.signIn({
      email: loginAccount.value,
      password: password.value,
      accountId: accountId.value,
      setDefault: preferSelectedAccount.value,
    });
    const accessToken = payload.session?.access_token ?? '';
    const selectedAccountId = payload.activeAccount?.account_id ?? accountId.value;
    if (!accessToken || !selectedAccountId) {
      throw new Error('登录成功，但没有返回可用会话或账套。');
    }

    await Promise.all([
      writeMobileStorage('accessToken', accessToken),
      writeMobileStorage('accountId', selectedAccountId),
      writeMobileStorage('loginAccount', loginAccount.value),
      writeMobileStorage('loginAccountId', selectedAccountId),
      payload.session?.refresh_token
        ? writeMobileStorage('refreshToken', payload.session.refresh_token)
        : Promise.resolve(),
    ]);
    updateRuntimeAuth(accessToken, selectedAccountId);
    password.value = '';
    await router.replace(returnPath());
  } catch (error) {
    message.value = error instanceof Error ? error.message : '登录失败，请检查登录信息。';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  emit('pageTitleChange', '登录');
  restoringLoginAccount.value = true;
  loginAccount.value = await readMobileStorage('loginAccount');
  restoringLoginAccount.value = false;
  await loadAccountOptions();
});

watch(loginAccount, (login, previousLogin) => {
  if (restoringLoginAccount.value || login === previousLogin) return;
  accountRequestId += 1;
  accounts.value = [];
  accountId.value = '';
  message.value = '';
  if (accountTimer) clearTimeout(accountTimer);
  if (!login) {
    accountLoading.value = false;
    return;
  }
  accountLoading.value = true;
  accountTimer = setTimeout(() => {
    void loadAccountOptions(login);
  }, 300);
});

onBeforeUnmount(() => {
  if (accountTimer) clearTimeout(accountTimer);
});
</script>

<style scoped>
.login-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #f3f6f8;
}

.login-brand {
  min-height: 178px;
  padding-top: 28px;
  padding-right: 24px;
  padding-bottom: 26px;
  padding-left: 24px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #173a52;
}

.brand-mark {
  width: 50px;
  height: 50px;
  margin-right: 15px;
  align-items: center;
  justify-content: center;
  background-color: #d8453b;
}

.brand-mark-text {
  color: #ffffff;
  font-size: 25px;
  font-weight: bold;
}

.brand-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-product {
  color: #b9d8e9;
  font-size: 10px;
  line-height: 15px;
}

.brand-title {
  margin-top: 6px;
  color: #ffffff;
  font-size: 24px;
  line-height: 32px;
  font-weight: bold;
}

.brand-description {
  margin-top: 6px;
  color: #c3d3dc;
  font-size: 12px;
  line-height: 18px;
}

.login-workspace {
  flex: 1;
  padding-top: 26px;
  padding-right: 20px;
  padding-bottom: 18px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.login-panel {
  width: 100%;
  max-width: 440px;
  align-self: center;
  display: flex;
  flex-direction: column;
}

.login-eyebrow {
  color: #6a7888;
  font-size: 12px;
  line-height: 18px;
}

.login-title {
  margin-top: 2px;
  color: #172b3d;
  font-size: 24px;
  line-height: 32px;
  font-weight: bold;
}

.login-description {
  margin-top: 8px;
  margin-bottom: 8px;
  color: #71808f;
  font-size: 13px;
  line-height: 20px;
}

.login-field {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
}

.field-label {
  margin-bottom: 7px;
  color: #40566a;
  font-size: 12px;
  line-height: 18px;
}

.field-input {
  height: 44px;
  padding-right: 12px;
  padding-left: 12px;
  color: #172b3d;
  font-size: 14px;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #c7d1d9;
  border-radius: 4px;
}

.account-state {
  min-height: 44px;
  padding-right: 12px;
  padding-left: 12px;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #c7d1d9;
  border-radius: 4px;
}

.account-state-text {
  color: #8a98a5;
  font-size: 13px;
}

.account-list {
  display: flex;
  flex-direction: column;
}

.account-option {
  min-height: 54px;
  padding-right: 12px;
  padding-left: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #c7d1d9;
  border-radius: 4px;
}

.account-option + .account-option {
  margin-top: 7px;
}

.account-option.is-selected {
  border-color: #1778b9;
  background-color: #f1f8fc;
}

.account-radio {
  width: 18px;
  height: 18px;
  margin-right: 11px;
  align-items: center;
  justify-content: center;
  border-width: 1px;
  border-style: solid;
  border-color: #9aa9b5;
  border-radius: 9px;
}

.account-radio.is-selected {
  border-color: #1778b9;
}

.account-radio-dot {
  width: 8px;
  height: 8px;
  background-color: #1778b9;
  border-radius: 4px;
}

.account-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.account-name {
  color: #23394c;
  font-size: 13px;
  line-height: 19px;
  font-weight: bold;
}

.account-meta {
  margin-top: 2px;
  color: #7b8996;
  font-size: 10px;
  line-height: 15px;
}

.preference-row {
  min-height: 42px;
  margin-top: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #f3f6f8;
}

.preference-check {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #aab6c0;
  border-radius: 3px;
}

.preference-check.is-checked {
  border-color: #1778b9;
  background-color: #1778b9;
}

.preference-check-text {
  color: #ffffff;
  font-size: 12px;
  font-weight: bold;
}

.preference-label {
  color: #5f6f7f;
  font-size: 12px;
}

.login-error {
  margin-top: 10px;
  padding-top: 9px;
  padding-right: 10px;
  padding-bottom: 9px;
  padding-left: 10px;
  background-color: #fff0ee;
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: #c3493c;
}

.login-error-text {
  color: #a3382d;
  font-size: 12px;
  line-height: 18px;
}

.login-submit {
  height: 46px;
  margin-top: 12px;
  align-items: center;
  justify-content: center;
  background-color: #1778b9;
  border-radius: 4px;
}

.login-submit.is-disabled {
  background-color: #8eb8d3;
}

.login-submit-text {
  color: #ffffff;
  font-size: 14px;
  font-weight: bold;
}

.login-footer {
  margin-top: 22px;
  align-self: center;
  color: #91a0ad;
  font-size: 10px;
  line-height: 15px;
}
</style>
