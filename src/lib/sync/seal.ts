import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Seals a small payload so the browser can hold it but only this server can read
 * or forge it (AES-256-GCM: encrypted and tamper-evident). Used for the trading
 * account reference, so Proof keeps no database of credentials. The trader's
 * password never comes back here at all, it goes once to the sync provider.
 */

function key(): Buffer {
  const secret = process.env.SYNC_SECRET;
  if (!secret || secret.length < 32) throw new Error('SYNC_SECRET must be set (32+ characters)');
  return createHash('sha256').update(secret).digest();
}

export function seal(payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function unseal<T>(token: string): T | null {
  try {
    const [iv, tag, body] = token.split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as T;
  } catch {
    return null;
  }
}

export const syncConfigured = () => !!process.env.METAAPI_TOKEN && (process.env.SYNC_SECRET?.length ?? 0) >= 32;
