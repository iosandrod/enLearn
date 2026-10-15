const VISITOR_ID_KEY = 'enlearn_visitor_id';
const SESSION_ID_KEY = 'enlearn_visitor_session_id';

function createUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (character) =>
    (Number(character) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(character) / 4).toString(16),
  );
}

function getOrCreateStorageId(storage: Storage, key: string) {
  const existing = storage.getItem(key)?.trim();
  if (existing) return existing;
  const value = createUuid();
  storage.setItem(key, value);
  return value;
}

export function useVisitorTracking() {
  async function recordVisit(pagePath = window.location.pathname) {
    if (import.meta.server) return;

    const visitorId = getOrCreateStorageId(window.localStorage, VISITOR_ID_KEY);
    const sessionId = getOrCreateStorageId(window.sessionStorage, SESSION_ID_KEY);

    await $fetch('/api/visitor-records', {
      method: 'POST',
      body: {
        visitorId,
        sessionId,
        pagePath,
        pageUrl: window.location.href,
        referrer: document.referrer || null,
        language: navigator.language || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        screenWidth: window.screen?.width || null,
        screenHeight: window.screen?.height || null,
      },
    });
  }

  return { recordVisit };
}
