import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getHashword } from '../src/hashword.ts';
import { legacyDomain, domainInfo } from '../src/domains.ts';
import { backupJSON, parseBackup, readSites } from '../src/storage.ts';

const vectors = JSON.parse(readFileSync(new URL('./legacy-vectors.json', import.meta.url), 'utf8')) as {
  passwords: { domain: string; master: string; settings: { pwLength: number; generation: number; symbols: boolean }; password: string }[];
  domains: { host: string; domain: string | null }[];
};
test(`matches all ${vectors.passwords.length} outputs captured from the original CryptoJS 3.1.2 implementation`, () => {
  for (const v of vectors.passwords) {
    assert.equal(getHashword(v.domain, v.master, v.settings), v.password, JSON.stringify(v));
    assert.equal(v.password.length, v.settings.pwLength);
  }
});
test(`matches all ${vectors.domains.length} domain results captured from the original tld.js`, () => {
  for (const v of vectors.domains) assert.equal(legacyDomain(v.host), v.domain, v.host);
});
test('URL parsing preserves host behavior and fails clearly on restricted pages', () => {
  assert.deepEqual(domainInfo('https://LOGIN.Example.COM:443/account'), { hostname: 'login.example.com', domain: 'example.com' });
  assert.equal(domainInfo('https://bücher.de').hostname, 'xn--bcher-kva.de');
  assert.equal(domainInfo('http://localhost:3000').domain, 'localhost');
  assert.throws(() => domainInfo('chrome://extensions'));
  assert.throws(() => domainInfo('about:addons'));
});
test('lone surrogates are rejected like CryptoJS instead of silently changing a password', () => {
  assert.throws(() => getHashword('example.com', '\ud800', { pwLength: 16, symbols: true, generation: 1 }), URIError);
});
test('legacy backup survives restore/export with settings, notes and dates intact', () => {
  const legacy = { hashwordVersion: '0.6.3', data: [
    { domain: 'github.com', settings: { pwLength: '8', symbols: false, generation: 3, notes: 'Old account\nKeep this', createDate: 0, accessDate: 1660000000000 } },
    { domain: 'login.example.com', settings: { pwLength: 16, symbols: true, generation: -1 } },
  ] };
  const restored = parseBackup(JSON.stringify(legacy));
  assert.equal(restored['github.com'].pwLength, 8);
  assert.equal(restored['github.com'].notes, 'Old account\nKeep this');
  assert.equal(restored['github.com'].accessDate, 1660000000000);
  assert.deepEqual(parseBackup(backupJSON(restored)), restored);
});
test('invalid backups fail before any storage operation; secrets and unknown fields are never retained', () => {
  const backup = (domain: string, settings: unknown) => JSON.stringify({ hashwordVersion: '0.6.3', data: [{ domain, settings }] });
  const s = { pwLength: 16, symbols: true, generation: 1 };
  for (const domain of ['__proto__', 'constructor', 'prototype', 'https://example.com', ' example.com', '']) {
    assert.throws(() => parseBackup(backup(domain, s)));
  }
  for (const settings of [{ ...s, pwLength: 17 }, { ...s, symbols: 'false' }, { ...s, generation: null }, { ...s, notes: {} }]) {
    assert.throws(() => parseBackup(backup('example.com', settings)));
  }
  assert.throws(() => parseBackup('{invalid'));
  assert.throws(() => parseBackup(JSON.stringify({ data: [] })));
  assert.throws(() => parseBackup(JSON.stringify({ hashwordVersion: '0.6.3', data: [
    { domain: 'EXAMPLE.com', settings: s }, { domain: 'example.com', settings: s },
  ] })));
  const sites = parseBackup(backup('example.com', { ...s, masterPassword: 'never save me', password: 'or me' }));
  assert.deepEqual(sites['example.com'], s);
  assert.equal(Object.getPrototypeOf(readSites(sites)), null);
});
