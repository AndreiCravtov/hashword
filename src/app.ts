import { defaults, deriveHashword, algorithmForLength, type Settings } from './hashword.ts';
import { domainInfo } from './domains.ts';
import { backupJSON, parseBackup, readSettings, readSites, validateDomain, type Sites } from './storage.ts';
import { passwordField } from './fill.ts';

const api = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? globalThis.chrome;
const extension = !!api?.runtime?.id;
const popup = location.search.includes('popup');
document.body.classList.toggle('popup', popup);
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const domain = el<HTMLInputElement>('domain');
const master = el<HTMLInputElement>('master');
const length = el<HTMLInputElement>('length');
const lengthSlider = el<HTMLInputElement>('length-slider');
const generation = el<HTMLInputElement>('generation');
const symbols = el<HTMLInputElement>('symbols');
const notes = el<HTMLTextAreaElement>('notes');
const password = el<HTMLInputElement>('password');
let sites: Sites = Object.create(null);
let suggestions: string[] = [];
let activeTab: { id: number; url: string } | undefined;
let generated: { domain: string; settings: Settings; value: string } | undefined;
let clearTimer: ReturnType<typeof setTimeout> | undefined;
let busy = false;

function status(message: string, error = false): void {
  el('status').textContent = message;
  el('status').classList.toggle('error', error);
}
function clear(): void {
  generated = undefined;
  master.value = '';
  password.value = '';
  password.type = 'password';
  el('reveal').textContent = 'Show';
  el('reveal').setAttribute('aria-pressed', 'false');
  el('result').hidden = true;
  clearTimeout(clearTimer);
}
function invalidate(): void {
  clearTimeout(clearTimer);
  generated = undefined;
  password.value = '';
  password.type = 'password';
  el('reveal').textContent = 'Show';
  el('reveal').setAttribute('aria-pressed', 'false');
  el('result').hidden = true;
  if (master.value) clearTimer = setTimeout(() => { clear(); status('Master password cleared after one minute.'); }, 60_000);
}
function currentDomain(): string {
  const value = domain.value.toLowerCase();
  validateDomain(value);
  return value;
}
function settings(): Settings {
  return readSettings({ ...sites[currentDomain()], algorithm: algorithmForLength(length.valueAsNumber), pwLength: length.valueAsNumber, generation: generation.valueAsNumber, symbols: symbols.checked, notes: notes.value });
}
function describeLength(): void {
  const count = length.valueAsNumber;
  if (Number.isInteger(count) && count >= 4 && count <= 128) lengthSlider.value = String(count);
  el('length-help').textContent = count === 8 || count === 16
    ? 'Original Hashword algorithm — existing passwords stay the same.'
    : 'Extended algorithm · Keep an updated backup to recover these passwords.';
}
function loadSite(): void {
  clear();
  const s = sites[domain.value.toLowerCase()] ?? defaults;
  length.value = String(s.pwLength);
  describeLength();
  generation.value = String(s.generation);
  symbols.checked = s.symbols;
  notes.value = s.notes ?? '';
}
async function persist(key: string, value: Settings): Promise<void> {
  const saved = { ...value, createDate: value.createDate ?? Date.now() };
  if (extension) await api.storage.local.set({ [key]: saved });
  // The recovery page intentionally keeps metadata only in memory. Back up to retain it.
  sites[key] = saved;
  renderSites();
}
function date(value?: number): string { return value ? new Date(value).toLocaleDateString() : 'Unknown'; }
function renderSites(): void {
  el('domains').replaceChildren(...[...new Set([...suggestions, ...Object.keys(sites)])].sort().map(value => {
    const option = document.createElement('option'); option.value = value; return option;
  }));
  const query = el<HTMLInputElement>('search').value.toLowerCase();
  const rows = Object.entries(sites).filter(([key]) => key.includes(query)).sort(([a], [b]) => a.localeCompare(b)).map(([key, s]) => {
    const row = document.createElement('li');
    const label = document.createElement('span'); label.textContent = key;
    const dates = document.createElement('small'); dates.textContent = `Created: ${date(s.createDate)} · Last used: ${date(s.accessDate)}`; label.append(dates);
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.type = 'button'; edit.setAttribute('aria-label', 'Edit ' + key);
    edit.onclick = () => { if (busy) return; domain.value = key; loadSite(); domain.focus(); window.scrollTo(0, 0); };
    const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.type = 'button'; remove.setAttribute('aria-label', 'Delete ' + key);
    remove.onclick = () => run(async () => {
      if (!confirm(`Delete settings for ${key}? Keep a backup first: these settings are needed to recreate your password.`)) return;
      if (extension) await api.storage.local.remove(key);
      delete sites[key]; if (domain.value === key) loadSite(); renderSites(); status('Site removed.');
    });
    row.append(label, edit, remove); return row;
  });
  el('sites').replaceChildren(...rows);
  if (!rows.length) el('sites').textContent = 'No saved sites match.';
}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  el<HTMLFieldSetElement>('controls').disabled = true;
  try { await action(); }
  catch (error) { status(error instanceof Error ? error.message : String(error), true); }
  finally { busy = false; el<HTMLFieldSetElement>('controls').disabled = false; }
}

el<HTMLFormElement>('generator').onsubmit = event => {
  event.preventDefault();
  void run(async () => {
    const key = currentDomain();
    const s = settings();
    let value: string;
    status('Generating password…');
    try {
      const pending = deriveHashword(key, master.value, s);
      master.value = '';
      value = await pending;
    }
    finally { master.value = ''; }
    await persist(key, { ...s, accessDate: Date.now() });
    generated = { domain: key, settings: s, value };
    password.value = value;
    el('result').hidden = false;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { clear(); status('Password cleared after one minute.'); }, 60_000);
    status('Ready. Copy the password or fill the field you selected.');
  });
};
for (const input of [master, length, generation, symbols, notes]) input.addEventListener('input', invalidate);
length.addEventListener('input', describeLength);
lengthSlider.addEventListener('input', () => {
  length.value = lengthSlider.value;
  describeLength();
  invalidate();
});
domain.addEventListener('input', invalidate);
domain.addEventListener('change', loadSite);
el('clear').onclick = () => { clear(); status('Password cleared.'); master.focus(); };
el('reveal').onclick = () => {
  const show = password.type === 'password'; password.type = show ? 'text' : 'password';
  el('reveal').textContent = show ? 'Hide' : 'Show'; el('reveal').setAttribute('aria-pressed', String(show));
};
el('copy').onclick = () => run(async () => {
  if (!generated) throw new Error('Generate a password first.');
  await navigator.clipboard.writeText(generated.value);
  status('Copied. The clipboard keeps this password until you replace it.');
});
el('fill').onclick = () => run(async () => {
  if (!generated || !activeTab) throw new Error('Open re-hashword from a website to fill a password.');
  const tab = await api.tabs.get(activeTab.id);
  if (tab.url !== activeTab.url) throw new Error('The page changed. Reopen re-hashword on the intended page.');
  // Probe without sending any secret. Only the selected frame receives the derived password.
  const frames = await api.scripting.executeScript({ target: { tabId: activeTab.id, allFrames: true }, func: passwordField });
  const focused = frames.filter(frame => frame.result?.focused);
  if (focused.length !== 1) throw new Error('Focus one password field, then reopen re-hashword. You can also copy and paste.');
  const target = focused[0];
  const result = await api.scripting.executeScript({
    target: { tabId: activeTab.id, frameIds: [target.frameId] }, func: passwordField,
    args: [generated.value, target.result!.url],
  });
  if (!result[0]?.result?.filled) throw new Error('The field or page changed. Select the password field and try again.');
  clear(); status('Password filled.'); if (popup) window.close();
});
el('save').onclick = () => run(async () => { await persist(currentDomain(), settings()); status('Site settings saved.'); });
el('manage').onclick = () => run(async () => {
  if (popup && extension) await api.runtime.openOptionsPage();
  else { el('management').hidden = !el('management').hidden; renderSites(); }
});
el<HTMLInputElement>('search').oninput = renderSites;
el('backup').onclick = () => run(async () => {
  // Read fresh storage so backups also include changes made in another extension window.
  if (extension) sites = readSites(await api.storage.local.get(null));
  const url = URL.createObjectURL(new Blob([backupJSON(sites)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 're-hashword-site-list.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); renderSites(); status('Backup downloaded.');
});
el<HTMLInputElement>('restore').onchange = event => run(async () => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  if (file.size > 10_000_000) throw new Error('Backup is too large (limit 10 MB).');
  const imported = parseBackup(await file.text()); // Validate the entire file before any write.
  if (extension) sites = readSites(await api.storage.local.get(null));
  const conflicts = Object.keys(imported).filter(key => Object.hasOwn(sites, key));
  if (!confirm(`Restore ${Object.keys(imported).length} sites? This replaces settings for ${conflicts.length} existing sites. Other sites stay unchanged.`)) return;
  if (extension) await api.storage.local.set(imported);
  Object.assign(sites, imported); loadSite(); renderSites(); status('Backup restored.');
});
window.addEventListener('pagehide', clear);

async function init(): Promise<void> {
  if (extension) sites = readSites(await api.storage.local.get(null));
  if (popup && extension) {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    try {
      const info = domainInfo(tab?.url ?? '');
      suggestions = [info.domain, info.hostname];
      domain.value = Object.hasOwn(sites, info.hostname) ? info.hostname : info.domain;
      if (tab.id !== undefined) activeTab = { id: tab.id, url: tab.url! };
      el('context').textContent = `Website: ${info.hostname}`;
    } catch { el('context').textContent = 'This page cannot be filled. Enter a password domain to generate and copy.'; }
  } else {
    el('context').textContent = extension ? 'Generate passwords and manage your saved site settings.' : 'Offline recovery · Settings stay in memory. Download a backup before closing.';
    el('management').hidden = false;
  }
  el<HTMLButtonElement>('fill').disabled = !activeTab;
  loadSite(); renderSites(); el<HTMLFieldSetElement>('controls').disabled = false;
  el('startup-help').hidden = true;
  if (domain.value) master.focus(); else domain.focus();
}
void init().catch(error => { status('Could not load settings: ' + String(error), true); });
