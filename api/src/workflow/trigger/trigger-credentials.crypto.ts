import crypto from 'node:crypto';

export type PersonalAccessTokenRow = {
  encryptedToken: unknown;
  hashedToken: string;
  id: string;
  name: string;
};

export function decryptPersonalAccessToken(row: PersonalAccessTokenRow, key: string) {
  if (!isEncryptedToken(row.encryptedToken)) {
    throw new Error(`Trigger.dev PAT ${row.id} has invalid encrypted data.`);
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'utf8'),
    Buffer.from(row.encryptedToken.nonce, 'hex')
  );
  decipher.setAuthTag(Buffer.from(row.encryptedToken.tag, 'hex'));
  let token = decipher.update(row.encryptedToken.ciphertext, 'hex', 'utf8');
  token += decipher.final('utf8');

  if (!token.startsWith('tr_pat_') || hashToken(token) !== row.hashedToken) {
    throw new Error(`Trigger.dev PAT ${row.id} failed validation.`);
  }
  return token;
}

export function encryptToken(value: string, key: string) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), nonce);
  let ciphertext = cipher.update(value, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  return {
    nonce: nonce.toString('hex'),
    ciphertext,
    tag: cipher.getAuthTag().toString('hex')
  };
}

export function hashToken(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isEncryptedToken(
  value: unknown
): value is { nonce: string; ciphertext: string; tag: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).nonce === 'string' &&
    typeof (value as Record<string, unknown>).ciphertext === 'string' &&
    typeof (value as Record<string, unknown>).tag === 'string'
  );
}
