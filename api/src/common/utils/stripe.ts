import Stripe from 'stripe';
import { getEnv } from './env';

let stripeClient: Stripe | null = null;
let stripeSecretKeyCache = '';

export function getStripeClient() {
  const env = getEnv();
  const stripeSecretKey = env.STRIPE_SECRET_KEY ?? env.STRIPE_SECRET_KEY_LIVE ?? '';

  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY.');
  }

  if (!stripeClient || stripeSecretKeyCache !== stripeSecretKey) {
    stripeSecretKeyCache = stripeSecretKey;
    stripeClient = new Stripe(stripeSecretKey, {
      appInfo: {
        name: 'Hikari Nest API',
        version: '1.0.0'
      }
    });
  }

  return stripeClient;
}

export function getAppUrl(path = '') {
  const env = getEnv();
  const baseUrl =
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    env.APP_URL?.trim() ||
    'http://localhost:3000';

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');

  return normalizedPath ? `${normalizedBase}/${normalizedPath}` : normalizedBase;
}

export function calculateTrialEndUnixTimestamp(
  trialPeriodDays: number | null | undefined
) {
  if (
    trialPeriodDays === null ||
    trialPeriodDays === undefined ||
    trialPeriodDays < 2
  ) {
    return undefined;
  }

  const currentDate = new Date();
  const trialEnd = new Date(
    currentDate.getTime() + (trialPeriodDays + 1) * 24 * 60 * 60 * 1000
  );

  return Math.floor(trialEnd.getTime() / 1000);
}
