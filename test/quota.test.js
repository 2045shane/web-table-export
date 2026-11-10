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

test('S1 a subscription code is paid only during its natural month', () => {
  const storage = memoryStorage();
  const code = 'WTE2.SUB.202611.d5acd8e1';
  assert.equal(quota.buildSubscriptionLicense('202611'), code);
  assert.equal(quota.buildSubscriptionLicense('202610'), 'WTE2.SUB.202610.d4acd74e');
  assert.equal(quota.buildSubscriptionLicense('202613'), null);
  assert.equal(quota.SUBSCRIPTION_CHECKOUT_ENABLED, false);

  const saved = quota.saveLicense(storage, new Date(2026, 10, 15, 12, 0, 0), '  wte2.sub.202611.D5ACD8E1  ');
  assert.equal(saved.ok, true);
  assert.equal(saved.unlocked, true);
  assert.equal(saved.expired, false);
  assert.equal(saved.state.licenseNote, code);

  const start = quota.peek(storage, new Date(2026, 10, 1, 0, 0, 0));
  const end = quota.peek(storage, new Date(2026, 10, 30, 23, 59, 59));
  for (const view of [start, end]) {
    assert.equal(view.unlocked, true);
    assert.equal(view.tier, 'paid');
    assert.equal(view.licenseKind, 'subscription');
    assert.equal(view.subscriptionMonth, '2026-11');
    assert.equal(view.subscriptionExpired, false);
    assert.equal(view.limit, 1000);
    assert.equal(view.maxRows, null);
    assert.equal(view.state.licenseNote, code);
  }
  assert.equal(quota.isValidLicense(code, new Date(2026, 10, 15, 12, 0, 0)), true);
  assert.equal(quota.assessExport(storage, new Date(2026, 10, 15, 12, 0, 0), 5000).ok, true);

  const before = quota.peek(storage, new Date(2026, 9, 31, 23, 59, 59));
  assert.equal(before.unlocked, false);
  assert.equal(before.tier, 'free');
  assert.equal(before.subscriptionPending, true);
  assert.equal(before.subscriptionExpired, false);
  assert.equal(before.limit, 3);
  assert.equal(before.maxRows, 100);
});

test('S2 an expired subscription falls back to the free tier and blocks the fourth export', () => {
  const storage = memoryStorage();
  const code = quota.buildSubscriptionLicense('202611');
  const november = new Date(2026, 10, 20, 12, 0, 0);
  quota.saveLicense(storage, november, code);
  for (let i = 0; i < 4; i++) assert.equal(quota.consumeExport(storage, november).ok, true);

  const december = new Date(2026, 11, 1, 0, 0, 0);
  const expired = quota.peek(storage, december);
  assert.equal(expired.state.licenseNote, code);
  assert.equal(expired.unlocked, false);
  assert.equal(expired.tier, 'free');
  assert.equal(expired.licenseKind, 'subscription');
  assert.equal(expired.subscriptionExpired, true);
  assert.equal(expired.subscriptionMonth, '2026-11');
  assert.equal(expired.limit, quota.FREE_DAILY_EXPORT_LIMIT);
  assert.equal(expired.maxRows, quota.FREE_EXPORT_MAX_ROWS);
  assert.equal(expired.remaining, 3);
  assert.equal(expired.state.count, 0);
  assert.equal(quota.isValidLicense(code, december), false);
  assert.equal(quota.assessExport(storage, december, 101).error, 'row-cap');
  assert.equal(quota.peek(storage, december).state.count, 0);

  const pasted = quota.saveLicense(storage, december, quota.buildSubscriptionLicense('202610'));
  assert.equal(pasted.ok, true);
  assert.equal(pasted.unlocked, false);
  assert.equal(pasted.expired, true);
  assert.equal(pasted.error, 'subscription-expired');
  assert.equal(pasted.state.licenseNote, 'WTE2.SUB.202610.d4acd74e');

  for (let i = 0; i < 3; i++) {
    const spent = quota.consumeExport(storage, december);
    assert.equal(spent.ok, true);
    assert.equal(spent.unlocked, false);
    assert.equal(spent.limit, 3);
  }
  const blocked = quota.consumeExport(storage, december);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'quota');
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.limit, 3);
  const gate = quota.assessExport(storage, december, 4);
  assert.equal(gate.ok, false);
  assert.equal(gate.error, 'quota');
  assert.equal(gate.remaining, 0);
  assert.equal(quota.peek(storage, december).state.count, 3);
  assert.equal(quota.peek(storage, december).allowed, false);
});

test('S3 WTE1 stays permanent and an invalid code does not unlock', () => {
  const storage = memoryStorage();
  const later = new Date(2027, 5, 1, 8, 0, 0);
  const saved = quota.saveLicense(storage, later, ' WTE1.PAID.3c5a2030 ');
  assert.equal(saved.ok, true);
  assert.equal(saved.unlocked, true);
  assert.equal(saved.expired, false);
  const view = quota.peek(storage, later);
  assert.equal(view.licenseKind, 'permanent');
  assert.equal(view.tier, 'paid');
  assert.equal(view.limit, 1000);
  assert.equal(view.maxRows, null);
  assert.equal(view.subscriptionExpired, false);
  assert.equal(view.subscriptionMonth, '');
  assert.equal(quota.isValidLicense(quota.buildLicense(), later), true);

  const now = new Date(2026, 10, 15, 12, 0, 0);
  quota.saveLicense(storage, now, quota.buildSubscriptionLicense('202611'));
  for (const bad of ['not-a-license', 'WTE2.SUB.202611.00000000', 'WTE2.SUB.202613.d5acd8e1', 'WTE1.SUB.202611.d5acd8e1']) {
    const rejected = quota.saveLicense(storage, now, bad);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, 'invalid-license');
    assert.equal(rejected.unlocked, false);
    assert.equal(rejected.expired, false);
    assert.equal(rejected.state.licenseNote, '');
    const free = quota.peek(storage, now);
    assert.equal(free.unlocked, false);
    assert.equal(free.tier, 'free');
    assert.equal(free.limit, 3);
    assert.equal(free.maxRows, 100);
    assert.equal(free.subscriptionExpired, false);
  }
});

test('a future subscription month stays free until that month and is not called expired', () => {
  const storage = memoryStorage();
  const november = new Date(2026, 10, 15, 12, 0, 0);
  const saved = quota.saveLicense(storage, november, quota.buildSubscriptionLicense('202612'));
  assert.equal(saved.ok, true);
  assert.equal(saved.unlocked, false);
  assert.equal(saved.expired, false);
  assert.equal(saved.pending, true);
  const waiting = quota.peek(storage, november);
  assert.equal(waiting.tier, 'free');
  assert.equal(waiting.limit, 3);
  assert.equal(waiting.subscriptionExpired, false);
  assert.equal(waiting.subscriptionPending, true);
  const december = quota.peek(storage, new Date(2026, 11, 1, 0, 0, 0));
  assert.equal(december.unlocked, true);
  assert.equal(december.subscriptionMonth, '2026-12');
  assert.equal(december.limit, 1000);
  assert.equal(december.maxRows, null);
});
