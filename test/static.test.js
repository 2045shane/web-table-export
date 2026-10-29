const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { STR } = require('../src/i18n.js');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

test('manifest is MV3 with only activeTab and scripting', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.action.default_title, '导出');
  assert.equal(manifest.action.default_popup, 'src/popup.html');
  assert.equal(JSON.stringify(manifest).includes('content_scripts'), false);
});

test('popup does not carry a second parser', () => {
  const popup = read('src/popup.js');
  assert.equal(popup.includes('querySelectorAll'), false);
  assert.equal(popup.includes('stabilizeColumns'), false);
  assert.equal(popup.includes('WIDGET_SELECTOR'), false);
  assert.match(popup, /files:\s*\['src\/parser\.js'\]/);
  assert.match(popup, /WebTableExport\.parseDocument/);
  assert.match(popup, /FREE_DAILY_EXPORT_LIMIT/);
  assert.match(popup, /FREE_EXPORT_MAX_ROWS/);
  assert.doesNotMatch(popup, /FREE_DAILY_EXPORT_LIMIT\s*=\s*\d+/);
  assert.doesNotMatch(popup, /FREE_EXPORT_MAX_ROWS\s*=\s*\d+/);
  assert.equal(popup.includes('table.rows.slice'), false);
  assert.equal(popup.includes('.rows.slice'), false);
  const assessAt = popup.indexOf('assessExport');
  const downloadAt = popup.indexOf('downloadBlob(');
  assert.equal(assessAt > 0 && downloadAt > assessAt, true);
  const quota = read('src/quota.js');
  const decls = quota.match(/FREE_DAILY_EXPORT_LIMIT\s*=\s*\d+/g);
  assert.deepEqual(decls, ['FREE_DAILY_EXPORT_LIMIT = 3']);
  assert.deepEqual(quota.match(/FREE_EXPORT_MAX_ROWS\s*=\s*\d+/g), ['FREE_EXPORT_MAX_ROWS = 100']);
  assert.deepEqual(quota.match(/PAID_DAILY_EXPORT_LIMIT\s*=\s*\d+/g), ['PAID_DAILY_EXPORT_LIMIT = 1000']);
  assert.match(quota, /PAID_EXPORT_MAX_ROWS = null/);
});

test('source has no API keys, payments, or map scraping', () => {
  const files = walk(path.join(root, 'src'), []).concat([path.join(root, 'manifest.json')]);
  const banned = [
    /AIza/,
    /sk-[A-Za-z0-9]/,
    /api[_-]?key/i,
    /maps\.googleapis/,
    /google\.com\/maps/i,
    /place_id/,
    /stripe/i,
    /paypal/i,
    /skinora/i,
    /japyue/i,
    /ai-demos/,
    /geo-checker/,
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, file + ' matched ' + pattern);
    }
  }
});

test('both languages expose the same copy keys', () => {
  function keys(value, prefix) {
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().flatMap((key) => keys(value[key], prefix + key + '.'));
    }
    return [prefix];
  }
  assert.deepEqual(keys(STR.zh, ''), keys(STR.en, ''));
});

test('copy templates take limits from constants and both languages share keys', () => {
  assert.match(STR.zh.quota, /每天 \{limit\} 次/);
  assert.equal(STR.zh.quota.includes('3'), false);
  assert.match(STR.zh.rowCapFree, /\{maxRows\}/);
  assert.equal(STR.zh.rowCapFree.includes('100'), false);
  assert.match(STR.zh.capUnlock, /有问题请联系我/);
  assert.match(STR.zh.capUnlock, /珊哥爱读书/);
  assert.match(STR.en.errors['invalid-license'], /not valid/i);
  assert.match(STR.zh.errors['invalid-license'], /无效/);
  const html = read('src/popup.html');
  assert.equal(html.includes('有问题请联系我'), true);
  assert.equal(html.includes('珊哥爱读书'), true);
  assert.equal(html.includes('id="license-input"'), true);
  assert.equal(html.includes('id="license-clear"'), true);
  assert.equal(html.includes('license-box" hidden'), false);
});

test('README states the boundary, quota, contact, and load steps', () => {
  const readme = read('README.md');
  const quotaSrc = read('src/quota.js');
  const daily = quotaSrc.match(/FREE_DAILY_EXPORT_LIMIT = (\d+)/)[1];
  const rows = quotaSrc.match(/FREE_EXPORT_MAX_ROWS = (\d+)/)[1];
  const paidDaily = quotaSrc.match(/PAID_DAILY_EXPORT_LIMIT = (\d+)/)[1];
  for (const phrase of [
    'WEB-EXPORT-CUT-2026-10-28-v1',
    'PLUGIN-PAYWALL-CUT-2026-10-29-v1',
    'activeTab',
    'scripting',
    'FREE_DAILY_EXPORT_LIMIT',
    'FREE_EXPORT_MAX_ROWS',
    'PAID_DAILY_EXPORT_LIMIT',
    'PAID_EXPORT_MAX_ROWS',
    '每天 ' + daily + ' 次',
    '有问题请联系我',
    '珊哥爱读书',
    '加载已解压的扩展程序',
    '金额_2',
    'column_5',
    'visible-table-v1',
    '服务条款',
    '本机无硬顶',
    'WTE1.PAID.3c5a2030',
    '支付 SDK',
    '不上架',
    String(rows),
    String(paidDaily),
  ]) {
    assert.equal(readme.includes(phrase), true, phrase);
  }
});

test('package and manifest do not add billing, hosting, or a server quota', () => {
  const pkg = read('package.json');
  const manifest = read('manifest.json');
  const banned = /stripe|paypal|lemonsqueezy|paddle|braintree|checkout|billing/i;
  assert.equal(banned.test(pkg), false);
  assert.equal(banned.test(manifest), false);
  assert.equal(manifest.includes('host_permissions'), false);
  const files = walk(path.join(root, 'src'), []).concat(walk(path.join(root, 'scripts'), []));
  const secret = /AIza[0-9A-Za-z_-]{10,}|sk-ant-|sk-proj-|AKIA[0-9A-Z]{16}|BEGIN (RSA |OPENSSH )?PRIVATE KEY/;
  for (const file of files) {
    assert.equal(secret.test(fs.readFileSync(file, 'utf8')), false, file);
  }
});
