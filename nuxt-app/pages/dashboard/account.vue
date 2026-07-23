<template>
  <section class="stack">
    <div class="two-column">
      <div class="content-panel">
        <h2 class="page-title">Personal Information</h2>
        <p class="page-description">Update your display name.</p>
        <LowCodeForm
          v-model="profileForm"
          :schema="profileSchema"
          :loading="loading"
          @submit="saveProfile"
        />
      </div>

      <div class="content-panel">
        <h2 class="page-title">Email</h2>
        <p class="page-description">Supabase may require email confirmation.</p>
        <LowCodeForm
          v-model="emailForm"
          :schema="emailSchema"
          :loading="loading"
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

    <p v-if="message" :class="messageClass">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import {
  emailSchema,
  profileSchema,
  subscriptionGridSchema
} from '~/schemas/account';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const supabase = useAppSupabase();
const db: any = supabase;
const loading = ref(false);
const message = ref('');
const messageClass = ref('lc-help');
const profileForm = ref<Record<string, unknown>>({ fullName: '' });
const emailForm = ref<Record<string, unknown>>({ email: '' });
const subscriptionRows = ref<Record<string, unknown>[]>([
  { label: 'Status', value: 'No active subscription' }
]);

async function loadAccount() {
  loading.value = true;

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return;

    emailForm.value = { email: user.email ?? '' };
    profileForm.value = {
      fullName: user.user_metadata?.full_name ?? ''
    };

    const { data: details } = await db
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (details?.full_name) {
      profileForm.value = { fullName: details.full_name };
    }

    const { data: subscription } = await db
      .from('subscriptions')
      .select('*, prices (*, products (*))')
      .eq('user_id', user.id)
      .in('status', ['trialing', 'active'])
      .maybeSingle();

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
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error('Authentication required');

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: fullName }
    });

    if (authError) throw authError;

    await db
      .from('users')
      .update({ full_name: fullName })
      .eq('id', user.id);

    profileForm.value = { fullName };
    message.value = 'Name updated successfully.';
    messageClass.value = 'lc-help';
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
    const { error } = await supabase.auth.updateUser({
      email: String(values.email)
    });

    if (error) throw error;
    message.value = 'Confirmation email sent if Supabase requires it.';
    messageClass.value = 'lc-help';
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Email could not be updated.';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

onMounted(loadAccount);
</script>
