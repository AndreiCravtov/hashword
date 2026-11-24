import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveHashword, getHashword, algorithmForLength, validateSettings, type Settings } from '../src/hashword.ts';
import { readSettings, parseBackup, backupJSON } from '../src/storage.ts';

const reference = JSON.parse(readFileSync(new URL('./extended-vectors.json', import.meta.url), 'utf8')) as {
  vectors: { domain: string; master: string; settings: Settings; password: string }[];
};
test('extended-v1 matches 25 independently generated Python PBKDF2/HMAC reference outputs', async () => {
  for (const v of reference.vectors) assert.equal(await deriveHashword(v.domain, v.master, v.settings), v.password);
});
test('every supported length produces exactly that length with the requested character classes', async () => {
  for (let pwLength = 4; pwLength <= 128; pwLength++) {
    if (pwLength === 8 || pwLength === 16) continue;
    const symbols = pwLength % 2 === 1;
    const password = await deriveHashword('example.org', 'public test input', { algorithm: 'extended-v1', pwLength, symbols, generation: 3 });
    assert.equal(password.length, pwLength);
    assert.match(password, /[A-Z]/); assert.match(password, /[a-z]/); assert.match(password, /[0-9]/);
    assert.match(password, symbols ? /^[A-Za-z0-9!#+,\-./@]+$/ : /^[A-Za-z0-9]+$/);
    if (symbols) assert.match(password, /[!#+,\-./@]/);
  }
});
test('the async application path preserves every original reference password', async () => {
  const legacy = JSON.parse(readFileSync(new URL('./legacy-vectors.json', import.meta.url), 'utf8'));
  for (const v of legacy.passwords) {
    assert.equal(await deriveHashword(v.domain, v.master, v.settings), v.password);
    assert.equal(await deriveHashword(v.domain, v.master, { ...v.settings, algorithm: 'legacy-v1' }), v.password);
  }
});
test('length changes are independent passwords, and switching back restores the original', async () => {
  const s: Settings = { algorithm: 'extended-v1', pwLength: 17, symbols: true, generation: 1 };
  const seventeen = await deriveHashword('example.com', 'master', s);
  const eighteen = await deriveHashword('example.com', 'master', { ...s, pwLength: 18 });
  assert.notEqual(eighteen.slice(0, 17), seventeen);
  assert.equal(await deriveHashword('EXAMPLE.COM', 'master', s), seventeen);
  assert.notEqual(await deriveHashword('example.com', 'master', { ...s, generation: 2 }), seventeen);
  assert.notEqual(await deriveHashword('example.com', 'master', { ...s, symbols: false }), seventeen);
  const original = { pwLength: 16, symbols: true, generation: 1 };
  assert.equal(await deriveHashword('example.com', 'master', { ...s, pwLength: 16, algorithm: algorithmForLength(16) }), getHashword('example.com', 'master', original));
});
test('algorithm versions survive storage and backup round-trips; unknown versions fail closed', () => {
  const s: Settings = { algorithm: 'extended-v1', pwLength: 17, symbols: false, generation: 2, notes: 'Retain me', createDate: 0 };
  assert.deepEqual(readSettings(s), s);
  assert.deepEqual(parseBackup(backupJSON({ 'example.com': s }))['example.com'], s);
  for (const algorithm of ['future-v99', null, 1, {}]) assert.throws(() => readSettings({ ...s, algorithm }));
  assert.throws(() => readSettings({ ...s, algorithm: undefined }));
  assert.throws(() => getHashword('example.com', 'master', s));
  for (const pwLength of [0, 3, 8, 16, 129, 17.5, NaN, Infinity]) assert.throws(() => validateSettings({ ...s, pwLength }));
  for (const pwLength of [4, 7, 17, 128]) assert.equal(algorithmForLength(pwLength), 'extended-v1');
  for (const pwLength of [8, 16]) assert.equal(algorithmForLength(pwLength), undefined);
});
test('extended UTF-8 handling rejects malformed surrogates without normalization', async () => {
  await assert.rejects(deriveHashword('example.com', '\ud800', { algorithm: 'extended-v1', pwLength: 17, symbols: true, generation: 1 }), URIError);
});
