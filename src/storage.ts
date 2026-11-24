import { validateSettings, type Settings } from './hashword.ts';

export type Sites = Record<string, Settings>;
export function validateDomain(domain: unknown): asserts domain is string {
  if (typeof domain !== 'string' || !domain || domain.length > 253 || /[\s/@\\]/.test(domain) ||
      ['__proto__', 'constructor', 'prototype'].includes(domain)) throw new Error('Enter a domain, without a URL, path, or spaces.');
}
export function readSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('Missing settings.');
  const raw = value as Record<string, unknown>;
  const result: Settings = {
    // Old releases sometimes saved length as a string. This is the original migration.
    pwLength: typeof raw.pwLength === 'string' ? Number(raw.pwLength) : raw.pwLength as number,
    symbols: raw.symbols as boolean,
    generation: raw.generation as number,
  };
  validateSettings(result);
  if (raw.notes !== undefined) {
    if (typeof raw.notes !== 'string') throw new Error('Invalid notes.');
    result.notes = raw.notes;
  }
  for (const key of ['createDate', 'accessDate'] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]) || raw[key] < 0) throw new Error('Invalid site date.');
      result[key] = raw[key];
    }
  }
  return result;
}

export function readSites(raw: Record<string, unknown>): Sites {
  const result: Sites = Object.create(null);
  for (const [domain, settings] of Object.entries(raw)) {
    validateDomain(domain);
    if (domain !== domain.toLowerCase()) throw new Error('Site domains must be lowercase: ' + domain);
    result[domain] = readSettings(settings);
  }
  return result;
}

export function parseBackup(text: string): Sites {
  const backup: unknown = JSON.parse(text);
  if (!backup || typeof backup !== 'object' || !('hashwordVersion' in backup) ||
      !('data' in backup) || !Array.isArray(backup.data) || typeof backup.hashwordVersion !== 'string') {
    throw new Error('This is not a Hashword site-list backup.');
  }
  const result: Sites = Object.create(null);
  for (const row of backup.data) {
    if (!row || typeof row !== 'object') throw new Error('Invalid site entry.');
    validateDomain(row.domain);
    const domain = row.domain.toLowerCase();
    if (Object.hasOwn(result, domain)) throw new Error('Duplicate site: ' + domain);
    result[domain] = readSettings(row.settings);
  }
  return result;
}

export function backupJSON(sites: Sites): string {
  return JSON.stringify({ hashwordVersion: '1.0.0', data: Object.entries(readSites(sites)).map(([domain, settings]) => ({ domain, settings })) }, null, 2);
}
