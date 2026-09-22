<template>
  <div class="print-account-setting">
    <PrintDesignerHeader account-setting />

    <main class="print-account-setting__main">
      <div class="print-account-setting__breadcrumb">
        <RouterLink to="/print-designer">
          <i class="ri-arrow-left-line" aria-hidden="true" />
          返回打印设计器
        </RouterLink>
      </div>

      <header class="print-account-setting__heading">
        <div>
          <p>ACCOUNT</p>
          <h1>账号设置</h1>
          <span>管理打印设计器中显示的账号信息。</span>
        </div>
        <div class="print-account-setting__account">
          <i class="ri-building-2-line" aria-hidden="true" />
          <span>
            <small>当前账套</small>
            <strong>{{ accountName }}</strong>
          </span>
        </div>
      </header>

      <section class="print-account-setting__panel" aria-labelledby="print-account-profile-title">
        <div class="print-account-setting__panel-heading">
          <span class="print-account-setting__panel-icon" aria-hidden="true">
            <i class="ri-user-settings-line" />
          </span>
          <div>
            <h2 id="print-account-profile-title">基本信息</h2>
            <p>邮箱修改后可能需要重新确认。</p>
          </div>
        </div>

        <div v-if="loadingDefinition || loadingAccount" class="print-account-setting__loading" role="status">
          <i class="ri-loader-4-line print-account-setting__spin" aria-hidden="true" />
          正在读取账号信息
        </div>

        <template v-else-if="formSchema">
          <LowCodeForm
            ref="accountFormRef"
            v-model="form"
            :schema="formSchema"
            :loading="saving"
            @submit="saveAccount"
          />

          <div class="print-account-setting__actions">
            <button type="button" :disabled="saving" @click="submitAccountForm">
              <i :class="saving ? 'ri-loader-4-line print-account-setting__spin' : 'ri-save-line'" aria-hidden="true" />
              {{ saving ? '正在保存' : '保存设置' }}
            </button>
          </div>
        </template>

        <p v-if="errorMessage" class="print-account-setting__message is-error" role="alert">
          <i class="ri-error-warning-line" aria-hidden="true" />
          {{ errorMessage }}
        </p>
        <p v-else-if="successMessage" class="print-account-setting__message is-success" role="status">
          <i class="ri-checkbox-circle-line" aria-hidden="true" />
          {{ successMessage }}
        </p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';
import PrintDesignerHeader from '../components/PrintDesignerHeader.vue';
import {
  loadLowCodeFormDefinition,
  LOW_CODE_FORM_CODES,
} from '../utils/lowCodeFormDefinitions';

type AccountSnapshot = {
  user: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  profile: Record<string, unknown> | null;
};

const auth = useAuth();
const serviceApi = useServiceApi();
const accountFormRef = ref<{
  validate: () => Promise<boolean>;
  snapshot: () => Record<string, unknown>;
} | null>(null);
const formSchema = shallowRef<LowCodeFormSchema | null>(null);
const form = ref<Record<string, unknown>>({ fullName: '', email: '' });
const savedForm = ref<Record<string, unknown>>({ fullName: '', email: '' });
const loadingDefinition = ref(true);
const loadingAccount = ref(true);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const accountName = computed(() => auth.activeAccount.value?.name ?? '个人工作区');

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function loadFormDefinition() {
  loadingDefinition.value = true;
  try {
    const definition = await loadLowCodeFormDefinition(
      serviceApi,
      LOW_CODE_FORM_CODES.printAccountSetting,
    );
    formSchema.value = definition.schema;
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '账号设置表单加载失败。';
  } finally {
    loadingDefinition.value = false;
  }
}

async function loadAccount() {
  loadingAccount.value = true;
  try {
    await auth.init(true);
    const account = await serviceApi.firstItem<AccountSnapshot>('user', { itemType: 'me' });
    if (!account?.user) throw new Error('未读取到当前账号。');

    const nextForm = {
      fullName: readText(account.profile?.full_name)
        || readText(account.user.user_metadata?.full_name),
      email: readText(account.user.email),
    };
    form.value = nextForm;
    savedForm.value = { ...nextForm };
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '账号信息加载失败。';
  } finally {
    loadingAccount.value = false;
  }
}

async function submitAccountForm() {
  const accountForm = accountFormRef.value;
  if (!accountForm || saving.value) return;
  if (!(await accountForm.validate())) return;
  await saveAccount(accountForm.snapshot());
}

async function saveAccount(values: Record<string, unknown>) {
  if (saving.value) return;
  saving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  const nextForm = {
    fullName: readText(values.fullName),
    email: readText(values.email),
  };
  const nameChanged = nextForm.fullName !== savedForm.value.fullName;
  const emailChanged = nextForm.email !== savedForm.value.email;

  try {
    if (nameChanged) {
      await serviceApi.invoke('user', 'updateProfile', { fullName: nextForm.fullName });
    }
    if (emailChanged) {
      await serviceApi.invoke('user', 'updateEmail', { email: nextForm.email });
    }

    form.value = { ...nextForm };
    savedForm.value = { ...nextForm };
    await auth.init(true);
    successMessage.value = emailChanged
      ? '设置已保存，请按邮件提示确认新邮箱。'
      : '设置已保存。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '账号设置保存失败。';
    await loadAccount();
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void Promise.all([loadFormDefinition(), loadAccount()]);
});
</script>

<style scoped>
.print-account-setting {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  background: #f4f6f8;
  color: #182230;
}

.print-account-setting__main {
  width: min(880px, calc(100% - 40px));
  margin: 0 auto;
  padding: 28px 0 56px;
}

.print-account-setting__breadcrumb a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #697586;
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}

.print-account-setting__breadcrumb a:hover { color: #182230; }

.print-account-setting__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 0 22px;
}

.print-account-setting__heading p {
  margin: 0 0 6px;
  color: #778393;
  font-size: 10px;
  font-weight: 750;
}

.print-account-setting__heading h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: 0;
  line-height: 1.25;
}

.print-account-setting__heading > div > span {
  display: block;
  margin-top: 8px;
  color: #697586;
  font-size: 13px;
}

.print-account-setting__account {
  display: flex;
  min-width: 210px;
  align-items: center;
  gap: 10px;
  border-left: 1px solid #d9dfe5;
  color: #667383;
  padding: 3px 0 3px 18px;
}

.print-account-setting__account > i { font-size: 20px; }
.print-account-setting__account span { display: grid; min-width: 0; gap: 3px; }
.print-account-setting__account small { color: #8a95a2; font-size: 9px; }
.print-account-setting__account strong {
  overflow: hidden;
  color: #344050;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.print-account-setting__panel {
  border: 1px solid #dfe4e8;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 7px 24px rgb(15 23 42 / 5%);
  padding: 24px;
}

.print-account-setting__panel-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid #edf0f2;
}

.print-account-setting__panel-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border: 1px solid #d9e5e1;
  border-radius: 8px;
  background: #f2f7f5;
  color: #356456;
  font-size: 18px;
}

.print-account-setting__panel-heading h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.print-account-setting__panel-heading p {
  margin: 4px 0 0;
  color: #7b8794;
  font-size: 11px;
}

.print-account-setting__panel :deep(.lc-form) {
  gap: 18px;
  background: transparent;
}

.print-account-setting__panel :deep(.lc-field) { gap: 7px; }
.print-account-setting__panel :deep(.lc-field label) {
  color: #405062;
  font-size: 12px;
  font-weight: 650;
}
.print-account-setting__panel :deep(.vxe-input) { height: 42px; }

.print-account-setting__loading {
  display: flex;
  min-height: 126px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #778393;
  font-size: 12px;
}

.print-account-setting__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #edf0f2;
}

.print-account-setting__actions button {
  display: inline-flex;
  height: 38px;
  min-width: 112px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid #156f52;
  border-radius: 6px;
  background: #167b5a;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.print-account-setting__actions button:hover:not(:disabled) { background: #126a4d; }
.print-account-setting__actions button:disabled { cursor: wait; opacity: .62; }

.print-account-setting__message {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 18px 0 0;
  border-left: 3px solid;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.55;
}

.print-account-setting__message.is-success {
  border-color: #23845a;
  background: #eef8f3;
  color: #176a46;
}

.print-account-setting__message.is-error {
  border-color: #c3493c;
  background: #fff4f2;
  color: #a3382d;
}

.print-account-setting__spin { animation: print-account-setting-spin .8s linear infinite; }
@keyframes print-account-setting-spin { to { transform: rotate(360deg); } }

@media (max-width: 680px) {
  .print-account-setting__main {
    width: min(100% - 28px, 880px);
    padding-top: 20px;
  }

  .print-account-setting__heading {
    align-items: flex-start;
    flex-direction: column;
    padding-top: 22px;
  }

  .print-account-setting__account {
    width: 100%;
    border-top: 1px solid #d9dfe5;
    border-left: 0;
    padding: 14px 0 0;
  }

  .print-account-setting__panel { padding: 18px; }
}
</style>
