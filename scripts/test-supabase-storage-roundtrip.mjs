import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function loadEnvFile(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Environment variables may be provided by the shell instead.
  }
}

await loadEnvFile(resolve(root, '.env.local'));
await loadEnvFile(resolve(root, 'api', '.env'));

const supabaseUrl = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/+$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.FILE_STORAGE_BUCKET || 'app-files';
const inputPath = process.argv[2] ? resolve(process.argv[2]) : null;
const storageBase = supabaseUrl ? `${supabaseUrl}/storage/v1` : null;
const execFileAsync = promisify(execFile);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const headers = {
  accept: 'application/json',
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
};

function encodeObjectPath(objectPath) {
  return objectPath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function assertResponse(response, operation) {
  const payload = await readResponse(response);
  if (!response.ok) {
    const message = typeof payload === 'string'
      ? payload
      : payload?.message || payload?.error || response.statusText;
    throw new Error(`${operation} failed (${response.status}): ${message}`);
  }
  return payload;
}

async function curlRequest(url, { method = 'GET', bodyPath, outputPath, signed = false } = {}) {
  const args = [
    '--silent', '--show-error', '--http1.1', '--retry', '2', '--retry-all-errors',
    '--request', method,
    ...(signed ? [] : [
      '--header', `apikey: ${serviceRoleKey}`,
      '--header', `Authorization: Bearer ${serviceRoleKey}`,
    ]),
    '--write-out', '__ENLEARN_STATUS__%{http_code}',
  ];
  if (bodyPath) args.push('--data-binary', `@${bodyPath}`);
  if (outputPath) args.push('--output', outputPath);
  args.push(url);

  let result;
  try {
    result = await execFileAsync(process.env.CURL_BIN || 'curl', args, {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr || '').trim()
      : '';
    throw new Error(stderr || 'curl request failed.');
  }
  const marker = '__ENLEARN_STATUS__';
  const markerIndex = result.stdout.lastIndexOf(marker);
  const status = Number(result.stdout.slice(markerIndex + marker.length));
  return {
    ok: status >= 200 && status < 300,
    status,
    body: markerIndex >= 0 ? result.stdout.slice(0, markerIndex) : result.stdout,
  };
}

async function requestJson(url, options, operation) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || AbortSignal.timeout(30_000),
    });
    return assertResponse(response, operation);
  } catch (error) {
    if (!(error instanceof TypeError) || !String(error.message).includes('fetch failed')) {
      throw error;
    }
    const fallback = await curlRequest(url, { method: options.method || 'GET' });
    if (!fallback.ok) {
      throw new Error(`${operation} failed (${fallback.status}): ${fallback.body}`);
    }
    try {
      return JSON.parse(fallback.body);
    } catch {
      return fallback.body;
    }
  }
}

const source = inputPath
  ? await readFile(inputPath)
  : Buffer.from(`Supabase storage round-trip test\n${new Date().toISOString()}\n`, 'utf8');
const objectPath = `codex-roundtrip/${process.pid}-${Date.now()}-${randomUUID()}.bin`;
const objectUrlPath = `${storageBase}/object/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`;
const digest = createHash('sha256').update(source).digest('hex');
let uploaded = false;
const sourcePath = resolve(tmpdir(), `enlearn-supabase-roundtrip-${randomUUID()}.bin`);
const downloadPath = resolve(tmpdir(), `enlearn-supabase-roundtrip-${randomUUID()}.download`);
await writeFile(sourcePath, source);

console.log(`Supabase: ${supabaseUrl}`);
console.log(`Bucket: ${bucket}`);
console.log(`Object: ${objectPath}`);
console.log(`Source bytes: ${source.length}`);
console.log(`Source SHA-256: ${digest}`);

try {
  const signPayload = await requestJson(
    `${storageBase}/object/upload/sign/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`,
    {
      method: 'POST',
      headers,
    },
    'Create signed upload URL',
  );
  if (!signPayload?.url) throw new Error('Supabase did not return a signed upload URL.');
  const signedUrl = new URL(
    signPayload.url.startsWith('/')
      ? `${storageBase}${signPayload.url}`
      : signPayload.url,
  );

  let uploadResponse;
  try {
    uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      body: source,
      signal: AbortSignal.timeout(120_000),
    });
    await assertResponse(uploadResponse, 'Upload file with signed URL');
  } catch (error) {
    if (!(error instanceof TypeError) || !String(error.message).includes('fetch failed')) throw error;
    const fallback = await curlRequest(signedUrl.toString(), {
      method: 'PUT',
      bodyPath: sourcePath,
      signed: true,
    });
    if (!fallback.ok) throw new Error(`Upload file with signed URL failed (${fallback.status}): ${fallback.body}`);
    uploadResponse = { status: fallback.status };
  }
  uploaded = true;
  console.log(`Upload: ${uploadResponse.status} OK`);

  let downloaded;
  let downloadStatus;
  try {
    const downloadResponse = await fetch(objectUrlPath, { headers, signal: AbortSignal.timeout(30_000) });
    if (!downloadResponse.ok) {
      throw new Error(`Download file failed (${downloadResponse.status}): ${await downloadResponse.text()}`);
    }
    downloaded = Buffer.from(await downloadResponse.arrayBuffer());
    downloadStatus = downloadResponse.status;
  } catch (error) {
    if (!(error instanceof TypeError) || !String(error.message).includes('fetch failed')) throw error;
    const fallback = await curlRequest(objectUrlPath, { outputPath: downloadPath });
    if (!fallback.ok) throw new Error(`Download file failed (${fallback.status}): ${fallback.body}`);
    downloaded = await readFile(downloadPath);
    downloadStatus = fallback.status;
  }
  const downloadedDigest = createHash('sha256').update(downloaded).digest('hex');
  const same = downloaded.length === source.length &&
    timingSafeEqual(downloaded, source);

  console.log(`Download: ${downloadStatus} OK (${downloaded.length} bytes)`);
  console.log(`Downloaded SHA-256: ${downloadedDigest}`);
  if (!same) throw new Error('Downloaded bytes do not match the uploaded file.');
  console.log('Round-trip verification: PASS');
} finally {
  if (uploaded) {
    try {
      const cleanupResponse = await curlRequest(objectUrlPath, { method: 'DELETE' });
      if (cleanupResponse.ok) {
        console.log('Cleanup: test object deleted');
      } else {
        console.warn(`Cleanup: failed (${cleanupResponse.status}): ${cleanupResponse.body}`);
      }
    } catch (error) {
      console.warn(`Cleanup: request failed; remove ${objectPath} manually if needed (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  await Promise.all([
    unlink(sourcePath).catch(() => undefined),
    unlink(downloadPath).catch(() => undefined),
  ]);
}
