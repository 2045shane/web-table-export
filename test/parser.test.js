const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { parseDocument, stabilizeColumns, PARSER_ID } = require('../src/parser.js');

const root = path.join(__dirname, '..');

function parseHtml(html) {
  const dom = new JSDOM(html, { url: 'https://example.test/fixture' });
  return parseDocument(dom.window.document);
}

function parseFile(name) {
  const html = fs.readFileSync(path.join(root, 'fixtures', name), 'utf8');
  return parseHtml(html);
}

test('AC-S02 fixture yields the committed JSON rows', () => {
  const actual = parseFile('ac-s02-visible-tables.html');
  const expected = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'ac-s02-visible-tables.expected.json'), 'utf8')
  );
  assert.equal(actual.parserId, PARSER_ID);
  assert.deepEqual(actual, expected);
  const blob = JSON.stringify(actual);
  for (const banned of ['hunter2', 'HIDDEN', 'SHOULD-NOT-APPEAR', 'NOPE', '密码']) {
    assert.equal(blob.includes(banned), false, banned);
  }
});

test('empty page is an error, not an empty success', () => {
  const actual = parseFile('ac-s02-empty.html');
  assert.deepEqual(actual, {
    ok: false,
    error: 'no-visible-table',
    parserId: PARSER_ID,
    tables: [],
  });
});

test('header without data rows is an error', () => {
  const actual = parseFile('ac-s02-header-only.html');
  assert.equal(actual.ok, false);
  assert.equal(actual.error, 'no-data-rows');
  assert.deepEqual(actual.tables, []);
});

test('column names are stable for blanks and duplicates', () => {
  assert.deepEqual(stabilizeColumns(['金额', '金额', '', '备注']), [
    '金额',
    '金额_2',
    'column_3',
    '备注',
  ]);
});

test('rowspan repeats the value and stacked headers join', () => {
  const actual = parseHtml(`
    <table id="span">
      <thead>
        <tr><th colspan="2">金额</th></tr>
        <tr><th>税前</th><th>税后</th></tr>
      </thead>
      <tbody>
        <tr><td rowspan="2">共</td><td>1</td></tr>
        <tr><td>2</td></tr>
      </tbody>
    </table>
  `);
  assert.equal(actual.ok, true);
  assert.deepEqual(actual.tables[0].columns, ['金额 / 税前', '金额 / 税后']);
  assert.deepEqual(actual.tables[0].rows, [
    { '金额 / 税前': '共', '金额 / 税后': '1' },
    { '金额 / 税前': '共', '金额 / 税后': '2' },
  ]);
});

test('admin widgets drop the empty gutter column and ignore fixed clones', () => {
  const actual = parseHtml(`
    <div class="el-table" id="dates" aria-label="日期表">
      <div class="el-table__fixed"><table><tbody><tr><td>CLONE</td></tr></tbody></table></div>
      <div class="el-table__header-wrapper">
        <table><thead><tr><th>日期</th><th>姓名</th><th></th></tr></thead></table>
      </div>
      <div class="el-table__body-wrapper">
        <table><tbody><tr><td>2026-10-28</td><td>珊</td></tr></tbody></table>
      </div>
    </div>
  `);
  assert.equal(actual.tables.length, 1);
  assert.equal(actual.tables[0].source, 'admin-widget');
  assert.deepEqual(actual.tables[0].columns, ['日期', '姓名']);
  assert.deepEqual(actual.tables[0].rows, [{ 日期: '2026-10-28', 姓名: '珊' }]);
  assert.equal(JSON.stringify(actual).includes('CLONE'), false);
});

test('a layout table does not hide the inner data table', () => {
  const actual = parseHtml(`
    <table id="layout"><tr><td>
      <table id="inner">
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    </td></tr></table>
  `);
  assert.equal(actual.tables.length, 1);
  assert.equal(actual.tables[0].rootId, 'inner');
  assert.deepEqual(actual.tables[0].rows, [{ A: '1', B: '2' }]);
});

test('select and text inputs supply the visible value', () => {
  const actual = parseHtml(`
    <table>
      <tr><th>状态</th><th>数量</th></tr>
      <tr>
        <td><select><option>待发货</option><option selected>已发货</option></select></td>
        <td><input value="4"></td>
      </tr>
    </table>
  `);
  assert.deepEqual(actual.tables[0].rows, [{ 状态: '已发货', 数量: '4' }]);
});

test('measure rows and aria-hidden clones are skipped', () => {
  const actual = parseHtml(`
    <table>
      <thead><tr><th>名称</th><th>数量</th></tr></thead>
      <tbody>
        <tr aria-hidden="true" class="ant-table-measure-row"><td>宽度</td><td>宽度</td></tr>
        <tr><td>茶</td><td>2</td></tr>
      </tbody>
    </table>
  `);
  assert.deepEqual(actual.tables[0].rows, [{ 名称: '茶', 数量: '2' }]);
});
