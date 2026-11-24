import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm, readdir } from 'node:fs/promises';
import { deflateSync, deflateRawSync } from 'node:zlib';
import metadata from './package.json' with { type: 'json' };

// Build config and both manifests live here. No framework, runtime dependencies, or background script.
const manifest = {
  manifest_version: 3, name: 're-hashword', version: metadata.version,
  description: 'Recreate your original Hashword passwords from your master password and site settings. Works offline.',
  action: { default_title: 're-hashword', default_popup: 'app.html?popup', default_icon: { '32': 'icon32.png' } },
  icons: { '32': 'icon32.png', '128': 'icon128.png' },
  options_ui: { page: 'app.html', open_in_tab: true },
  permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite'],
  commands: { _execute_action: { suggested_key: { default: 'Ctrl+Shift+H', mac: 'Command+Shift+H' } } },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'" },
};

// Tiny original raster icon, generated here to avoid binary source assets or image dependencies.
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function icon(size: number): Buffer {
  // A small pixel-font "re" badge stays readable even in the 32px toolbar icon.
  const badgeText = ['00000000000', '00000000000', '10110001110', '11001010001', '10000011111', '10000010000', '10000001111'];
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const hash = (u > .22 && u < .78 && ((v > .35 && v < .43) || (v > .57 && v < .65))) ||
      (v > .2 && v < .8 && ((u + v * .12 > .38 && u + v * .12 < .46) || (u + v * .12 > .59 && u + v * .12 < .67)));
    const badge = u >= .50 && v <= .38 && ((u - .75) ** 2 / .25 ** 2 + (v - .19) ** 2 / .19 ** 2 <= 1);
    const bx = Math.floor((u - .54) / .038), by = Math.floor((v - .015) / .045);
    const letter = badge && badgeText[by]?.[bx] === '1';
    rows.set(letter ? [24, 58, 110, 255] : badge ? [206, 229, 255, 255] : hash ? [236, 245, 255, 255] : [37, 83, 164, 255], y * (size * 4 + 1) + 1 + x * 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const appHTML = (await readFile('src/app.html', 'utf8'))
  .replace('src="../dist/recovery/app.js"', 'src="app.js"');
await rm('dist', { recursive: true, force: true });
for (const target of ['chrome', 'firefox', 'recovery']) {
  const dir = `dist/${target}`; await mkdir(dir, { recursive: true });
  await build({ entryPoints: ['src/app.ts'], outfile: `${dir}/app.js`, bundle: true, format: 'iife', target: ['chrome120', 'firefox140'], legalComments: 'none' });
  await writeFile(`${dir}/app.html`, appHTML);
  await copyFile('src/app.css', `${dir}/app.css`);
  await copyFile('LICENSE', `${dir}/LICENSE`);
  if (target !== 'recovery') {
    const extra = target === 'chrome' ? { minimum_chrome_version: '120' } : {
      browser_specific_settings: {
        gecko: { id: 'hashword@hashword.local', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
        gecko_android: { strict_min_version: '142.0' },
      },
    };
    await writeFile(`${dir}/manifest.json`, JSON.stringify({ ...manifest, ...extra }, null, 2) + '\n');
    for (const size of [32, 128]) await writeFile(`${dir}/icon${size}.png`, icon(size));
  } else {
    // A single self-contained recovery file works from disk without a browser extension or server.
    const css = await readFile('src/app.css', 'utf8');
    const js = await readFile(`${dir}/app.js`, 'utf8');
    const html = appHTML
      .replace('<link rel="stylesheet" href="app.css">', () => `<style>${css}</style>`)
      .replace('<script defer src="app.js"></script>', '')
      .replace('</body>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script></body>`);
    await writeFile('dist/hashword-recovery.html', html);
  }
}

// Deterministic ZIP32 archives (UTF-8 names, fixed 1980-01-01 timestamps).
// Only explicitly selected files are packaged; no Git history, credentials or node_modules.
async function archive(destination: string, entries: { path: string; name: string }[]): Promise<void> {
  const files: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const data = await readFile(entry.path), compressed = deflateRawSync(data), name = Buffer.from(entry.name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    files.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  await writeFile(destination, Buffer.concat([...files, central, end]));
}
for (const browser of ['chrome', 'firefox']) {
  await archive(`dist/re-hashword-${browser}.zip`, (await readdir(`dist/${browser}`)).map(name => ({ path: `dist/${browser}/${name}`, name })));
}
const sourceFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'build.ts', 'README.md', 'LICENSE', 'flake.nix', 'flake.lock'];
async function includeSources(dir: string): Promise<void> {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${file.name}`;
    if (file.isDirectory()) await includeSources(path);
    else if (file.isFile()) sourceFiles.push(path);
  }
}
await includeSources('src'); await includeSources('tests');
await archive('dist/re-hashword-source.zip', sourceFiles.map(path => ({ path, name: path })));
console.log('Built Chrome/Firefox folders and ZIPs, reviewer source ZIP, and dist/hashword-recovery.html');
