import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// Build config and both manifests live here. No framework, runtime dependencies, or background script.
const manifest = {
  manifest_version: 3, name: 'Hashword', version: '1.0.0',
  description: 'Recreate your original Hashword passwords from your master password and site settings. Works offline.',
  action: { default_title: 'Hashword', default_popup: 'app.html?popup', default_icon: { '32': 'icon32.png' } },
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
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const hash = (u > .22 && u < .78 && ((v > .35 && v < .43) || (v > .57 && v < .65))) ||
      (v > .2 && v < .8 && ((u + v * .12 > .38 && u + v * .12 < .46) || (u + v * .12 > .59 && u + v * .12 < .67)));
    rows.set(hash ? [217, 255, 174, 255] : [23, 79, 67, 255], y * (size * 4 + 1) + 1 + x * 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

await rm('dist', { recursive: true, force: true });
for (const target of ['chrome', 'firefox', 'recovery']) {
  const dir = `dist/${target}`; await mkdir(dir, { recursive: true });
  await build({ entryPoints: ['src/app.ts'], outfile: `${dir}/app.js`, bundle: true, format: 'iife', target: ['chrome120', 'firefox140'], legalComments: 'none' });
  await copyFile('src/app.html', `${dir}/app.html`); await copyFile('src/app.css', `${dir}/app.css`);
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
    const html = (await readFile('src/app.html', 'utf8'))
      .replace('<link rel="stylesheet" href="app.css">', () => `<style>${css}</style>`)
      .replace('<script defer src="app.js"></script>', '')
      .replace('</body>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script></body>`);
    await writeFile('dist/hashword-recovery.html', html);
  }
}
console.log('Built dist/chrome, dist/firefox, and dist/hashword-recovery.html');
