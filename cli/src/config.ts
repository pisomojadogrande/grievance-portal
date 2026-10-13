import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_API_URL = 'https://o4mjau2wl3.execute-api.us-east-1.amazonaws.com/prod/';

export interface Config {
  apiKey?: string;
  apiUrl?: string;
}

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'complaints', 'config.json');
}

export function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function resolveApiUrl(flag?: string): string {
  const url = flag || process.env.COMPLAINTS_API_URL || loadConfig().apiUrl || DEFAULT_API_URL;
  return url.endsWith('/') ? url : url + '/';
}

export function resolveApiKey(): string | undefined {
  return process.env.COMPLAINTS_API_KEY || loadConfig().apiKey;
}
