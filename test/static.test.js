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
  assert.doesNotMatch(popup, /FREE_DAILY_EXPORT_LIMIT\s*=\s*\d+/);
  const quota = read('src/quota.js');
  const decls = quota.match(/FREE_DAILY_EXPORT_LIMIT\s*=\s*\d+/g);
  assert.deepEqual(decls, ['FREE_DAILY_EXPORT_LIMIT = 3']);
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

test('README states the boundary, quota, contact, and load steps', () => {
  const readme = read('README.md');
  for (const phrase of [
    'WEB-EXPORT-CUT-2026-10-28-v1',
    'activeTab',
    'scripting',
    'FREE_DAILY_EXPORT_LIMIT',
    '每天 3 次',
    '有问题请联系我',
    '珊哥爱读书',
    '加载已解压的扩展程序',
    '金额_2',
    'column_5',
    'visible-table-v1',
    '服务条款',
  ]) {
    assert.equal(readme.includes(phrase), true, phrase);
  }
});
