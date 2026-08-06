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

        <MobileForm
          :block="loginFormBlock"
          :resolved-data="loginFormData"
          :form-models="formModels"
          :active-action-codes="activeActionCodes"
          @runtime-event="handleFormEvent"
        />

        <div v-if="message" class="login-error">
          <span class="login-error-text">{{ message }}</span>
        </div>
      </div>

      <span class="login-footer">EnLearn Manufacturing · 企业管理系统</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from '@vue/runtime-core';
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
import MobileForm from '../runtime/materials/mobile-form.vue';
import type {
  MobileFormModels,
  MobileRuntimeBlock,
  MobileRuntimeEvent,
} from '../runtime/types';

const LOGIN_FORM_ID = 'mobile-login-form';

const emit = defineEmits<{
  pageTitleChange: [title: string];
}>();

const route = useRoute();
const router = useRouter();
const authApi = createMobileAuthApi();
const accounts = ref<MobileAccountOption[]>([]);
const accountLoading = ref(false);
const submitting = ref(false);
const message = ref('');
const formModels = reactive<MobileFormModels>({
  [LOGIN_FORM_ID]: {
    email: '',
    password: '',
    accountId: '',
    preferSelectedAccount: true,
  },
});
const activeActionCodes = reactive<Record<string, string>>({});
const loginModel = computed(() => formModels[LOGIN_FORM_ID]);
const loginAccount = computed(() => String(loginModel.value.email ?? '').trim());
const loginFormData = computed<Record<string, unknown>>(() => ({
  accounts: accounts.value.map((account) => ({
    ...account,
    label: accountLabel(account),
  })),
}));
const loginFormBlock = computed<MobileRuntimeBlock>(() => ({
  id: LOGIN_FORM_ID,
  kind: 'form',
  appearance: 'plain',
  actionLayout: 'stretch',
  disabled: submitting.value,
  schema: {
    columns: 1,
    fields: [
      {
        field: 'email',
        label: '登录账号',
        component: 'vxe-input',
        props: {
          placeholder: 'admin',
          trim: true,
        },
        rules: [{ required: true, message: '请输入登录账号' }],
      },
      {
        field: 'password',
        label: '登录密码',
        component: 'vxe-password-input',
        props: { placeholder: '请输入密码' },
        rules: [{ required: true, message: '请输入登录密码' }],
      },
      {
        field: 'accountId',
        label: '选择账套',
        component: 'vxe-select',
        optionsSourceKey: 'accounts',
        optionProps: {
          label: 'label',
          value: 'account_id',
        },
        props: {
          disabled: accountLoading.value || !loginAccount.value || !accounts.value.length,
          placeholder: accountPlaceholder.value,
        },
        rules: [{ required: true, message: '请选择业务账套' }],
      },
      {
        field: 'preferSelectedAccount',
        label: '账套偏好',
        showTitle: false,
        component: 'lc-checkbox',
        props: {
          text: '下次优先使用该账套',
        },
      },
    ],
    actions: [{
      code: 'submit',
      label: submitting.value ? '正在登录...' : '登录',
      type: 'submit',
      status: 'primary',
      disabled: submitting.value || accountLoading.value,
    }],
  },
}));
const accountPlaceholder = computed(() => {
  if (accountLoading.value) return '正在加载账套...';
  if (!loginAccount.value) return '请先输入登录账号';
  if (!accounts.value.length) return '暂无可用账套';
  return '请选择账套';
});
let accountRequestId = 0;
let accountTimer: ReturnType<typeof setTimeout> | undefined;

function accountLabel(account: MobileAccountOption) {
  return [account.name || '未命名账套', account.code, account.base_currency]
    .filter(Boolean)
    .join(' · ');
}

function returnPath() {
  const value = route.query.redirect;
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

async function loadAccountOptions(login = loginAccount.value) {
  const normalizedLogin = login.trim();
  const requestId = ++accountRequestId;
  accounts.value = [];
  loginModel.value.accountId = '';
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
    loginModel.value.accountId = accounts.value.find((account) => account.account_id === savedAccountId)
      ?.account_id ?? accounts.value[0]?.account_id ?? '';
    if (!accounts.value.length) message.value = '该登录账号没有可用账套，请联系系统管理员。';
  } catch (error) {
    if (requestId !== accountRequestId) return;
    message.value = error instanceof Error ? error.message : '账套加载失败，请稍后重试。';
  } finally {
    if (requestId === accountRequestId) accountLoading.value = false;
  }
}

function scheduleAccountOptions(login: string) {
  accountRequestId += 1;
  accounts.value = [];
  loginModel.value.accountId = '';
  message.value = '';
  if (accountTimer) clearTimeout(accountTimer);

  const normalizedLogin = login.trim();
  if (!normalizedLogin) {
    accountLoading.value = false;
    return;
  }

  accountLoading.value = true;
  accountTimer = setTimeout(() => {
    void loadAccountOptions(normalizedLogin);
  }, 300);
}

function handleFormEvent(event: MobileRuntimeEvent) {
  if (event.name === 'form.fieldChange') {
    message.value = '';
    if (event.payload?.field === 'email') {
      scheduleAccountOptions(String(event.payload.value ?? ''));
    }
    return;
  }

  if (event.name === 'form.submit') {
    void submitLogin(event.payload?.values ?? loginModel.value);
  }
}

async function submitLogin(values: Record<string, unknown>) {
  if (submitting.value) return;
  message.value = '';

  const email = String(values.email ?? '').trim();
  const password = String(values.password ?? '');
  const accountId = String(values.accountId ?? '');
  if (!email || !password || !accountId) {
    message.value = '请完整填写登录信息。';
    return;
  }

  submitting.value = true;
  try {
    const payload = await authApi.signIn({
      email,
      password,
      accountId,
      setDefault: values.preferSelectedAccount !== false,
    });
    const accessToken = payload.session?.access_token ?? '';
    const selectedAccountId = payload.activeAccount?.account_id ?? accountId;
    if (!accessToken || !selectedAccountId) {
      throw new Error('登录成功，但没有返回可用会话或账套。');
    }

    await Promise.all([
      writeMobileStorage('accessToken', accessToken),
      writeMobileStorage('accountId', selectedAccountId),
      writeMobileStorage('loginAccount', email),
      writeMobileStorage('loginAccountId', selectedAccountId),
      payload.session?.refresh_token
        ? writeMobileStorage('refreshToken', payload.session.refresh_token)
        : Promise.resolve(),
    ]);
    updateRuntimeAuth(accessToken, selectedAccountId);
    loginModel.value.password = '';
    await router.replace(returnPath());
  } catch (error) {
    message.value = error instanceof Error ? error.message : '登录失败，请检查登录信息。';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  emit('pageTitleChange', '登录');
  const savedLoginAccount = await readMobileStorage('loginAccount');
  loginModel.value.email = savedLoginAccount;
  await loadAccountOptions(savedLoginAccount);
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
  background-color: #edf2f5;
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
  margin-right: 18px;
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
  padding-left: 18px;
  border-left-width: 1px;
  border-left-style: solid;
  border-left-color: #527087;
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
  min-height: 610px;
  padding-top: 30px;
  padding-right: 20px;
  padding-bottom: 20px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.login-panel {
  width: 100%;
  max-width: 480px;
  padding-top: 24px;
  padding-right: 24px;
  padding-bottom: 24px;
  padding-left: 24px;
  align-self: center;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #d9e1e7;
  border-radius: 8px;
}

.login-eyebrow {
  color: #b43c34;
  font-size: 12px;
  line-height: 18px;
  font-weight: bold;
}

.login-title {
  margin-top: 3px;
  color: #172b3d;
  font-size: 26px;
  line-height: 34px;
  font-weight: bold;
}

.login-description {
  margin-top: 7px;
  margin-bottom: 12px;
  color: #71808f;
  font-size: 13px;
  line-height: 20px;
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

.login-footer {
  margin-top: 26px;
  align-self: center;
  color: #788997;
  font-size: 10px;
  line-height: 15px;
}
</style>
