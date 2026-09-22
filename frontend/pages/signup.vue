<template>
  <main class="print-signup">
    <section class="print-signup__showcase" aria-label="打印设计器介绍">
      <div class="print-signup__showcase-copy">
        <div class="print-signup__product">
          <span class="print-signup__product-mark"><i class="ri-printer-line" aria-hidden="true" /></span>
          <span>{{ SITE_SHORT_NAME }}打印设计器</span>
        </div>

        <p class="print-signup__eyebrow">可视化打印模板设计</p>
        <h1>让每一张业务单据<br />清晰、规范、易用</h1>
        <p class="print-signup__lead">
          通过拖拽完成单据排版，灵活绑定业务数据，设计过程中即可预览最终打印效果。
        </p>

        <div class="print-signup__features" aria-label="打印设计器功能">
          <span><i class="ri-layout-4-line" aria-hidden="true" />自由排版</span>
          <span><i class="ri-links-line" aria-hidden="true" />数据绑定</span>
          <span><i class="ri-eye-line" aria-hidden="true" />实时预览</span>
        </div>
      </div>

      <div class="print-signup__preview" aria-hidden="true">
        <i class="ri-file-paper-2-line" />
        <span>所见即所得的模板设计体验</span>
      </div>
    </section>

    <section class="print-signup__workspace">
      <div class="print-signup__panel">
        <header class="print-signup__header">
          <p>开始使用打印设计器</p>
          <h2>创建账号</h2>
          <span>填写邮箱和密码，即可创建你的设计空间。</span>
        </header>

        <LowCodeForm
          ref="signupFormRef"
          v-model="form"
          :schema="signUpSchema"
          :loading="loading"
          @submit="handleSubmit"
        />

        <button class="print-signup__submit" type="button" :disabled="loading" @click="submitSignupForm">
          <i :class="loading ? 'ri-loader-4-line print-signup__spin' : 'ri-user-add-line'" aria-hidden="true" />
          <span>{{ loading ? '正在创建账号...' : '创建账号' }}</span>
        </button>

        <p v-if="message" :class="['print-signup__message', `print-signup__message--${messageStatus}`]" role="status">
          <i :class="messageStatus === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" aria-hidden="true" />
          <span>{{ message }}</span>
        </p>

        <div class="print-signup__signin">
          <span>已有账号？</span>
          <RouterLink to="/signin">
            返回登录
            <i class="ri-arrow-right-line" aria-hidden="true" />
          </RouterLink>
        </div>
      </div>

      <footer class="print-signup__footer">{{ SITE_NAME }} · 打印设计从这里开始</footer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { signUpSchema } from '~/schemas/auth';
import { SITE_NAME, SITE_SHORT_NAME } from '../config/site';

const auth = useAuth();
const loading = ref(false);
const message = ref('');
const messageStatus = ref<'success' | 'error'>('error');
const signupFormRef = ref<{
  validate: () => Promise<boolean>;
  snapshot: () => Record<string, unknown>;
} | null>(null);
const form = ref<Record<string, unknown>>({
  email: '',
  password: ''
});

async function submitSignupForm() {
  const signupForm = signupFormRef.value;
  if (!signupForm || loading.value) return;
  if (!(await signupForm.validate())) return;
  await handleSubmit(signupForm.snapshot());
}

async function handleSubmit(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  try {
    await auth.signUp({
      email: String(values.email),
      password: String(values.password)
    });
    message.value = '账号创建成功。如需验证，请前往邮箱完成确认。';
    messageStatus.value = 'success';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '注册失败，请稍后重试。';
    messageStatus.value = 'error';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.print-signup {
  --signup-workspace: #f5f7f9;
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(0, 1.25fr) minmax(430px, 0.75fr);
  background: var(--signup-workspace);
}

.print-signup__showcase {
  position: relative;
  display: grid;
  min-height: 100vh;
  align-content: center;
  overflow: hidden;
  padding: 7vh clamp(36px, 7vw, 110px);
  background: #12344b;
  color: #fff;
}

.print-signup__showcase::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgb(8 29 43 / 94%) 0%, rgb(15 53 75 / 78%) 48%, rgb(18 52 75 / 45%) 100%),
    url('/site/print-designer.png') center / cover;
  content: '';
  filter: saturate(0.75) contrast(1.05);
}

.print-signup__showcase::after {
  position: absolute;
  inset: auto 0 0;
  height: 34%;
  background: linear-gradient(0deg, rgb(5 24 36 / 92%), transparent);
  content: '';
}

.print-signup__showcase-copy,
.print-signup__preview {
  position: relative;
  z-index: 1;
}

.print-signup__showcase-copy {
  max-width: 660px;
}

.print-signup__product {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 70px;
  color: rgb(255 255 255 / 88%);
  font-size: 13px;
  font-weight: 700;
}

.print-signup__product-mark {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  background: #df493e;
  color: #fff;
  font-size: 17px;
}

.print-signup__eyebrow {
  margin: 0 0 12px;
  color: #81c9f1;
  font-size: 14px;
  font-weight: 700;
}

.print-signup__showcase h1 {
  margin: 0;
  font-size: 48px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.22;
}

.print-signup__lead {
  max-width: 42ch;
  margin: 24px 0 0;
  color: rgb(255 255 255 / 78%);
  font-size: 16px;
  line-height: 1.8;
}

.print-signup__features {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  margin-top: 36px;
  color: rgb(255 255 255 / 80%);
  font-size: 12px;
}

.print-signup__features span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.print-signup__features i {
  color: #89cef5;
  font-size: 17px;
}

.print-signup__preview {
  position: absolute;
  right: clamp(28px, 5vw, 80px);
  bottom: 36px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgb(255 255 255 / 58%);
  font-size: 11px;
}

.print-signup__preview i {
  font-size: 18px;
}

.print-signup__workspace {
  display: grid;
  min-height: 100vh;
  align-content: center;
  padding: 36px clamp(32px, 5vw, 76px);
  background: var(--signup-workspace);
}

.print-signup__panel {
  width: 100%;
  max-width: 440px;
  justify-self: center;
}

.print-signup__header {
  margin-bottom: 26px;
}

.print-signup__header p {
  margin: 0 0 5px;
  color: #667788;
  font-size: 12px;
}

.print-signup__header h2 {
  margin: 0;
  color: #172b3d;
  font-size: 29px;
  line-height: 1.2;
}

.print-signup__header span {
  display: block;
  margin-top: 9px;
  color: #71808f;
  font-size: 13px;
  line-height: 1.6;
}

.print-signup__panel :deep(.lc-form) {
  gap: 17px;
  background: transparent;
}

.print-signup__panel :deep(.lc-field) {
  gap: 7px;
}

.print-signup__panel :deep(.lc-field label) {
  color: #40566a;
  font-size: 12px;
  font-weight: 600;
}

.print-signup__panel :deep(.vxe-input) {
  height: 44px;
}

.print-signup__submit {
  display: flex;
  width: 100%;
  height: 43px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  border: 1px solid #176ea9;
  border-radius: 4px;
  background: #1778b9;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.print-signup__submit:hover:not(:disabled) {
  border-color: #12689f;
  background: #12689f;
}

.print-signup__submit:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.print-signup__spin {
  animation: print-signup-spin 0.8s linear infinite;
}

@keyframes print-signup-spin {
  to { transform: rotate(360deg); }
}

.print-signup__message {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 14px 0 0;
  padding: 10px 11px;
  border-left: 3px solid;
  font-size: 12px;
  line-height: 1.55;
}

.print-signup__message--success {
  border-color: #23845a;
  background: #eefaf4;
  color: #176a46;
}

.print-signup__message--error {
  border-color: #c3493c;
  background: #fff5f3;
  color: #a3382d;
}

.print-signup__signin {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 22px;
  color: #71808f;
  font-size: 12px;
}

.print-signup__signin a {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #176ea9;
  font-weight: 700;
  text-decoration: none;
}

.print-signup__signin a:hover {
  color: #105b8d;
}

.print-signup__footer {
  align-self: end;
  justify-self: center;
  margin-top: 38px;
  color: #91a0ad;
  font-size: 10px;
}

@media (max-width: 880px) {
  .print-signup {
    grid-template-columns: 1fr;
  }

  .print-signup__showcase {
    min-height: 210px;
    align-content: end;
    padding: 26px 24px;
  }

  .print-signup__product {
    margin-bottom: 24px;
  }

  .print-signup__showcase h1 {
    font-size: 32px;
  }

  .print-signup__lead,
  .print-signup__features,
  .print-signup__preview {
    display: none;
  }

  .print-signup__workspace {
    min-height: calc(100vh - 210px);
    align-content: start;
    padding: 32px 20px 22px;
  }
}

@media (max-width: 520px) {
  .print-signup__showcase {
    min-height: 164px;
    padding: 20px;
  }

  .print-signup__product {
    margin-bottom: 16px;
  }

  .print-signup__showcase h1 {
    font-size: 26px;
  }

  .print-signup__eyebrow {
    font-size: 12px;
  }

  .print-signup__workspace {
    min-height: calc(100vh - 164px);
    padding: 26px 16px 18px;
  }

  .print-signup__header h2 {
    font-size: 25px;
  }
}
</style>
