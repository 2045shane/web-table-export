/**
 * Local quotas. No server, no payment check, no remote license call.
 *
 * Change a limit in this file only:
 *   FREE_DAILY_EXPORT_LIMIT  — free exports per local day
 *   FREE_EXPORT_MAX_ROWS     — free rows allowed in one export
 *   PAID_DAILY_EXPORT_LIMIT  — very high daily count after a valid license
 *   PAID_EXPORT_MAX_ROWS     — null means no per-export row cap on this device
 *
 * SUBSCRIPTION_CHECKOUT_ENABLED is reserved for a later cut. It must stay
 * false. Nothing in this file opens a payment page.
 *
 * licenseNote is stored only after normalizeLicense accepts the checksum.
 * A note that is merely text does not raise either limit.
 *   WTE1.PAID.<checksum>     — permanent paid tier
 *   WTE2.SUB.<YYYYMM>.<checksum> — paid tier only during that natural month
 *     (local calendar month, not a rolling 30 days). After the month,
 *     the same stored note is the free tier.
 * Clearing the note, or saving text that fails the checksum, also returns
 * the device to the free tier.
 */
(function (root) {
  'use strict';

  var FREE_DAILY_EXPORT_LIMIT = 3;
  var FREE_EXPORT_MAX_ROWS = 100;
  var PAID_DAILY_EXPORT_LIMIT = 1000;
  var PAID_EXPORT_MAX_ROWS = null;
  var SUBSCRIPTION_CHECKOUT_ENABLED = false;
  var STORAGE_KEY = 'web-table-export.v1';
  var LICENSE_MAX = 120;
  var LICENSE_BODY = 'WTE1.PAID';

  function localDateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function localMonthKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    return String(y) + m;
  }

  function monthLabel(yyyymm) {
    return yyyymm.slice(0, 4) + '-' + yyyymm.slice(4);
  }

  function licenseChecksum(body) {
    var h = 0x811c9dc5;
    for (var i = 0; i < body.length; i++) {
      h ^= body.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function buildLicense() {
    return LICENSE_BODY + '.' + licenseChecksum(LICENSE_BODY);
  }

  function buildSubscriptionLicense(yyyymm) {
    var month = String(yyyymm == null ? '' : yyyymm);
    if (!/^\d{6}$/.test(month)) return null;
    var mon = Number(month.slice(4, 6));
    if (mon < 1 || mon > 12) return null;
    var body = 'WTE2.SUB.' + month;
    return body + '.' + licenseChecksum(body);
  }

  function parseLicense(note) {
    var text = String(note == null ? '' : note).trim().replace(/\s+/g, '');
    if (!text || text.length > LICENSE_MAX) return null;
    var parts = text.split('.');
    if (parts.length === 3) {
      var prefix = parts[0].toUpperCase();
      var tier = parts[1].toUpperCase();
      var check = parts[2].toLowerCase();
      if (prefix !== 'WTE1' || tier !== 'PAID') return null;
      if (!/^[0-9a-f]{8}$/.test(check)) return null;
      var body = prefix + '.' + tier;
      if (check !== licenseChecksum(body)) return null;
      return { code: body + '.' + check, kind: 'permanent', yyyymm: '' };
    }
    if (parts.length === 4) {
      var prefix2 = parts[0].toUpperCase();
      var kind = parts[1].toUpperCase();
      var yyyymm = parts[2];
      var check2 = parts[3].toLowerCase();
      if (prefix2 !== 'WTE2' || kind !== 'SUB') return null;
      if (!/^\d{6}$/.test(yyyymm)) return null;
      var mon = Number(yyyymm.slice(4, 6));
      if (mon < 1 || mon > 12) return null;
      if (!/^[0-9a-f]{8}$/.test(check2)) return null;
      var body2 = prefix2 + '.' + kind + '.' + yyyymm;
      if (check2 !== licenseChecksum(body2)) return null;
      return { code: body2 + '.' + check2, kind: 'subscription', yyyymm: yyyymm };
    }
    return null;
  }

  function normalizeLicense(note) {
    var parsed = parseLicense(note);
    return parsed ? parsed.code : null;
  }

  function licenseStatus(note, now) {
    var parsed = parseLicense(note);
    if (!parsed) {
      return { kind: 'none', active: false, expired: false, pending: false, month: '', code: '' };
    }
    if (parsed.kind === 'permanent') {
      return { kind: 'permanent', active: true, expired: false, pending: false, month: '', code: parsed.code };
    }
    var current = localMonthKey(now || new Date());
    return {
      kind: 'subscription',
      active: parsed.yyyymm === current,
      expired: parsed.yyyymm < current,
      pending: parsed.yyyymm > current,
      month: monthLabel(parsed.yyyymm),
      yyyymm: parsed.yyyymm,
      code: parsed.code,
    };
  }

  function isValidLicense(note, now) {
    if (now === undefined) return parseLicense(note) != null;
    return licenseStatus(note, now).active;
  }

  function readStore(storage) {
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeStore(storage, data) {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function todayState(storage, now) {
    var saved = readStore(storage);
    var date = localDateKey(now);
    var licenseNote = typeof saved.licenseNote === 'string' ? saved.licenseNote : '';
    var count = saved.date === date && Number.isFinite(saved.count) ? saved.count : 0;
    if (count < 0) count = 0;
    return { date: date, count: count, licenseNote: licenseNote };
  }

  function tierOf(licenseNote, now) {
    var status = licenseStatus(licenseNote, now);
    var unlocked = isValidLicense(licenseNote) && status.active;
    return {
      unlocked: unlocked,
      tier: unlocked ? 'paid' : 'free',
      limit: unlocked ? PAID_DAILY_EXPORT_LIMIT : FREE_DAILY_EXPORT_LIMIT,
      maxRows: unlocked ? PAID_EXPORT_MAX_ROWS : FREE_EXPORT_MAX_ROWS,
      licenseKind: status.kind,
      subscriptionMonth: status.month,
      subscriptionExpired: status.expired,
      subscriptionPending: status.pending,
    };
  }

  function remainingOf(count, limit) {
    return Math.max(0, limit - count);
  }

  function decorate(state, now) {
    var tier = tierOf(state.licenseNote, now);
    var remaining = remainingOf(state.count, tier.limit);
    return {
      state: state,
      remaining: remaining,
      allowed: state.count < tier.limit,
      limit: tier.limit,
      maxRows: tier.maxRows,
      unlocked: tier.unlocked,
      tier: tier.tier,
      licenseKind: tier.licenseKind,
      subscriptionMonth: tier.subscriptionMonth,
      subscriptionExpired: tier.subscriptionExpired,
      subscriptionPending: tier.subscriptionPending,
      freeLimit: FREE_DAILY_EXPORT_LIMIT,
      freeMaxRows: FREE_EXPORT_MAX_ROWS,
      paidLimit: PAID_DAILY_EXPORT_LIMIT,
      paidMaxRows: PAID_EXPORT_MAX_ROWS,
    };
  }

  function peek(storage, now) {
    return decorate(todayState(storage, now), now);
  }

  function assessExport(storage, now, rowCount) {
    var view = peek(storage, now);
    var rows = Number(rowCount);
    if (!view.allowed) {
      return {
        ok: false,
        error: 'quota',
        view: view,
        remaining: 0,
        limit: view.limit,
        rowCount: Number.isFinite(rows) ? rows : 0,
        maxRows: view.maxRows,
      };
    }
    if (!Number.isFinite(rows) || rows < 1) {
      return {
        ok: false,
        error: 'no-data-rows',
        view: view,
        remaining: view.remaining,
        limit: view.limit,
        rowCount: 0,
        maxRows: view.maxRows,
      };
    }
    if (view.maxRows != null && rows > view.maxRows) {
      return {
        ok: false,
        error: 'row-cap',
        view: view,
        remaining: view.remaining,
        limit: view.limit,
        rowCount: rows,
        maxRows: view.maxRows,
      };
    }
    return {
      ok: true,
      view: view,
      remaining: view.remaining,
      limit: view.limit,
      rowCount: rows,
      maxRows: view.maxRows,
    };
  }

  function consumeExport(storage, now) {
    var state = todayState(storage, now);
    var tier = tierOf(state.licenseNote, now);
    if (state.count >= tier.limit) {
      return {
        ok: false,
        error: 'quota',
        state: state,
        remaining: 0,
        limit: tier.limit,
        unlocked: tier.unlocked,
        maxRows: tier.maxRows,
      };
    }
    var next = {
      date: state.date,
      count: state.count + 1,
      licenseNote: state.licenseNote,
    };
    writeStore(storage, next);
    var view = decorate(next, now);
    return {
      ok: true,
      state: next,
      remaining: view.remaining,
      limit: view.limit,
      unlocked: view.unlocked,
      maxRows: view.maxRows,
    };
  }

  function saveLicense(storage, now, note) {
    var state = todayState(storage, now);
    var text = String(note == null ? '' : note).trim();
    if (!text) {
      var cleared = {
        date: state.date,
        count: state.count,
        licenseNote: '',
      };
      writeStore(storage, cleared);
      return {
        ok: true,
        cleared: true,
        unlocked: false,
        expired: false,
        error: null,
        state: cleared,
      };
    }
    var normalized = normalizeLicense(text);
    if (!normalized) {
      var rejected = {
        date: state.date,
        count: state.count,
        licenseNote: '',
      };
      writeStore(storage, rejected);
      return {
        ok: false,
        cleared: true,
        unlocked: false,
        expired: false,
        error: 'invalid-license',
        state: rejected,
      };
    }
    var status = licenseStatus(normalized, now);
    var next = {
      date: state.date,
      count: state.count,
      licenseNote: normalized,
    };
    writeStore(storage, next);
    return {
      ok: true,
      cleared: false,
      unlocked: status.active,
      expired: status.expired,
      pending: status.pending,
      error: status.expired ? 'subscription-expired' : null,
      state: next,
    };
  }

  var api = {
    FREE_DAILY_EXPORT_LIMIT: FREE_DAILY_EXPORT_LIMIT,
    FREE_EXPORT_MAX_ROWS: FREE_EXPORT_MAX_ROWS,
    PAID_DAILY_EXPORT_LIMIT: PAID_DAILY_EXPORT_LIMIT,
    PAID_EXPORT_MAX_ROWS: PAID_EXPORT_MAX_ROWS,
    SUBSCRIPTION_CHECKOUT_ENABLED: SUBSCRIPTION_CHECKOUT_ENABLED,
    STORAGE_KEY: STORAGE_KEY,
    LICENSE_MAX: LICENSE_MAX,
    localDateKey: localDateKey,
    buildLicense: buildLicense,
    buildSubscriptionLicense: buildSubscriptionLicense,
    isValidLicense: isValidLicense,
    peek: peek,
    assessExport: assessExport,
    consumeExport: consumeExport,
    saveLicense: saveLicense,
  };

  root.WebTableExportQuota = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
