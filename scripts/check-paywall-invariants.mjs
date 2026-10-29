/**
 * Hard gate for regressions that already shipped once:
 * a text-only licenseNote, a second copy of the daily number,
 * a silent row cut, or a format locked behind the license.
 *
 * npm test runs this before the node:test files. Exit 1 on failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function srcFiles() {
  const dir = path.join(root, 'src');
  return fs.readdirSync(dir).filter((name) => name.endsWith('.js') || name.endsWith('.html'));
}

function assignments(text, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*(\\d+)', 'g');
  return [...text.matchAll(re)].map((match) => match[1]);
}

const quotaSrc = read('src/quota.js');
const popupSrc = read('src/popup.js');
const daily = assignments(quotaSrc, 'FREE_DAILY_EXPORT_LIMIT');
if (daily.length !== 1 || daily[0] !== '3') {
  fail('FREE_DAILY_EXPORT_LIMIT must be assigned once in src/quota.js as 3, found ' + JSON.stringify(daily));
}
const freeRows = assignments(quotaSrc, 'FREE_EXPORT_MAX_ROWS');
if (freeRows.length !== 1 || freeRows[0] !== '100') {
  fail('FREE_EXPORT_MAX_ROWS must be assigned once as 100, found ' + JSON.stringify(freeRows));
}
const paidDaily = assignments(quotaSrc, 'PAID_DAILY_EXPORT_LIMIT');
if (paidDaily.length !== 1 || paidDaily[0] !== '1000') {
  fail('PAID_DAILY_EXPORT_LIMIT must be assigned once as 1000, found ' + JSON.stringify(paidDaily));
}
if (!quotaSrc.includes('PAID_EXPORT_MAX_ROWS = null')) {
  fail('PAID_EXPORT_MAX_ROWS must stay null (no per-export row cap on device)');
}
if (assignments(quotaSrc, 'PAID_EXPORT_MAX_ROWS').length !== 0) {
  fail('PAID_EXPORT_MAX_ROWS must not be assigned a number');
}

for (const name of srcFiles()) {
  if (name === 'quota.js') continue;
  const text = read(path.join('src', name));
  for (const constant of ['FREE_DAILY_EXPORT_LIMIT', 'FREE_EXPORT_MAX_ROWS', 'PAID_DAILY_EXPORT_LIMIT']) {
    const found = assignments(text, constant);
    if (found.length) fail(name + ' reassigns ' + constant + ' ' + JSON.stringify(found));
  }
}

const tierStart = quotaSrc.indexOf('function tierOf');
const tierEnd = quotaSrc.indexOf('function remainingOf');
const tierBody = quotaSrc.slice(tierStart, tierEnd);
if (!tierBody.includes('isValidLicense(licenseNote)')) {
  fail('tierOf must call isValidLicense(licenseNote); a stored note must not skip the check');
}

const saveStart = quotaSrc.indexOf('function saveLicense');
const saveEnd = quotaSrc.indexOf('var api');
const saveBody = quotaSrc.slice(saveStart, saveEnd);
if (!saveBody.includes('normalizeLicense')) {
  fail('saveLicense must validate with normalizeLicense before storing licenseNote');
}
if (saveBody.includes('licenseNote: text')) {
  fail('saveLicense still stores the raw text in licenseNote (no-op unlock)');
}

const bannedCopy = [
  'does not add exports',
  '不增加次数',
  '未核验',
  '许可码（占位）',
  'License code (stub)',
];
for (const name of srcFiles()) {
  const text = read(path.join('src', name));
  for (const phrase of bannedCopy) {
    if (text.includes(phrase)) fail(name + ' brought back stub copy: ' + phrase);
  }
}

const exportStart = popupSrc.indexOf('function exportAs');
const exportEnd = popupSrc.indexOf('function setLang');
const exportBody = popupSrc.slice(exportStart, exportEnd);
const assessAt = exportBody.indexOf('assessExport');
const downloadAt = exportBody.indexOf('downloadBlob(');
if (assessAt < 0 || downloadAt < 0 || assessAt > downloadAt) {
  fail('exportAs must call assessExport before downloadBlob');
}
if (!exportBody.includes('return;') || exportBody.indexOf('return;') > downloadAt) {
  fail('exportAs must return before download when assessExport fails');
}
if (!exportBody.includes('csvApi.buildCsv(table.columns, table.rows)')) {
  fail('CSV export must pass the full table.rows');
}
if (!exportBody.includes('xlsxApi.buildXlsx(table.columns, table.rows,')) {
  fail('Excel export must pass the full table.rows');
}
if (exportBody.includes('.slice') || exportBody.includes('unlocked')) {
  fail('exportAs must not slice rows and must not lock a format behind unlocked');
}
if (!popupSrc.includes("files: ['src/parser.js']")) {
  fail('popup must keep injecting src/parser.js and no second parser');
}

const html = read('src/popup.html');
for (const id of ['quota-line', 'quota-rows', 'cap-unlock', 'license-input', 'license-clear', 'export-csv', 'export-xlsx']) {
  if (!html.includes('id="' + id + '"')) fail('popup.html missing #' + id);
}
if (!html.includes('有问题请联系我') || !html.includes('珊哥爱读书')) {
  fail('popup.html must keep the contact CTA');
}
if (html.includes('license-box" hidden')) fail('license box must stay visible');

const secret = new RegExp(
  [
    'AIza[0-9A-Za-z_\\-]{10,}',
    'sk-' + 'ant-',
    'sk-' + 'proj-',
    'AKIA[0-9A-Z]{16}',
    'BEGIN (?:RSA |OPENSSH )?PRIVATE KEY',
    'stripe',
    'paypal',
    'lemonsqueezy',
    'paddle',
    'braintree',
  ].join('|'),
  'i'
);
for (const name of srcFiles()) {
  if (secret.test(read(path.join('src', name)))) fail(name + ' matched a key or payment SDK pattern');
}
const pkg = read('package.json');
if (secret.test(pkg)) fail('package.json matched a payment SDK pattern');
if (read('manifest.json').includes('host_permissions')) fail('manifest gained host_permissions');

const map = read('FEATURE_MAP.md');
for (const phrase of [
  'licenseNote',
  'isValidLicense',
  'text-only',
  'FREE_DAILY_EXPORT_LIMIT',
  'FREE_EXPORT_MAX_ROWS',
  'PAID_DAILY_EXPORT_LIMIT',
  'PAID_EXPORT_MAX_ROWS',
  'assessExport',
  'quota-line',
  'license-input',
  '有问题请联系我',
  'PLUGIN-PAYWALL-CUT-2026-10-29-v1',
]) {
  if (!map.includes(phrase)) fail('FEATURE_MAP.md missing ' + phrase);
}
if (!read('README.md').includes('FEATURE_MAP.md')) {
  fail('README.md must point at FEATURE_MAP.md');
}

const quota = require(path.join(root, 'src/quota.js'));
const memory = () => {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
};
const day = new Date(2026, 9, 29, 12, 0, 0);
const storage = memory();
for (let i = 0; i < 3; i++) quota.consumeExport(storage, day);
const note = quota.saveLicense(storage, day, 'CONTACT-珊哥爱读书');
if (note.ok || note.unlocked || quota.peek(storage, day).allowed || quota.peek(storage, day).unlocked) {
  fail('text-only licenseNote unlocked or still allowed a 4th free export');
}
const unlocked = quota.saveLicense(storage, day, quota.buildLicense());
const view = quota.peek(storage, day);
if (!unlocked.unlocked || !view.unlocked || view.limit !== 1000 || view.maxRows !== null) {
  fail('valid license did not raise the daily limit and drop the row cap');
}
if (!quota.consumeExport(storage, day).ok) fail('4th export after a valid license was blocked');
if (!quota.assessExport(storage, day, 101).ok) fail('paid tier still enforced the free row cap');
quota.saveLicense(storage, day, '   ');
const cleared = quota.peek(storage, day);
if (cleared.unlocked || cleared.limit !== 3 || cleared.maxRows !== 100 || cleared.remaining !== 0) {
  fail('clearing licenseNote did not return to the free tier');
}

if (failures.length) {
  for (const message of failures) console.error('paywall invariant: ' + message);
  process.exit(1);
}
console.log('paywall invariants ok');
