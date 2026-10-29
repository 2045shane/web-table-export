/**
 * Local daily free quota. Change FREE_DAILY_EXPORT_LIMIT here only.
 * No server, no payment check. A saved license note does not add exports.
 */
(function (root) {
  'use strict';

  var FREE_DAILY_EXPORT_LIMIT = 3;
  var STORAGE_KEY = 'web-table-export.v1';
  var LICENSE_MAX = 120;

  function localDateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
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

  function remainingOf(state) {
    return Math.max(0, FREE_DAILY_EXPORT_LIMIT - state.count);
  }

  function peek(storage, now) {
    var state = todayState(storage, now);
    var remaining = remainingOf(state);
    return {
      state: state,
      remaining: remaining,
      allowed: state.count < FREE_DAILY_EXPORT_LIMIT,
      limit: FREE_DAILY_EXPORT_LIMIT,
    };
  }

  function consumeExport(storage, now) {
    var state = todayState(storage, now);
    if (state.count >= FREE_DAILY_EXPORT_LIMIT) {
      return {
        ok: false,
        error: 'quota',
        state: state,
        remaining: 0,
        limit: FREE_DAILY_EXPORT_LIMIT,
      };
    }
    var next = {
      date: state.date,
      count: state.count + 1,
      licenseNote: state.licenseNote,
    };
    writeStore(storage, next);
    return {
      ok: true,
      state: next,
      remaining: remainingOf(next),
      limit: FREE_DAILY_EXPORT_LIMIT,
    };
  }

  function saveLicense(storage, now, note) {
    var state = todayState(storage, now);
    var text = String(note == null ? '' : note).replace(/\s+/g, ' ').trim();
    if (text.length > LICENSE_MAX) text = text.slice(0, LICENSE_MAX);
    var next = {
      date: state.date,
      count: state.count,
      licenseNote: text,
    };
    writeStore(storage, next);
    return next;
  }

  var api = {
    FREE_DAILY_EXPORT_LIMIT: FREE_DAILY_EXPORT_LIMIT,
    STORAGE_KEY: STORAGE_KEY,
    LICENSE_MAX: LICENSE_MAX,
    localDateKey: localDateKey,
    peek: peek,
    consumeExport: consumeExport,
    saveLicense: saveLicense,
  };

  root.WebTableExportQuota = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
