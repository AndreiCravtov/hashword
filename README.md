# Hashword

A small, offline TypeScript rewrite of [Michael Meisel's Hashword](https://github.com/mmeisel/hashword), for Chrome and Firefox. No runtime dependencies, framework, background process, telemetry, or network requests. The original password derivation and domain rules are preserved.

## Build

```sh
nix develop
npm ci
npm run verify
```

Alternatively use Node 22.18+ (the Nix shell supplies Node 24). `npm run verify` type-checks, runs compatibility tests and builds all targets. `npm run build` only builds. Configuration is limited to `package.json`, `tsconfig.json` and `build.ts`, alongside the existing Nix setup. The build script contains both browser manifests.

## Install

**Chrome 120+ / Chromium:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chrome`. Keep this folder at a stable path. Pin Hashword in the toolbar. Rebuild and click Reload there after changes.

**Firefox 140+:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Temporary installations disappear on browser restart; export your settings before removing one. For a permanent installation on normal Firefox, submit a ZIP of the contents of `dist/firefox` to Mozilla for **unlisted signing**, then install the signed XPI. Signing/publication has not been performed by this project. The stable Firefox ID is `hashword@hashword.local`; choose your final ID before distributing it and retain it across releases.

Both browsers support the toolbar action shortcut, default **Ctrl+Shift+H** (Command+Shift+H on macOS); change it in the browser's extension shortcut settings if it conflicts.

## Bring your existing passwords across

1. In the old extension's Site List, export/download a JSON backup before removing it. A separately installed fork normally has a different extension ID and cannot read the old installation's storage.
2. Open the new extension's **Manage sites & backups**, then **Restore backup**. It reads the original `{ hashwordVersion, data: [{ domain, settings }] }` format. Restore validates every entry before writing anything and asks before replacing matching sites; other sites remain saved.
3. Check the displayed password domain, length, generation, symbols and notes against your old setup. Try a known account before relying on the rewrite. Do not share your master password with anyone to test it.

Length (8 or 16), generation, symbols and notes are stored per domain, along with created/last-used dates. Older string-valued lengths are migrated to numbers. The original flat `chrome.storage.local` layout remains compatible when updating an installation with the same ID. Backups contain settings and notes, never the master or generated password. Keep them private and make independent copies.

The default is the original effective domain, unless you have saved settings for the full hostname. You can select either in the domain input, or enter the exact domain you previously used. **Changing any hashing setting or domain changes the password.** Generation is never advanced automatically; even historical zero, negative or fractional values are preserved.

Focus a website's password field, open Hashword, enter your master password and press Enter. Then choose **Fill focused field** or **Copy**. Filling uses only the focused, writable password input, including accessible frames and open shadow roots. The website receives only the generated password. Restricted browser pages and inaccessible cross-origin frames may require copy/paste. Hashword never submits a login form.

Use **Save settings** to save edits without generating a password. Generating also saves the selected settings. Edit/search/delete sites in the manager; deletion asks for confirmation because settings are needed to recover passwords.

## Independent offline recovery

Keep `dist/hashword-recovery.html` and a site-list backup somewhere safe. This single self-contained file opens directly from disk in a modern browser, without installing an extension, running Node, or contacting a server. Restore your backup, enter/select the correct domain, and generate. This recovery page keeps site settings only in memory; download a backup before closing it. If clipboard access is unavailable, reveal and select the output to copy manually.

The master input is cleared immediately after derivation. Input and output are cleared after one minute of inactivity and when the page closes. JavaScript cannot guarantee erasure of all copies from memory. Copying puts the derived password on the system clipboard, where it stays until replaced. Notes are unencrypted; do not put master passwords in notes.

## Compatibility contract

The old `CryptoJS.SHA3` name is misleading here. Hashword uses **Keccak**, not NIST SHA-3, with output length `pwLength * 4` bits. For 8/16-character passwords those are 32/64-bit digests, with sponge capacity twice that length. A SHA3-256 or SHAKE substitution, or truncating a larger hash, would produce different passwords.

The exact input is UTF-8 of `master + '@' + domain.toLowerCase() + '+' + generation`. There is no trimming, Unicode normalization, salt, or added key stretching. Keccak uses the original `0x01 … 0x80` padding. Digest words are encoded with the original rotating character classes, number positioning and `!#+,-./@` symbol alphabet. Lone UTF-16 surrogates are rejected as in CryptoJS. The short digest and fast derivation are retained for recovery compatibility, not presented as a new password-hardening design.

`src/legacy-domains.json` is the frozen rule table extracted from the original `lib/tld.js`. Updating it to a modern public suffix list would change some existing passwords. `src/domains.ts` preserves its matching order and regex quirks. Each lookup behaves like a fresh original popup; the old library's accidental mutation of cached rules across multiple calls is not carried across lookups. Where the old popup threw (for example localhost), the full hostname is displayed explicitly instead.

`tests/legacy-vectors.json` records **648 password cases and 6,110 domain cases** generated by executing the original files at commit `dbbed2a02f5d8f6e0e4a2e19fe27d7ef0c2219a1`. They include both lengths, symbol modes, generations, Unicode, whitespace, long multi-block inputs, private suffixes, wildcard rules and exceptions. Every domain case uses a fresh copy of the original rule table. These expected values were captured before replacing the implementation; tests require neither Git history nor the old JS libraries. Additional tests cover backup validation and migration.

For an independent audit, extract `lib/sha3.js`, `src/common/hashword.js`, and `lib/tld.js` from that Git commit and compare `hw.getHashword()` and `tld.getDomain()` with the TypeScript equivalents using synthetic master passwords. Do not update reference outputs merely to make a changed implementation pass.

## Permissions and browser references

`storage` saves site metadata locally. `activeTab` grants access only when you invoke the extension. `scripting` fills the selected field, and `clipboardWrite` supports explicit copying. There are no persistent host permissions. The manifests use [Manifest V3 scripting](https://developer.chrome.com/docs/extensions/develop/migrate/api-calls) and Firefox's [no-data-collection declaration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).

The MIT copyright notice is retained in `LICENSE`. The domain table derives from the original tld.js bundle and its historical public suffix data; it is compatibility data, not a current registry of domain ownership.
