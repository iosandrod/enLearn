export const PENDING_SIGNUP_KEY = 'enlearn_pending_signup';

export type PendingSignup = {
  email: string;
  password: string;
  accountId: string;
};

export function readPendingSignup(): PendingSignup | null {
  if (import.meta.server) return null;

  try {
    const raw = window.sessionStorage.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingSignup>;
    if (!value.email || !value.password || !value.accountId) return null;
    return { email: value.email, password: value.password, accountId: value.accountId };
  } catch {
    return null;
  }
}

export function savePendingSignup(value: PendingSignup) {
  window.sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(value));
}

export function clearPendingSignup() {
  window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
}
