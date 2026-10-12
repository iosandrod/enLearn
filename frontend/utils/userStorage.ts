const USER_STORAGE_KEYS = new Set([
  'enlearn_access_token',
  'enlearn_refresh_token',
  'enlearn_active_account_id',
  'enlearn_dev_test_user',
  'enlearn_login_account_set_id',
  'hikari-dashboard-settings',
  'tldraw-vue.templates.v1',
  'PAGE_DATA_KEY',
]);

const USER_STORAGE_PREFIXES = [
  'enlearn.workflow.designer.',
  'enlearn.trigger-workflow-editor.',
];

export function clearUserLocalStorage(storage: Storage) {
  // Snapshot keys before deleting: removals shift Storage's numeric indexes.
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (key && (
      USER_STORAGE_KEYS.has(key) ||
      USER_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
    )) {
      storage.removeItem(key);
    }
  }
  // Keep the explicitly remembered login name and device/UI preferences.
}
