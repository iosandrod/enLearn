<template>
  <main class="auth-shell">
    <section class="auth-panel">
      <h1 class="page-title">Sign In</h1>
      <p class="page-description">
        Enter your email and password to access your account.
      </p>

      <LowCodeForm
        ref="loginFormRef"
        v-model="form"
        :schema="signInSchema"
        :loading="loading"
        @submit="handleSubmit"
      />

      <div class="stack" style="margin-top: 18px">
        <vxe-button status="primary" :loading="loading" @click="submitLoginForm">
          Sign in
        </vxe-button>
        <vxe-button :loading="loading" @click="handleGithub">
          Sign in with GitHub
        </vxe-button>
        <RouterLink class="muted" to="/signup">
          Do not have an account? Sign up
        </RouterLink>
      </div>

      <p v-if="message" class="lc-error">{{ message }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { signInSchema } from '~/schemas/auth';

const auth = useAuth();
const loading = ref(false);
const message = ref('');
const loginFormRef = ref<{ submit: () => void } | null>(null);
const form = ref<Record<string, unknown>>({
  email: '',
  password: ''
});

function submitLoginForm() {
  loginFormRef.value?.submit();
}

async function handleSubmit(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  try {
    await auth.signInWithPassword({
      email: String(values.email),
      password: String(values.password)
    });
    await navigateTo('/dashboard');
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'You could not be signed in.';
  } finally {
    loading.value = false;
  }
}

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
