# re-hashword

A small, offline TypeScript rewrite of [Michael Meisel's Hashword](https://github.com/mmeisel/hashword), for Chrome and Firefox. No runtime dependencies, framework, background process, telemetry, or network requests. The original password derivation and domain rules are preserved.

## Build

```sh
nix develop
npm ci
npm run verify
```

Alternatively use Node 22.18+ (the Nix shell supplies Node 24). `npm run verify` type-checks, runs compatibility tests and builds all targets. `npm run build` only builds. Each build also creates `dist/re-hashword-chrome.zip`, `dist/re-hashword-firefox.zip`, and `dist/re-hashword-source.zip` for store uploads and reviewer source. Configuration is limited to `package.json`, `tsconfig.json` and `build.ts`, alongside the existing Nix setup. The build script contains both browser manifests; `package.json` is the single source of the release version.

## Install

**Chrome 120+ / Chromium:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chrome`. Keep this folder at a stable path. Pin re-hashword in the toolbar. Rebuild and click Reload there after changes.

**Firefox 140+:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Temporary installations disappear on browser restart; export your settings before removing one. For a permanent installation on normal Firefox, submit a ZIP of the contents of `dist/firefox` to Mozilla for **unlisted signing**, then install the signed XPI. Signing/publication has not been performed by this project. Branding does not change password algorithm identifiers or the backup format. The stable Firefox ID is `hashword@hashword.local`; choose your final ID before distributing it and retain it across releases.

Both browsers support the toolbar action shortcut, default **Ctrl+Shift+H** (Command+Shift+H on macOS); change it in the browser's extension shortcut settings if it conflicts.

## Bring your existing passwords across

1. In the old extension's Site List, export/download a JSON backup before removing it. A separately installed fork normally has a different extension ID and cannot read the old installation's storage.
2. Open the new extension's **Manage sites & backups**, then **Restore backup**. It reads the original `{ hashwordVersion, data: [{ domain, settings }] }` format. Restore validates every entry before writing anything and asks before replacing matching sites; other sites remain saved.
3. Check the displayed password domain, length, generation, symbols and notes against your old setup. Try a known account before relying on the rewrite. Do not share your master password with anyone to test it.

Length (any integer from 4 to 128), generation, symbols and notes are stored per domain, along with created/last-used dates and the algorithm version for extended lengths. Older string-valued lengths are migrated to numbers. The original flat `chrome.storage.local` layout remains compatible when updating an installation with the same ID. Backups contain settings and notes, never the master or generated password. Keep them private and make independent copies.

Use the slider or exact-number input to choose a length. **8 and 16 always use the original algorithm**, including after switching away and back. Other lengths use `extended-v1` and require re-hashword 1.1 or later, including its updated offline recovery file. Do not restore extended backups into the original extension. Longer/shorter extended outputs are independently derived, not prefixes of one fixed password. Very short passwords remain easy to guess regardless of the derivation algorithm.

The default is the original effective domain, unless you have saved settings for the full hostname. You can select either in the domain input, or enter the exact domain you previously used. **Changing any hashing setting or domain changes the password.** Generation is never advanced automatically; even historical zero, negative or fractional values are preserved.

Focus a website's password field, open re-hashword, enter your master password and press Enter. Then choose **Fill focused field** or **Copy**. Filling uses only the focused, writable password input, including accessible frames and open shadow roots. The website receives only the generated password. Restricted browser pages and inaccessible cross-origin frames may require copy/paste. re-hashword never submits a login form.

Use **Save settings** to save edits without generating a password. Generating also saves the selected settings. Edit/search/delete sites in the manager; deletion asks for confirmation because settings are needed to recover passwords.

## Independent offline recovery

For a browser preview, build first and open `dist/hashword-recovery.html`. Opening `src/app.html` also works after building; it loads the compiled recovery bundle from `dist/recovery/app.js`. Rebuild after editing TypeScript and reload the page. The extension itself must be loaded through the browser's extension manager as described above.

Keep `dist/hashword-recovery.html` and a site-list backup somewhere safe. This single self-contained file opens directly from disk in a modern browser, without installing an extension, running Node, or contacting a server. Restore your backup, enter/select the correct domain, and generate. This recovery page keeps site settings only in memory; download a backup before closing it. If clipboard access is unavailable, reveal and select the output to copy manually.

The master input is cleared when generation starts. Input and output are cleared after one minute of inactivity and when the page closes. JavaScript cannot guarantee erasure of all copies from memory. Copying puts the derived password on the system clipboard, where it stays until replaced. Notes are unencrypted; do not put master passwords in notes.

## Compatibility contract

The old `CryptoJS.SHA3` name is misleading here. Hashword uses **Keccak**, not NIST SHA-3, with output length `pwLength * 4` bits. For 8/16-character passwords those are 32/64-bit digests, with sponge capacity twice that length. A SHA3-256 or SHAKE substitution, or truncating a larger hash, would produce different passwords.

The exact input is UTF-8 of `master + '@' + domain.toLowerCase() + '+' + generation`. There is no trimming, Unicode normalization, salt, or added key stretching. Keccak uses the original `0x01 … 0x80` padding. Digest words are encoded with the original rotating character classes, number positioning and `!#+,-./@` symbol alphabet. Lone UTF-16 surrogates are rejected as in CryptoJS. The short digest and fast derivation are retained for recovery compatibility, not presented as a new password-hardening design.

`src/legacy-domains.json` is the frozen rule table extracted from the original `lib/tld.js`. Updating it to a modern public suffix list would change some existing passwords. `src/domains.ts` preserves its matching order and regex quirks. Each lookup behaves like a fresh original popup; the old library's accidental mutation of cached rules across multiple calls is not carried across lookups. Where the old popup threw (for example localhost), the full hostname is displayed explicitly instead.

`tests/legacy-vectors.json` records **648 password cases and 6,110 domain cases** generated by executing the original files at commit `dbbed2a02f5d8f6e0e4a2e19fe27d7ef0c2219a1`. They include both lengths, symbol modes, generations, Unicode, whitespace, long multi-block inputs, private suffixes, wildcard rules and exceptions. Every domain case uses a fresh copy of the original rule table. These expected values were captured before replacing the implementation; tests require neither Git history nor the old JS libraries. Additional tests cover backup validation and migration.

For an independent audit, extract `lib/sha3.js`, `src/common/hashword.js`, and `lib/tld.js` from that Git commit and compare `hw.getHashword()` and `tld.getDomain()` with the TypeScript equivalents using synthetic master passwords. Do not update reference outputs merely to make a changed implementation pass.

### Extended-v1 specification

This is a new, explicitly versioned derivation for lengths other than 8 and 16. It uses browser Web Crypto, works offline, and adds no runtime library. All parameters below are frozen: changing them requires a new algorithm version, never silently upgrading saved sites.

1. Encode the master password as UTF-8 without normalization or trimming; reject lone UTF-16 surrogates. The salt is UTF-8 of `JSON.stringify(['hashword', 'extended-v1', domain.toLowerCase(), generation, pwLength, symbols])`. The generation is a finite JavaScript number, length an integer from 4–128 excluding 8/16, and symbols a boolean.
2. Derive 32 bytes using PBKDF2-HMAC-SHA-256 with 600,000 iterations. Import those bytes as an HMAC-SHA-256 key.
3. Generate a byte stream by HMAC-signing UTF-8 of `JSON.stringify(['hashword', 'extended-v1', 'stream', counter])`, with counter starting at zero and increasing by one per block.
4. The alphabet is uppercase A–Z, lowercase a–z, digits 0–9, then `!#+,-./@` only when symbols are enabled. Discard bytes at or above `256 - (256 % alphabet.length)`; map accepted bytes using modulo the alphabet length.
5. Consume characters into candidates of exactly the selected length. Accept the first candidate containing uppercase, lowercase, digits, and a symbol if enabled. Reject a candidate missing a required class and continue from the next stream byte, without resetting the counter or skipping the rest of the block.

The version is saved as `algorithm: 'extended-v1'`. Missing versions mean legacy, not automatic inference from length; unknown versions and mismatched lengths are rejected. `tests/extended-vectors.json` contains 25 outputs computed independently using Python's standard-library PBKDF2/HMAC implementation, covering boundaries, 17 characters, both symbol modes, Unicode, whitespace and generations. Tests also exercise every supported length and all original reference outputs through the asynchronous application API.

## Publishing to the stores

Nothing is uploaded automatically. Start with `npm ci && npm run verify`. Keep the Firefox ID stable once distributed, and increment `package.json`'s version for each release. Give the fork a clearly distinguishable listing name and credit the original project; retaining its MIT notice is already handled by the build. Export your current settings before moving from a local installation to a store installation because their extension IDs/storage may differ.

### Chrome Web Store

1. [Register a developer account](https://developer.chrome.com/docs/webstore/register), pay Google's one-time registration fee and complete the dashboard's account/security requirements.
2. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), create a new item and upload **`dist/re-hashword-chrome.zip`**. The manifest is at the archive root.
3. Complete the listing, distribution and Privacy practices sections. Use `dist/chrome/icon128.png`, take screenshots with synthetic inputs, and prepare the required small promotional tile. Google's [image requirements](https://developer.chrome.com/docs/webstore/images) describe the supported sizes (128×128 icon, 1280×800 or 640×400 screenshots, and 440×280 small promotional image).
4. Describe the single purpose as generating deterministic site passwords locally. Justify `storage` for site metadata, `activeTab` for the selected tab URL and temporary page access, `scripting` for filling the focused password field, and `clipboardWrite` for the explicit Copy action. There is no remotely hosted code. Disclose local password and website-data processing accurately: **offline does not exempt an extension from privacy disclosure**. Publish a stable privacy-policy URL and put it in the dashboard. See Google's [user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
5. Submit for review and choose automatic or deferred publication. See the [publishing guide](https://developer.chrome.com/docs/webstore/publish). Subsequent releases update the same item with a higher version; do not create a new listing for each release.

### Firefox Add-ons (AMO)

1. Sign in with a Mozilla account at the [Add-ons Developer Hub](https://addons.mozilla.org/developers/), select **Submit a New Add-on**, and choose **On this site** for a public AMO listing. **On your own** is the alternative for a signed XPI you distribute privately.
2. Upload **`dist/re-hashword-firefox.zip`** and address validation findings. Supply the listing information, screenshots, support details and privacy information. The manifest already declares `data_collection_permissions.required: ['none']`; the extension sends no data to a developer-operated service.
3. Upload **`dist/re-hashword-source.zip`** as reviewer source: TypeScript and esbuild require this. Reviewer instructions: use Node 24, run `npm ci`, then `npm run build`, and compare `dist/firefox` with the submitted extension. No Nix installation or private dependencies are needed. `npm run verify` additionally runs the tests. See [source-code requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/).
4. Provide reviewer notes: no account/backend is required; generate with synthetic master `test master password` on `example.com`; 8/16 are legacy-compatible, other lengths use documented extended-v1; backup/restore contains only site metadata. Submit for review/signing following the [submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).

### Privacy-policy text to publish with your listing

re-hashword processes the master password and selected website domain locally to generate passwords. The master password and generated passwords are never saved by the extension or sent to its developer. When you choose Fill, only the generated password is written into the selected website's password field, where the website can read it. When you choose Copy, the generated password is placed on your system clipboard and remains there until replaced.

re-hashword stores site domains, length, generation, symbols, algorithm version, notes, and created/last-used dates in local browser extension storage. It accesses the active tab URL and the focused password field only for its password-generation/filling feature. It has no analytics, advertising, backend, or remote code, and does not sell or share data with the developer or third parties. Exported backups contain site metadata and notes; you control where they are saved and shared. Delete a site to remove its stored metadata, or uninstall the extension to remove its browser-managed local storage. Delete exported backups separately. The standalone recovery page keeps metadata only in memory until you export it.

Before publishing this text, add your publisher identity and a support/contact URL, host it at a stable public URL, and keep it aligned with future feature changes.

## Permissions and browser references

`storage` saves site metadata locally. `activeTab` grants access only when you invoke the extension. `scripting` fills the selected field, and `clipboardWrite` supports explicit copying. There are no persistent host permissions. The manifests use [Manifest V3 scripting](https://developer.chrome.com/docs/extensions/develop/migrate/api-calls) and Firefox's [no-data-collection declaration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).

The original MIT copyright notice is retained in `LICENSE`, followed by a separate 2026 notice for Andrei Cravtov. The domain table derives from the original tld.js bundle and its historical public suffix data; it is compatibility data, not a current registry of domain ownership.
