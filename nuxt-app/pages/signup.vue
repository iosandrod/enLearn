<template>
  <main class="auth-shell">
    <section class="auth-panel">
      <h1 class="page-title">Create Account</h1>
      <p class="page-description">
        Register with email and password.
      </p>

      <LowCodeForm
        v-model="form"
        :schema="signUpSchema"
        :loading="loading"
        @submit="handleSubmit"
      />

      <NuxtLink class="muted" style="display: block; margin-top: 18px" to="/signin">
        Already have an account? Sign in
      </NuxtLink>

      <p v-if="message" :class="messageStatus">{{ message }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { signUpSchema } from '~/schemas/auth';

definePageMeta({ middleware: 'guest', layout: false });

const auth = useAuth();
const loading = ref(false);
const message = ref('');
const messageStatus = ref('lc-error');
const form = ref<Record<string, unknown>>({
  email: '',
  password: ''
});

async function handleSubmit(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  try {
    await auth.signUp({
      email: String(values.email),
      password: String(values.password)
    });
    message.value = 'Account created. Check your email if confirmation is required.';
    messageStatus.value = 'lc-help';
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'You could not be signed up.';
    messageStatus.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}
</script>
