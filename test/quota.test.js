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

const day = new Date(2026, 9, 28, 10, 0, 0);

test('the free limit is the named constant 3 and the row cap is named once', () => {
  assert.equal(quota.FREE_DAILY_EXPORT_LIMIT, 3);
  assert.equal(quota.FREE_EXPORT_MAX_ROWS, 100);
  assert.equal(quota.PAID_DAILY_EXPORT_LIMIT, 1000);
  assert.equal(quota.PAID_EXPORT_MAX_ROWS, null);
  assert.equal(quota.PAID_DAILY_EXPORT_LIMIT >= quota.FREE_DAILY_EXPORT_LIMIT * 5, true);
  assert.equal(quota.buildLicense(), 'WTE1.PAID.3c5a2030');
});

test('the fourth free export on the same local day is blocked with remaining 0', () => {
  const storage = memoryStorage();
  for (let i = 0; i < 3; i++) {
    const spent = quota.consumeExport(storage, day);
    assert.equal(spent.ok, true);
    assert.equal(spent.remaining, 2 - i);
    assert.equal(spent.limit, 3);
    assert.equal(spent.unlocked, false);
  }
  const blocked = quota.consumeExport(storage, day);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'quota');
  assert.equal(blocked.remaining, 0);
  const view = quota.peek(storage, day);
  assert.equal(view.allowed, false);
  assert.equal(view.remaining, 0);
  assert.equal(view.limit, quota.FREE_DAILY_EXPORT_LIMIT);
  const gate = quota.assessExport(storage, day, 4);
  assert.equal(gate.ok, false);
  assert.equal(gate.error, 'quota');
  assert.equal(gate.remaining, 0);
});

test('a non-empty licenseNote that fails the check does not raise quotas', () => {
  const storage = memoryStorage();
  storage.setItem(quota.STORAGE_KEY, JSON.stringify({
    date: '2026-10-28',
    count: 3,
    licenseNote: 'CONTACT-珊哥爱读书',
  }));
  const before = quota.peek(storage, day);
  assert.equal(before.unlocked, false);
  assert.equal(before.allowed, false);
  assert.equal(before.limit, 3);
  assert.equal(before.maxRows, 100);
  const saved = quota.saveLicense(storage, day, '  CONTACT-珊哥爱读书  ');
  assert.equal(saved.ok, false);
  assert.equal(saved.error, 'invalid-license');
  assert.equal(saved.unlocked, false);
  assert.equal(saved.state.licenseNote, '');
  assert.equal(saved.state.count, 3);
  assert.equal(quota.peek(storage, day).allowed, false);
});

test('a valid local license unlocks a higher daily quota and removes the row cap', () => {
  const storage = memoryStorage();
  for (let i = 0; i < 3; i++) quota.consumeExport(storage, day);
  assert.equal(quota.peek(storage, day).allowed, false);

  const saved = quota.saveLicense(storage, day, '  wte1.paid.3C5A2030  ');
  assert.equal(saved.ok, true);
  assert.equal(saved.unlocked, true);
  assert.equal(saved.state.licenseNote, 'WTE1.PAID.3c5a2030');
  assert.equal(saved.state.count, 3);

  const view = quota.peek(storage, day);
  assert.equal(view.unlocked, true);
  assert.equal(view.tier, 'paid');
  assert.equal(view.limit, 1000);
  assert.equal(view.maxRows, null);
  assert.equal(view.remaining, 997);
  assert.equal(view.allowed, true);

  const fourth = quota.consumeExport(storage, day);
  assert.equal(fourth.ok, true);
  assert.equal(fourth.remaining, 996);
  assert.equal(fourth.unlocked, true);

  assert.equal(quota.assessExport(storage, day, 100).ok, true);
  assert.equal(quota.assessExport(storage, day, 101).ok, true);
  assert.equal(quota.assessExport(storage, day, 500).ok, true);
  assert.equal(quota.assessExport(storage, day, 5000).ok, true);
});

test('clearing the license returns to the free tier', () => {
  const storage = memoryStorage();
  quota.saveLicense(storage, day, quota.buildLicense());
  for (let i = 0; i < 4; i++) {
    const spent = quota.consumeExport(storage, day);
    assert.equal(spent.ok, true);
  }
  const cleared = quota.saveLicense(storage, day, '   ');
  assert.equal(cleared.ok, true);
  assert.equal(cleared.cleared, true);
  assert.equal(cleared.unlocked, false);
  assert.equal(cleared.state.licenseNote, '');
  const view = quota.peek(storage, day);
  assert.equal(view.tier, 'free');
  assert.equal(view.limit, 3);
  assert.equal(view.maxRows, 100);
  assert.equal(view.remaining, 0);
  assert.equal(view.allowed, false);
  assert.equal(quota.assessExport(storage, day, 10).error, 'quota');
});

test('an invalid code after unlock drops back to the free tier', () => {
  const storage = memoryStorage();
  quota.saveLicense(storage, day, quota.buildLicense());
  const bad = quota.saveLicense(storage, day, 'WTE1.PAID.00000000');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'invalid-license');
  assert.equal(bad.unlocked, false);
  assert.equal(quota.peek(storage, day).limit, quota.FREE_DAILY_EXPORT_LIMIT);
  assert.equal(quota.peek(storage, day).maxRows, quota.FREE_EXPORT_MAX_ROWS);
});

test('free per-export row cap blocks above the constant and does not change the counter', () => {
  const storage = memoryStorage();
  const before = quota.peek(storage, day);
  const atCap = quota.assessExport(storage, day, quota.FREE_EXPORT_MAX_ROWS);
  assert.equal(atCap.ok, true);
  assert.equal(atCap.maxRows, 100);
  const over = quota.assessExport(storage, day, quota.FREE_EXPORT_MAX_ROWS + 1);
  assert.equal(over.ok, false);
  assert.equal(over.error, 'row-cap');
  assert.equal(over.rowCount, 101);
  assert.equal(over.maxRows, 100);
  assert.equal(over.remaining, before.remaining);
  assert.equal(quota.peek(storage, day).state.count, 0);
  assert.equal(quota.assessExport(storage, day, 0).error, 'no-data-rows');
});

test('the counter resets on the next local date and a valid license stays unlocked', () => {
  const storage = memoryStorage();
  const today = new Date(2026, 9, 28, 23, 30, 0);
  quota.consumeExport(storage, today);
  quota.consumeExport(storage, today);
  quota.consumeExport(storage, today);
  const tomorrow = new Date(2026, 9, 29, 0, 5, 0);
  const freeNext = quota.peek(storage, tomorrow);
  assert.equal(freeNext.allowed, true);
  assert.equal(freeNext.remaining, quota.FREE_DAILY_EXPORT_LIMIT);
  assert.equal(freeNext.state.count, 0);

  quota.saveLicense(storage, tomorrow, quota.buildLicense());
  for (let i = 0; i < 5; i++) quota.consumeExport(storage, tomorrow);
  const paidToday = quota.peek(storage, tomorrow);
  assert.equal(paidToday.remaining, 995);
  const dayAfter = new Date(2026, 9, 30, 8, 0, 0);
  const paidNext = quota.peek(storage, dayAfter);
  assert.equal(paidNext.unlocked, true);
  assert.equal(paidNext.remaining, quota.PAID_DAILY_EXPORT_LIMIT);
  assert.equal(paidNext.maxRows, null);
});

test('paid daily cap is the named 1000 and still blocks instead of pretending success', () => {
  const storage = memoryStorage();
  quota.saveLicense(storage, day, quota.buildLicense());
  for (let i = 0; i < quota.PAID_DAILY_EXPORT_LIMIT; i++) {
    const spent = quota.consumeExport(storage, day);
    assert.equal(spent.ok, true);
  }
  const blocked = quota.consumeExport(storage, day);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'quota');
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.limit, 1000);
  assert.equal(quota.assessExport(storage, day, 1).ok, false);
});
