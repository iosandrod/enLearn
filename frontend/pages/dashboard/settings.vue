<template>
  <section class="content-panel">
    <h2 class="page-title">Settings</h2>
    <p class="page-description">
      Preferences are rendered from a schema object and saved to your account metadata.
    </p>

    <LowCodeForm
      v-if="settingsSchema"
      v-model="settingsForm"
      :schema="settingsSchema"
      :loading="loading || formDefinitionLoading"
      @submit="saveSettings"
    />

    <p v-if="formDefinitionError" class="lc-error">{{ formDefinitionError }}</p>
    <p v-if="message" :class="messageClass">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';
import {
  loadLowCodeFormDefinition,
  LOW_CODE_FORM_CODES,
} from '../../utils/lowCodeFormDefinitions';

const SETTINGS_STORAGE_KEY = 'hikari-dashboard-settings';
const auth = useAuth();
const serviceApi = useServiceApi();
const loading = ref(false);
const formDefinitionLoading = ref(true);
const formDefinitionError = ref('');
const settingsSchema = shallowRef<LowCodeFormSchema | null>(null);
const message = ref('');
const messageClass = ref('lc-help');
const settingsForm = ref<Record<string, unknown>>({
  notifyEverything: false,
  notifyAvailable: true,
  notifyIgnoring: true,
  language: 'en',
  theme: 'system',
  font: 'sans'
});

async function loadSettingsFormDefinition() {
  formDefinitionLoading.value = true;
  formDefinitionError.value = '';
  try {
    const definition = await loadLowCodeFormDefinition(
      serviceApi,
      LOW_CODE_FORM_CODES.dashboardSettings,
    );
    settingsSchema.value = definition.schema;
  } catch (error) {
    formDefinitionError.value =
      error instanceof Error ? error.message : 'Could not load the settings form definition.';
  } finally {
    formDefinitionLoading.value = false;
  }
}

function applyTheme(theme: unknown) {
  if (import.meta.server) return;
  document.documentElement.dataset.theme = String(theme);
}

async function loadSettings() {
  const cached = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

  if (cached) {
    try {
      settingsForm.value = { ...settingsForm.value, ...JSON.parse(cached) };
      applyTheme(settingsForm.value.theme);
      return;
    } catch {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    }
  }

  await auth.init(true);
  const saved = auth.user.value?.user_metadata?.dashboard_settings;

  if (saved && typeof saved === 'object') {
    const normalized = saved as Record<string, unknown>;
    settingsForm.value = {
      notifyEverything:
        normalized.notifyEverything ??
        (normalized.notifications as Record<string, unknown> | undefined)
          ?.everything ??
        false,
      notifyAvailable:
        normalized.notifyAvailable ??
        (normalized.notifications as Record<string, unknown> | undefined)
          ?.available ??
        true,
      notifyIgnoring:
        normalized.notifyIgnoring ??
        (normalized.notifications as Record<string, unknown> | undefined)
          ?.ignoring ??
        true,
      language: normalized.language ?? 'en',
      theme: normalized.theme ?? 'system',
      font: normalized.font ?? 'sans'
    };
    applyTheme(settingsForm.value.theme);
  }
}

async function saveSettings(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';
  settingsForm.value = { ...values };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(values));
  applyTheme(values.theme);

  try {
    await serviceApi.invoke('user', 'updateSettings', { settings: values });
    await auth.init(true);
    message.value = 'Settings saved successfully.';
    messageClass.value = 'lc-help';
  } catch (error) {
    message.value =
      error instanceof Error
        ? `Saved locally. Backend error: ${error.message}`
        : 'Saved locally. Backend could not be reached.';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void Promise.all([loadSettingsFormDefinition(), loadSettings()]);
});
</script>
