const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function installClock(window, fixed) {
  const RealDate = window.Date;
  function FakeDate(...args) {
    if (!(this instanceof FakeDate)) {
      return args.length === 0 ? new RealDate(fixed.getTime()).toString() : RealDate(...args);
    }
    if (args.length === 0) return new RealDate(fixed.getTime());
    return new RealDate(...args);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixed.getTime();
  FakeDate.parse = RealDate.parse.bind(RealDate);
  FakeDate.UTC = RealDate.UTC.bind(RealDate);
  window.Date = FakeDate;
}

function loadPopup(now) {
  const html = fs.readFileSync(path.join(__dirname, '../src/popup.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://extension.local/popup.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  if (now) installClock(window, now);
  for (const file of ['quota.js', 'i18n.js', 'csv.js', 'xlsx.js', 'popup.js']) {
    window.eval(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'));
  }
  return window;
}

function text(window, id) {
  return window.document.getElementById(id).textContent;
}

function tablePayload(rowCount) {
  const rows = [];
  for (let i = 0; i < rowCount; i++) rows.push({ 订单号: String(1000 + i) });
  return {
    ok: true,
    tables: [{
      index: 1,
      label: '订单',
      source: 'html-table',
      columns: ['订单号'],
      rows: rows,
    }],
  };
}

function loadPopupWithTable(rowCount, now) {
  const html = fs.readFileSync(path.join(__dirname, '../src/popup.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://extension.local/popup.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  if (now) installClock(window, now);
  let calls = 0;
  window.chrome = {
    tabs: {
      query() {
        return Promise.resolve([{ id: 7, url: 'https://example.com/orders' }]);
      },
    },
    scripting: {
      executeScript() {
        calls += 1;
        if (calls === 1) return Promise.resolve([]);
        return Promise.resolve([{ result: tablePayload(rowCount) }]);
      },
    },
  };
  for (const file of ['quota.js', 'i18n.js', 'csv.js', 'xlsx.js', 'popup.js']) {
    window.eval(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'));
  }
  return window;
}

async function flush() {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

test('popup shows the free daily line, row cap, CTA, and license field', () => {
  const window = loadPopup();
  const quota = window.WebTableExportQuota;
  assert.match(text(window, 'quota-line'), /每天 3 次/);
  assert.match(text(window, 'quota-line'), /今日剩余 3/);
  assert.match(text(window, 'quota-rows'), /免费单次最多 100 行/);
  assert.equal(window.document.getElementById('cap-unlock').hidden, true);
  assert.equal(window.document.querySelector('.cta-strong').textContent, '有问题请联系我');
  assert.match(window.document.querySelector('.cta-contact').textContent, /珊哥爱读书/);
  const input = window.document.getElementById('license-input');
  assert.equal(input.hidden, false);
  assert.equal(window.document.getElementById('license-box').hidden, false);
  assert.equal(window.document.getElementById('export-csv').disabled, true);
  assert.equal(window.document.getElementById('export-xlsx').disabled, true);
  assert.equal(text(window, 'export-note').includes('CSV'), true);
  assert.equal(text(window, 'export-note').includes('Excel'), true);

  const downloads = [];
  window.URL.createObjectURL = () => {
    downloads.push('blob');
    return 'blob:preview';
  };
  window.document.getElementById('export-csv').disabled = false;
  window.document.getElementById('export-csv').click();
  assert.deepEqual(downloads, []);
  assert.equal(quota.peek(window.localStorage, new Date()).state.count, 0);
});

test('invalid license, unlock past the free cap, and clear all show in the popup', () => {
  const window = loadPopup();
  const document = window.document;
  const quota = window.WebTableExportQuota;
  const input = document.getElementById('license-input');
  const form = document.getElementById('license-form');

  input.value = 'not-a-license';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(text(window, 'status'), /许可码无效/);
  assert.match(text(window, 'status'), /免费档/);
  assert.match(text(window, 'quota-line'), /每天 3 次/);
  assert.match(text(window, 'quota-line'), /今日剩余 3/);
  assert.equal(quota.peek(window.localStorage, new Date()).unlocked, false);

  input.value = quota.buildLicense();
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(text(window, 'status'), /已解锁/);
  assert.match(text(window, 'quota-line'), /每天 1000 次/);
  assert.match(text(window, 'quota-line'), /今日剩余 1000/);
  assert.match(text(window, 'quota-rows'), /本机无硬顶/);
  assert.match(text(window, 'quota-rows'), /每天 3 次/);
  assert.equal(quota.peek(window.localStorage, new Date()).unlocked, true);

  for (let i = 0; i < 4; i++) quota.consumeExport(window.localStorage, new Date());
  document.getElementById('lang-zh').click();
  assert.match(text(window, 'quota-line'), /今日剩余 996/);
  assert.equal(document.getElementById('cta').classList.contains('hot'), false);

  document.getElementById('license-clear').click();
  assert.match(text(window, 'status'), /回到免费档/);
  assert.match(text(window, 'quota-line'), /每天 3 次/);
  assert.match(text(window, 'quota-line'), /今日剩余 0/);
  assert.equal(document.getElementById('cap-unlock').hidden, false);
  assert.match(text(window, 'cap-unlock'), /有问题请联系我/);
  assert.match(text(window, 'cap-unlock'), /珊哥爱读书/);
  assert.equal(document.getElementById('cta').classList.contains('hot'), true);
  assert.equal(document.getElementById('license-box').classList.contains('attention'), true);
  assert.equal(document.getElementById('license-input').hidden, false);
  assert.equal(quota.peek(window.localStorage, new Date()).unlocked, false);
  assert.equal(quota.peek(window.localStorage, new Date()).remaining, 0);

  document.getElementById('lang-en').click();
  assert.match(text(window, 'status'), /not valid|free tier|cleared/i);
  input.value = 'WTE1.PAID.00000000';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(text(window, 'status'), /not valid/i);
  assert.match(text(window, 'status'), /free tier/i);
  assert.match(text(window, 'quota-line'), /3 per day/);
  assert.match(text(window, 'quota-line'), /0 left today/);
});

test('a table over the free row cap does not download, and a license exports every row', async () => {
  const window = loadPopupWithTable(101);
  await flush();
  const document = window.document;
  const quota = window.WebTableExportQuota;
  const downloads = [];
  const blobs = [];
  const NativeBlob = window.Blob;
  window.Blob = function BlobSpy(parts, options) {
    blobs.push(parts && parts[0]);
    return new NativeBlob(parts, options);
  };
  window.URL.createObjectURL = () => {
    downloads.push('blob');
    return 'blob:preview';
  };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};

  assert.match(text(window, 'status'), /101 行/);
  assert.match(text(window, 'status'), /100/);
  assert.match(text(window, 'status'), /不会下载被截断的文件/);
  assert.equal(document.getElementById('export-csv').disabled, true);
  assert.equal(document.getElementById('export-xlsx').disabled, true);
  document.getElementById('export-csv').disabled = false;
  document.getElementById('export-csv').click();
  assert.deepEqual(downloads, []);
  assert.equal(blobs.length, 0);
  assert.equal(quota.peek(window.localStorage, new Date()).state.count, 0);

  document.getElementById('license-input').value = quota.buildLicense();
  document.getElementById('license-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(document.getElementById('export-csv').disabled, false);
  assert.equal(document.getElementById('export-xlsx').disabled, false);
  document.getElementById('export-csv').click();
  assert.equal(downloads.length, 1);
  assert.equal(quota.peek(window.localStorage, new Date()).state.count, 1);
  const csv = String(blobs[0]);
  assert.equal(csv.includes('1100'), true);
  assert.equal(csv.split('\n').length, 103);
  document.getElementById('export-xlsx').click();
  assert.equal(downloads.length, 2);
  assert.equal(quota.peek(window.localStorage, new Date()).state.count, 2);
  const bytes = blobs[1];
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
});

function spyDownloads(window) {
  const downloads = [];
  const blobs = [];
  const NativeBlob = window.Blob;
  window.Blob = function BlobSpy(parts, options) {
    blobs.push(parts && parts[0]);
    return new NativeBlob(parts, options);
  };
  window.URL.createObjectURL = () => {
    downloads.push('blob');
    return 'blob:preview';
  };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  return { downloads, blobs };
}

function submitLicense(window, value) {
  const document = window.document;
  document.getElementById('license-input').value = value;
  document.getElementById('license-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

test('S1 a current-month subscription shows 订阅至 YYYY-MM and exports over the free row cap', async () => {
  const now = new Date(2026, 10, 15, 12, 0, 0);
  const window = loadPopupWithTable(101, now);
  await flush();
  const document = window.document;
  const quota = window.WebTableExportQuota;
  const { downloads, blobs } = spyDownloads(window);

  assert.equal(document.getElementById('export-csv').disabled, true);
  assert.equal(text(window, 'tier-line'), '免费');
  document.getElementById('export-csv').disabled = false;
  document.getElementById('export-csv').click();
  assert.deepEqual(downloads, []);

  submitLicense(window, 'WTE2.SUB.202611.d5acd8e1');
  const view = quota.peek(window.localStorage, now);
  assert.equal(view.unlocked, true);
  assert.equal(view.tier, 'paid');
  assert.equal(view.limit, 1000);
  assert.equal(view.maxRows, null);
  assert.equal(view.subscriptionMonth, '2026-11');
  assert.equal(text(window, 'tier-line'), '订阅至 2026-11');
  assert.equal(text(window, 'license-state'), '订阅至 2026-11');
  assert.match(text(window, 'quota-line'), /每天 1000 次/);
  assert.match(text(window, 'quota-line'), /今日剩余 1000/);
  assert.match(text(window, 'quota-rows'), /本机无硬顶/);
  assert.match(text(window, 'status'), /订阅至 2026-11/);
  assert.equal(document.getElementById('subscription-notice').hidden, true);
  assert.equal(document.getElementById('export-csv').disabled, false);
  assert.equal(document.getElementById('export-xlsx').disabled, false);

  document.getElementById('export-csv').click();
  assert.equal(downloads.length, 1);
  assert.equal(quota.peek(window.localStorage, now).state.count, 1);
  const csv = String(blobs[0]);
  assert.equal(csv.includes('1100'), true);
  assert.equal(csv.split('\n').length, 103);

  document.getElementById('lang-en').click();
  assert.equal(text(window, 'tier-line'), 'Subscribed through 2026-11');
  assert.equal(text(window, 'license-state'), 'Subscribed through 2026-11');
  assert.match(text(window, 'status'), /Download started/);
});

test('S2 an expired subscription falls back and does not download a fourth file', async () => {
  const now = new Date(2026, 11, 2, 9, 0, 0);
  const window = loadPopupWithTable(4, now);
  await flush();
  const document = window.document;
  const quota = window.WebTableExportQuota;
  const { downloads, blobs } = spyDownloads(window);

  submitLicense(window, quota.buildSubscriptionLicense('202611'));
  const view = quota.peek(window.localStorage, now);
  assert.equal(view.unlocked, false);
  assert.equal(view.tier, 'free');
  assert.equal(view.limit, 3);
  assert.equal(view.maxRows, 100);
  assert.equal(view.subscriptionExpired, true);
  assert.equal(text(window, 'tier-line'), '免费');
  assert.equal(text(window, 'subscription-notice'), '订阅已到期');
  assert.equal(document.getElementById('subscription-notice').hidden, false);
  assert.match(text(window, 'status'), /订阅已到期/);
  assert.match(text(window, 'status'), /免费档/);
  assert.match(text(window, 'quota-line'), /每天 3 次/);
  assert.match(text(window, 'quota-line'), /今日剩余 3/);
  assert.equal(document.getElementById('export-csv').disabled, false);

  for (let i = 0; i < 3; i++) document.getElementById('export-csv').click();
  assert.equal(downloads.length, 3);
  assert.equal(blobs.length, 3);
  assert.equal(quota.peek(window.localStorage, now).state.count, 3);
  for (const blob of blobs) assert.equal(String(blob).length > 0, true);
  assert.equal(document.getElementById('export-csv').disabled, true);
  assert.equal(document.getElementById('export-xlsx').disabled, true);

  document.getElementById('export-csv').disabled = false;
  document.getElementById('export-xlsx').disabled = false;
  document.getElementById('export-csv').click();
  document.getElementById('export-xlsx').click();
  assert.equal(downloads.length, 3);
  assert.equal(blobs.length, 3);
  assert.equal(quota.peek(window.localStorage, now).state.count, 3);
  assert.match(text(window, 'status'), /不会下载文件/);
  assert.equal(text(window, 'subscription-notice'), '订阅已到期');

  document.getElementById('lang-en').click();
  assert.equal(text(window, 'tier-line'), 'Free');
  assert.equal(text(window, 'subscription-notice'), 'Subscription expired');
  assert.match(text(window, 'status'), /no file was downloaded/i);
});

test('S3 WTE1 still shows 永久许可 and an invalid code stays locked in both languages', () => {
  const now = new Date(2026, 11, 2, 9, 0, 0);
  const window = loadPopup(now);
  const document = window.document;
  const quota = window.WebTableExportQuota;

  submitLicense(window, quota.buildLicense());
  const paid = quota.peek(window.localStorage, now);
  assert.equal(paid.unlocked, true);
  assert.equal(paid.licenseKind, 'permanent');
  assert.equal(paid.limit, 1000);
  assert.equal(paid.maxRows, null);
  assert.equal(paid.subscriptionExpired, false);
  assert.equal(text(window, 'tier-line'), '永久许可');
  assert.equal(text(window, 'license-state'), '永久许可');
  assert.match(text(window, 'status'), /已解锁/);
  assert.match(text(window, 'quota-line'), /每天 1000 次/);

  submitLicense(window, 'WTE2.SUB.202611.00000000');
  assert.match(text(window, 'status'), /许可码无效/);
  assert.match(text(window, 'status'), /免费档/);
  assert.equal(text(window, 'tier-line'), '免费');
  assert.equal(quota.peek(window.localStorage, now).unlocked, false);
  assert.equal(quota.peek(window.localStorage, now).limit, 3);
  assert.equal(quota.peek(window.localStorage, now).state.licenseNote, '');

  document.getElementById('lang-en').click();
  submitLicense(window, 'not-a-license');
  assert.match(text(window, 'status'), /not valid/i);
  assert.match(text(window, 'status'), /free tier/i);
  assert.equal(text(window, 'tier-line'), 'Free');
  assert.equal(quota.peek(window.localStorage, now).unlocked, false);
  assert.equal(quota.peek(window.localStorage, now).tier, 'free');
});

test('S4 the quota panel and license options show the subscription placeholder without a payment path', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0);
  const window = loadPopup(now);
  const document = window.document;
  const quota = window.WebTableExportQuota;
  assert.equal(quota.SUBSCRIPTION_CHECKOUT_ENABLED, false);
  assert.equal(text(window, 'subscription-placeholder'), '按月订阅（即将上线）');
  assert.equal(document.getElementById('cap-subscription').hidden, true);
  assert.equal(document.querySelector('.cta-strong').textContent, '有问题请联系我');
  assert.match(document.querySelector('.cta-contact').textContent, /珊哥爱读书/);
  assert.equal(document.querySelector('a'), null);

  for (let i = 0; i < 3; i++) quota.consumeExport(window.localStorage, now);
  document.getElementById('lang-zh').click();
  assert.equal(document.getElementById('cap-unlock').hidden, false);
  assert.equal(document.getElementById('cap-subscription').hidden, false);
  assert.equal(text(window, 'cap-subscription'), '按月订阅（即将上线）');
  assert.match(text(window, 'cap-unlock'), /有问题请联系我/);
  assert.match(text(window, 'cap-unlock'), /珊哥爱读书/);
  assert.equal(text(window, 'subscription-placeholder'), '按月订阅（即将上线）');
  assert.equal(document.getElementById('cta').classList.contains('hot'), true);

  const labels = [...document.querySelectorAll('button')].map((button) => button.textContent);
  assert.equal(labels.some((label) => /付款|购买|Pay|Checkout/.test(label)), false);
  const html = document.documentElement.innerHTML.replaceAll('SUBSCRIPTION_CHECKOUT_ENABLED', '');
  assert.equal(/creem|dodo|stripe|paddle|lemonsqueezy|checkout/i.test(html), false);
  assert.equal(/<a\b/i.test(html), false);

  document.getElementById('lang-en').click();
  assert.equal(text(window, 'subscription-placeholder'), 'Monthly subscription (coming soon)');
  assert.equal(text(window, 'cap-subscription'), 'Monthly subscription (coming soon)');
});
