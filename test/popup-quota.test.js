const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function loadPopup() {
  const html = fs.readFileSync(path.join(__dirname, '../src/popup.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://extension.local/popup.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
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

function loadPopupWithTable(rowCount) {
  const html = fs.readFileSync(path.join(__dirname, '../src/popup.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://extension.local/popup.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
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
