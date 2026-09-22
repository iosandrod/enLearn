import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PROJECT_URL = process.env.SUPABASE_URL || 'https://bzidwylepgsxavvdtvvl.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASSWORD;
const ATTEMPTS = Number.parseInt(process.env.LOGIN_ATTEMPTS || '20', 10);
const TIMEOUT_MS = Number.parseInt(process.env.LOGIN_TIMEOUT_MS || '15000', 10);
const DELAY_MS = Number.parseInt(process.env.LOGIN_DELAY_MS || '250', 10);

function loadEnvFile(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

try {
  const root = resolve(import.meta.dirname, '..');
  await loadEnvFile(await readFile(resolve(root, 'api', '.env'), 'utf8'));
  await loadEnvFile(await readFile(resolve(root, '.env.local'), 'utf8'));
} catch {
  // Environment variables are sufficient when no local env file is available.
}

const supabaseUrl = process.env.SUPABASE_URL || PROJECT_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ANON_KEY;
const email = process.env.LOGIN_EMAIL || EMAIL;
const password = process.env.LOGIN_PASSWORD || PASSWORD;

if (!anonKey || !email || !password) {
  console.error('Missing required environment variables: LOGIN_EMAIL, LOGIN_PASSWORD, SUPABASE_ANON_KEY.');
  process.exitCode = 1;
} else if (!Number.isInteger(ATTEMPTS) || ATTEMPTS < 1) {
  console.error('LOGIN_ATTEMPTS must be a positive integer.');
  process.exitCode = 1;
} else {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`;
  let successCount = 0;
  let failureCount = 0;
  const failures = new Map();

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    let result;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          apikey: anonKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const payload = await response.json().catch(() => null);
      const ok = response.ok && Boolean(payload?.access_token);
      result = {
        ok,
        status: response.status,
        message: ok ? 'ok' : String(payload?.error_description ?? payload?.msg ?? payload?.message ?? response.statusText)
      };
    } catch (error) {
      result = {
        ok: false,
        status: 'network-error',
        message: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      };
    }

    if (result.ok) {
      successCount += 1;
    } else {
      failureCount += 1;
      const key = `${result.status} ${result.message}`;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }

    console.log(`#${attempt}/${ATTEMPTS} ${result.ok ? 'SUCCESS' : 'FAIL'} ${result.status} (${Date.now() - startedAt} ms)`);
    if (!result.ok) console.log(`  ${result.message}`);

    if (attempt < ATTEMPTS && DELAY_MS > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, DELAY_MS));
    }
  }

  console.log(`\nSummary: ${successCount}/${ATTEMPTS} succeeded; ${failureCount} failed.`);
  if (failures.size) {
    console.log('Failure groups:');
    for (const [message, count] of failures) console.log(`- ${count}x ${message}`);
  }
}
