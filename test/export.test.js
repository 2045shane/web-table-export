const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { buildCsv } = require('../src/csv.js');
const { buildXlsx } = require('../src/xlsx.js');

const columns = ['订单号', '备注', '金额'];
const rows = [
  { 订单号: '1001', 备注: '加急, "今日"', 金额: '=1+1' },
  { 订单号: '1002', 备注: 'A & B', 金额: '12.50' },
];

test('CSV is BOM + CRLF and keeps risky cells as text', () => {
  const csv = buildCsv(columns, rows);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(
    csv.slice(1),
    '订单号,备注,金额\r\n1001,"加急, ""今日""",\'=1+1\r\n1002,A & B,12.50\r\n'
  );
});

test('xlsx is a real zip package of inline strings', () => {
  const bytes = buildXlsx(columns, rows, { sheetName: '导出' });
  const result = spawnSync('python3', ['-c', `
import sys, zipfile
from io import BytesIO
raw = sys.stdin.buffer.read()
assert raw[:4] == b"PK\\x03\\x04"
z = zipfile.ZipFile(BytesIO(raw))
assert z.testzip() is None
names = set(z.namelist())
assert "xl/worksheets/sheet1.xml" in names
assert "xl/workbook.xml" in names
sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
book = z.read("xl/workbook.xml").decode("utf-8")
assert "订单号" in sheet
assert "1001" in sheet
assert "A &amp; B" in sheet
assert "inlineStr" in sheet
assert "<f>" not in sheet
assert "=1+1" in sheet
assert "导出" in book
print("ok")
`], { input: Buffer.from(bytes) });
  assert.equal(result.status, 0, String(result.stderr) + String(result.stdout));
});

test('empty exports throw instead of writing a blank file', () => {
  assert.throws(() => buildCsv(['A'], []), /no-rows/);
  assert.throws(() => buildXlsx(['A'], []), /no-rows/);
});
