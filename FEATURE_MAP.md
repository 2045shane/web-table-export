# Feature map

Cut: `PLUGIN-PAYWALL-CUT-2026-10-29-v1`  
Audience: agents editing this repo. Read this before touching the popup, quotas, or license. User-facing detail stays in `README.md`.

This file is the UI and module map. It is not a second quota implementation. Numbers live only in `src/quota.js`.

## Product shape

Chrome MV3 extension. The toolbar popup (`src/popup.html`, title「导出」) is the only UI. There is no options page, no background quota service, and no side panel.

`src/popup.js` injects `src/parser.js` into the active tab and exports the rows that parser returns. Parsing rules are out of scope for the paywall cut. Do not add a second parser in the popup.

CSV (`src/csv.js`) and Excel (`src/xlsx.js`) are both available on the free tier. The paywall is a daily count plus a per-export row cap. It is not a format lock.

## Popup surfaces

Top to bottom in `src/popup.html`. Copy is filled from `src/i18n.js`. Chinese is the default (`#lang-zh` / `#lang-en`).

| Surface | DOM | What the user sees | Module |
| --- | --- | --- | --- |
| Daily line | `#quota-line` | Free: `每天 {limit} 次 · 今日剩余 {remaining}`. Paid: `已解锁 · 每天 {limit} 次 · 今日剩余 {remaining}`. `{limit}` is the active tier, from `peek().limit`. | `renderQuota` |
| Row cap | `#quota-rows` | Free: `免费单次最多 {maxRows} 行`. Paid: `本机无硬顶`, and the free numbers again. | `renderQuota` |
| Policy hint | `#quota-hint` | Local date reset. No server quota. | `renderQuota` |
| Hit-cap banner | `#cap-unlock` | Hidden until the day is used up. Then: remaining, 「有问题请联系我」, 小红书「珊哥爱读书」, and a pointer at the license field. | `renderQuota` |
| License | `#license-box` `#license-input` `#license-save` `#license-clear` `#license-state` | Always in the popup, directly under the quota card. On a used-up day the box gets `.attention`. | `renderLicense`, `applyLicense` |
| Status | `#status` | Scan errors, `quota-block`, `row-cap`, `invalid-license`, unlock, clear, download started. | `setStatusCode` |
| Table pick | `#tables` `#table-list` | One radio per visible table. Over the free row cap, the meta line adds `overCap`. | `renderTables` |
| Export | `#export-csv` `#export-xlsx` | Disabled unless `assessExport` returns ok. Both formats. | `exportAs` |
| Contact | `#cta` `.cta-strong` `.cta-contact` | Always visible: 「有问题请联系我」 and 小红书私信「珊哥爱读书」. `.hot` when the day is used up. | `renderQuota` |

`#cap-unlock` and `#cta` are the hit-cap contact. Do not remove either, and do not hide `#license-input` when the day is used up.

## Modules

| File | Owns | Do not |
| --- | --- | --- |
| `src/quota.js` | Named limits, `licenseNote` validation, `peek`, `assessExport`, `consumeExport`, `saveLicense` | Re-declare the same numbers in the popup or in i18n |
| `src/i18n.js` | zh/en templates with `{limit}`, `{remaining}`, `{maxRows}` | Hard-code `3` or `100` into those templates |
| `src/popup.js` | Scan, render, license form, download | Slice `table.rows` to the cap. Branch CSV vs Excel on `unlocked` |
| `src/parser.js` | `visible-table-v1` only | Row caps, licenses, or paywall copy |
| `src/csv.js` `src/xlsx.js` | Full-file builders. Empty input throws `no-rows` | Quota checks |
| `scripts/check-paywall-invariants.mjs` | CI/lint gate for the regressions below | Soften it into a comment |
| `test/quota.test.js` `test/popup-quota.test.js` `test/static.test.js` | Behavior and copy locks | Delete the licenseNote cases to “simplify” |

Storage key: `web-table-export.v1` in the popup page’s `localStorage` (no `storage` permission). Shape: `{ date, count, licenseNote }`. `date` is the local calendar day. A new day zeroes `count` and keeps `licenseNote`.

Language key, separate from quota: `web-table-export.lang`.

## Limits

Defined once, as assignments, in `src/quota.js`:

| Constant | Value | Tier |
| --- | --- | --- |
| `FREE_DAILY_EXPORT_LIMIT` | `3` | Free exports per local day |
| `FREE_EXPORT_MAX_ROWS` | `100` | Free rows in one export, inclusive |
| `PAID_DAILY_EXPORT_LIMIT` | `1000` | After a valid license. Very high, still counted on device |
| `PAID_EXPORT_MAX_ROWS` | `null` | After a valid license. `null` means no per-export row cap on this device |

`peek()` / `assessExport()` / `consumeExport()` all go through `tierOf(licenseNote)`. The popup reads `FREE_DAILY_EXPORT_LIMIT` and `FREE_EXPORT_MAX_ROWS` from that module; it does not assign them.

## licenseNote → real unlock

`licenseNote` is the stored license string. It used to be a no-op: `saveLicense` kept whatever text the user typed, and the daily limit never looked at it.

That path is gone. Current rule:

1. `tierOf` calls `isValidLicense(licenseNote)`.
2. `isValidLicense` is `normalizeLicense` (trim, strip whitespace, `WTE1.PAID.` + 8 hex FNV-1a of the body `WTE1.PAID`).
3. `saveLicense('')` or the Clear button writes `licenseNote: ''` and the device is free again.
4. `saveLicense` of anything that does not normalize writes `licenseNote: ''`, returns `error: 'invalid-license'`, and does not unlock. A previous good code is cleared too.
5. Only a normalized code is stored. `peek().unlocked` is then true, `limit` is `PAID_DAILY_EXPORT_LIMIT`, and `maxRows` is `null`.
6. Today’s `count` is not reset on unlock or on clear. After 3 free exports, a valid code makes a 4th export allowed (`remaining` becomes `1000 - count`). Clear after more than 3 exports shows remaining 0.

A text-only `licenseNote` (for example `CONTACT-珊哥爱读书`, or a checksum of `00000000`) does not unlock. Do not bring back “saved locally, not verified, no extra exports”.

Sample code the checker accepts: `WTE1.PAID.3c5a2030` (`buildLicense()`). It is a local checksum, not an API key and not a payment receipt.

## Export gate

`exportAs` must call `assessExport` and return before `buildCsv` / `buildXlsx` / `downloadBlob` when the gate fails.

| `assessExport` error | User-visible result | Count | File |
| --- | --- | --- | --- |
| `quota` | `#quota-line` remaining 0, `#cap-unlock` shown, export buttons off, status `quota-block` | unchanged | none |
| `row-cap` | Status names the real row count and `FREE_EXPORT_MAX_ROWS`. Buttons off | unchanged | none. Do not download a shortened table |
| `no-data-rows` | Existing empty-table error | unchanged | none |
| ok | Then `consumeExport`, then download the **full** `table.rows` | +1 | CSV or xlsx |

Failed builds (`export-failed`) do not consume. A second check of `consumeExport` after a successful build still refuses the download if the day was used up in between.

## Checks

`npm test` runs, in order:

1. `node scripts/check-paywall-invariants.mjs` (`npm run lint`)
2. `node --test test/*.test.js`

The lint script fails the process if the free daily assignment is not the single `= 3`, if `saveLicense` stores raw text again, if `tierOf` stops calling `isValidLicense`, if a plain note unlocks or a valid code does not, if `exportAs` slices rows or skips `assessExport`, or if `src/` picks up a payment SDK or an API-key shape. `.github/workflows/ci.yml` runs `npm test` on push and pull request.

Popup behavior covering the same rules is in `test/popup-quota.test.js` (jsdom loads the real `src/popup.html` and scripts).
