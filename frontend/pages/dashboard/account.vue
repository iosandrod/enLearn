<template>
  <section class="stack">
    <div class="two-column">
      <div class="content-panel">
        <h2 class="page-title">Personal Information</h2>
        <p class="page-description">Update your display name.</p>
        <LowCodeForm
          v-if="profileSchema"
          v-model="profileForm"
          :schema="profileSchema"
          :loading="loading || formDefinitionsLoading"
          @submit="saveProfile"
        />
      </div>

      <div class="content-panel">
        <h2 class="page-title">Email</h2>
        <p class="page-description">Email changes may require confirmation.</p>
        <LowCodeForm
          v-if="emailSchema"
          v-model="emailForm"
          :schema="emailSchema"
          :loading="loading || formDefinitionsLoading"
          @submit="saveEmail"
        />
      </div>
    </div>

    <div class="content-panel">
      <LowCodeGrid
        :schema="subscriptionGridSchema"
        :rows="subscriptionRows"
        :loading="loading"
      />
    </div>

    <p v-if="formDefinitionError" class="lc-error">{{ formDefinitionError }}</p>
    <p v-if="message" :class="messageClass">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';
import { subscriptionGridSchema } from '~/schemas/account';
import {
  loadLowCodeFormDefinitions,
  LOW_CODE_FORM_CODES,
} from '../../utils/lowCodeFormDefinitions';

const auth = useAuth();
const serviceApi = useServiceApi();
const loading = ref(false);
const formDefinitionsLoading = ref(true);
const formDefinitionError = ref('');
const profileSchema = shallowRef<LowCodeFormSchema | null>(null);
const emailSchema = shallowRef<LowCodeFormSchema | null>(null);
const message = ref('');
const messageClass = ref('lc-help');
const profileForm = ref<Record<string, unknown>>({ fullName: '' });
const emailForm = ref<Record<string, unknown>>({ email: '' });
const subscriptionRows = ref<Record<string, unknown>[]>([
  { label: 'Status', value: 'No active subscription' }
]);

async function loadAccountFormDefinitions() {
  formDefinitionsLoading.value = true;
  formDefinitionError.value = '';
  try {
    const definitions = await loadLowCodeFormDefinitions(serviceApi, [
      LOW_CODE_FORM_CODES.accountProfile,
      LOW_CODE_FORM_CODES.accountEmail,
    ]);
    profileSchema.value = definitions[LOW_CODE_FORM_CODES.accountProfile].schema;
    emailSchema.value = definitions[LOW_CODE_FORM_CODES.accountEmail].schema;
  } catch (error) {
    formDefinitionError.value =
      error instanceof Error ? error.message : 'Could not load account form definitions.';
  } finally {
    formDefinitionsLoading.value = false;
  }
}

async function loadAccount() {
  loading.value = true;

  try {
    await auth.init(true);
    const account = await serviceApi.firstItem<{
      user: {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
      };
      profile: Record<string, unknown> | null;
    }>('user', { itemType: 'me' });
    if (!account?.user) return;

    const user = account.user;

    emailForm.value = { email: user.email ?? '' };
    profileForm.value = {
      fullName: user.user_metadata?.full_name ?? ''
    };

    if (account.profile?.full_name) {
      profileForm.value = { fullName: String(account.profile.full_name) };
    }

    const subscription = await serviceApi.firstItem<{
      status?: string | null;
      current_period_end?: string | null;
      prices?: {
        unit_amount?: number | null;
        interval?: string | null;
        products?: {
          name?: string | null;
        } | null;
      } | null;
    }>('payment', { itemType: 'subscription' });

    if (subscription) {
      const productName =
        subscription.prices?.products?.name ?? 'Unknown plan';
      const amount = subscription.prices?.unit_amount
        ? `$${(subscription.prices.unit_amount / 100).toFixed(2)} / ${
            subscription.prices.interval ?? 'period'
          }`
        : 'N/A';

      subscriptionRows.value = [
        { label: 'Plan', value: productName },
        { label: 'Status', value: subscription.status ?? 'N/A' },
        { label: 'Amount', value: amount },
        {
          label: 'Next Renewal',
          value: subscription.current_period_end
            ? new Date(subscription.current_period_end).toLocaleDateString()
            : 'N/A'
        }
      ];
    }
  } finally {
    loading.value = false;
  }
}

async function saveProfile(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  try {
    const fullName = String(values.fullName ?? '');
    await serviceApi.invoke('user', 'updateProfile', { fullName });

    profileForm.value = { fullName };
    message.value = 'Name updated successfully.';
    messageClass.value = 'lc-help';
    await auth.init(true);
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Name could not be updated.';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

async function saveEmail(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  try {
    await serviceApi.invoke('user', 'updateEmail', {
      email: String(values.email)
    });
    message.value = 'Confirmation email sent if required.';
    messageClass.value = 'lc-help';
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Email could not be updated.';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void Promise.all([loadAccountFormDefinitions(), loadAccount()]);
});
</script>
