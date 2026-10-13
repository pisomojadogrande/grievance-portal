import { createHash, randomBytes } from 'crypto';

export const CLI_KEY_PREFIX = 'cmp_';
export const DEFAULT_CLI_KEY_MAX_USES = 50;

export function generateCliApiKey(): string {
  return CLI_KEY_PREFIX + randomBytes(32).toString('base64url');
}

export function hashCliApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
