const assert = require('node:assert/strict');
const test = require('node:test');
const quota = require('../src/quota.js');

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

test('the free limit is the named constant 3', () => {
  assert.equal(quota.FREE_DAILY_EXPORT_LIMIT, 3);
});

test('the fourth export on the same local day is blocked', () => {
  const storage = memoryStorage();
  const day = new Date(2026, 9, 28, 10, 0, 0);
  for (let i = 0; i < 3; i++) {
    const spent = quota.consumeExport(storage, day);
    assert.equal(spent.ok, true);
    assert.equal(spent.remaining, 2 - i);
  }
  const blocked = quota.consumeExport(storage, day);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'quota');
  assert.equal(blocked.remaining, 0);
  assert.equal(quota.peek(storage, day).allowed, false);
});

test('a saved license note does not add exports', () => {
  const storage = memoryStorage();
  const day = new Date(2026, 9, 28, 12, 0, 0);
  quota.consumeExport(storage, day);
  quota.consumeExport(storage, day);
  quota.consumeExport(storage, day);
  const state = quota.saveLicense(storage, day, '  CONTACT-珊哥爱读书  ');
  assert.equal(state.licenseNote, 'CONTACT-珊哥爱读书');
  assert.equal(state.count, 3);
  assert.equal(quota.peek(storage, day).allowed, false);
});

test('the counter resets on the next local date', () => {
  const storage = memoryStorage();
  const today = new Date(2026, 9, 28, 23, 30, 0);
  quota.consumeExport(storage, today);
  quota.consumeExport(storage, today);
  quota.consumeExport(storage, today);
  const tomorrow = new Date(2026, 9, 29, 0, 5, 0);
  const view = quota.peek(storage, tomorrow);
  assert.equal(view.allowed, true);
  assert.equal(view.remaining, quota.FREE_DAILY_EXPORT_LIMIT);
  assert.equal(view.state.count, 0);
});
