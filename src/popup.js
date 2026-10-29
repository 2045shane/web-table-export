/**
 * Toolbar popup. Parsing lives only in parser.js, injected into the active tab.
 * This file turns the returned rows into CSV / xlsx and enforces local quotas.
 * CSV and Excel are both offered on the free tier. Over the daily limit or the
 * per-export row cap, the download does not start.
 */
(function () {
  'use strict';

  var LANG_KEY = 'web-table-export.lang';
  var quotaApi = globalThis.WebTableExportQuota;
  var i18n = globalThis.WebTableExportI18n;
  var csvApi = globalThis.WebTableExportCsv;
  var xlsxApi = globalThis.WebTableExportXlsx;

  var lang = 'zh';
  var scanResult = null;
  var scanning = false;
  var lastExportName = '';

  function dict() {
    return i18n.STR[lang] || i18n.STR.zh;
  }

  function storage() {
    return localStorage;
  }

  function readLang() {
    try {
      return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh';
    } catch (err) {
      return 'zh';
    }
  }

  function showStatus(kind, message) {
    var el = document.getElementById('status');
    el.className = 'status' + (message ? ' show ' + kind : '');
    el.textContent = message || '';
  }

  function errorText(code) {
    var errors = dict().errors;
    return errors[code] || errors['unreadable-page'];
  }

  function renderQuota() {
    var view = quotaApi.peek(storage(), new Date());
    var freeDailyLimit = quotaApi.FREE_DAILY_EXPORT_LIMIT;
    var freeMaxRows = quotaApi.FREE_EXPORT_MAX_ROWS;
    var box = document.getElementById('quota-box');
    var line = document.getElementById('quota-line');
    var rows = document.getElementById('quota-rows');
    var hint = document.getElementById('quota-hint');
    var cap = document.getElementById('cap-unlock');
    var cta = document.getElementById('cta');
    var licenseBox = document.getElementById('license-box');
    var text = dict();
    line.textContent = i18n.fill(view.unlocked ? text.quotaPaid : text.quota, {
      remaining: view.remaining,
      limit: view.limit,
    });
    if (view.unlocked) {
      rows.textContent = i18n.fill(text.rowCapPaid, {
        freeLimit: freeDailyLimit,
        freeRows: freeMaxRows,
      });
      hint.textContent = text.quotaHintPaid;
    } else {
      rows.textContent = i18n.fill(text.rowCapFree, { maxRows: view.maxRows });
      hint.textContent = i18n.fill(text.quotaHint, { limit: freeDailyLimit });
    }
    var blocked = !view.allowed;
    box.classList.toggle('blocked', blocked);
    cta.classList.toggle('hot', blocked);
    licenseBox.classList.toggle('attention', blocked);
    cap.hidden = !blocked;
    cap.textContent = blocked ? i18n.fill(text.capUnlock, { remaining: view.remaining }) : '';
    return view;
  }

  function renderLicense() {
    var view = quotaApi.peek(storage(), new Date());
    var input = document.getElementById('license-input');
    var state = document.getElementById('license-state');
    var stored = view.state.licenseNote || '';
    if (document.activeElement !== input && stored) input.value = stored;
    if (view.unlocked) state.textContent = dict().licenseUnlocked;
    else if (stored) state.textContent = dict().licenseInvalidStored;
    else state.textContent = dict().licenseEmpty;
  }

  function selectedTable() {
    if (!scanResult || !scanResult.ok) return null;
    var chosen = document.querySelector('input[name="table"]:checked');
    if (!chosen) return null;
    var index = Number(chosen.value);
    for (var i = 0; i < scanResult.tables.length; i++) {
      if (scanResult.tables[i].index === index) return scanResult.tables[i];
    }
    return null;
  }

  function renderActions() {
    var table = selectedTable();
    var count = table && table.rows ? table.rows.length : 0;
    var gate = quotaApi.assessExport(storage(), new Date(), count);
    var enabled = !!(table && gate.ok);
    document.getElementById('export-csv').disabled = !enabled;
    document.getElementById('export-xlsx').disabled = !enabled;
    return gate;
  }

  function onTableChange() {
    var gate = renderActions();
    var status = document.getElementById('status');
    if (gate.error === 'quota') setStatusCode('error', 'quota-block');
    else if (gate.error === 'row-cap') {
      setStatusCode('error', 'row-cap', { rows: gate.rowCount, maxRows: gate.maxRows });
    } else if (status.dataset.code === 'row-cap' || status.dataset.code === 'quota-block') {
      clearStatusCode();
    }
  }

  function renderTables() {
    var section = document.getElementById('tables');
    var list = document.getElementById('table-list');
    var legend = document.getElementById('tables-legend');
    var previous = document.querySelector('input[name="table"]:checked');
    var previousIndex = previous ? Number(previous.value) : null;
    var view = quotaApi.peek(storage(), new Date());
    list.replaceChildren();
    if (!scanResult || !scanResult.ok || !scanResult.tables.length) {
      section.hidden = true;
      renderActions();
      return;
    }
    section.hidden = false;
    legend.textContent = i18n.fill(dict().found, { count: scanResult.tables.length });
    var best = scanResult.tables[0];
    scanResult.tables.forEach(function (table) {
      if (table.rows.length > best.rows.length) best = table;
    });
    var stillThere = scanResult.tables.some(function (table) { return table.index === previousIndex; });
    var preferred = stillThere ? previousIndex : best.index;
    scanResult.tables.forEach(function (table) {
      var label = document.createElement('label');
      label.className = 'choice';
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'table';
      input.value = String(table.index);
      input.checked = table.index === preferred;
      input.addEventListener('change', onTableChange);
      var text = document.createElement('span');
      var title = document.createElement('strong');
      var source = dict().sources[table.source] || table.source;
      title.textContent = table.index + '. ' + (table.label || source);
      var meta = document.createElement('small');
      var rowLabel = i18n.fill(dict().rows, {
        rows: table.rows.length,
        cols: table.columns.length,
      });
      if (view.maxRows != null && table.rows.length > view.maxRows) {
        rowLabel += ' · ' + i18n.fill(dict().overCap, { maxRows: view.maxRows });
      }
      meta.textContent = source + ' · ' + rowLabel;
      var cols = document.createElement('small');
      cols.className = 'cols';
      cols.textContent = table.columns.join(' · ');
      text.append(title, meta, cols);
      label.append(input, text);
      list.append(label);
    });
    renderActions();
  }

  function applyCopy() {
    var text = dict();
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = text.title;
    document.getElementById('title').textContent = text.title;
    document.getElementById('subtitle').textContent = text.subtitle;
    document.getElementById('boundary').textContent = text.boundary;
    document.getElementById('scan').textContent = text.scan;
    document.getElementById('export-csv').textContent = text.exportCsv;
    document.getElementById('export-xlsx').textContent = text.exportXlsx;
    document.getElementById('export-note').textContent = text.exportNote;
    document.getElementById('license-title').textContent = text.licenseTitle;
    document.getElementById('license-help').textContent = text.licenseHelp;
    document.getElementById('license-save').textContent = text.licenseSave;
    document.getElementById('license-clear').textContent = text.licenseClear;
    document.getElementById('license-input').placeholder = text.licensePlaceholder;
    document.getElementById('lang-group').setAttribute('aria-label', text.langLabel);
    var note = document.getElementById('cta-note');
    note.textContent = text.ctaNote;
    note.hidden = !text.ctaNote;
    document.getElementById('lang-zh').classList.toggle('on', lang === 'zh');
    document.getElementById('lang-en').classList.toggle('on', lang === 'en');
    renderQuota();
    renderLicense();
    renderTables();
    var status = document.getElementById('status');
    if (status.dataset.code) showStatus(status.dataset.kind || 'info', messageForCode(status.dataset.code));
  }

  function messageForCode(code) {
    var text = dict();
    var status = document.getElementById('status');
    var view = quotaApi.peek(storage(), new Date());
    if (code === 'quota-block') {
      return i18n.fill(view.unlocked ? text.quotaBlockPaid : text.quotaBlock, {
        limit: view.limit,
        remaining: view.remaining,
      });
    }
    if (code === 'row-cap') {
      return i18n.fill(text.errors['row-cap'], {
        rows: status.dataset.rows || '',
        maxRows: status.dataset.maxRows || view.freeMaxRows,
      });
    }
    if (code === 'scanning') return text.scanning;
    if (code === 'exported') return statusExported();
    if (code === 'license-unlocked') return text.licenseUnlockedStatus;
    if (code === 'license-cleared') return text.licenseClearedStatus;
    return errorText(code);
  }

  function statusExported() {
    return i18n.fill(dict().exported, { name: lastExportName });
  }

  function setStatusCode(kind, code, extra) {
    var status = document.getElementById('status');
    status.dataset.kind = kind;
    status.dataset.code = code;
    if (extra && extra.rows != null) status.dataset.rows = String(extra.rows);
    else delete status.dataset.rows;
    if (extra && extra.maxRows != null) status.dataset.maxRows = String(extra.maxRows);
    else delete status.dataset.maxRows;
    showStatus(kind, messageForCode(code));
  }

  function clearStatusCode() {
    var status = document.getElementById('status');
    delete status.dataset.kind;
    delete status.dataset.code;
    delete status.dataset.rows;
    delete status.dataset.maxRows;
    showStatus('', '');
  }

  function isBlockedUrl(url) {
    if (!url) return false;
    return /^(chrome|chrome-untrusted|chrome-extension|edge|about|devtools|view-source|moz-extension):/i.test(url)
      || /^https:\/\/chrome\.google\.com\/webstore/i.test(url)
      || /^https:\/\/chromewebstore\.google\.com/i.test(url);
  }

  function scan() {
    if (scanning) return;
    if (!globalThis.chrome || !chrome.tabs || !chrome.scripting) {
      scanResult = null;
      renderTables();
      setStatusCode('error', 'unreadable-page');
      return;
    }
    scanning = true;
    document.getElementById('scan').disabled = true;
    setStatusCode('info', 'scanning');
    chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || tab.id == null) {
        scanResult = null;
        renderTables();
        setStatusCode('error', 'no-tab');
        return null;
      }
      if (isBlockedUrl(tab.url || '')) {
        scanResult = null;
        renderTables();
        setStatusCode('error', 'unreadable-page');
        return null;
      }
      return chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/parser.js'],
      }).then(function () {
        return chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function () {
            return globalThis.WebTableExport.parseDocument(document);
          },
        });
      }).then(function (injected) {
        var payload = injected && injected[0] && injected[0].result;
        if (!payload || typeof payload.ok !== 'boolean') {
          scanResult = null;
          renderTables();
          setStatusCode('error', 'unreadable-page');
          return;
        }
        scanResult = payload;
        renderTables();
        if (!payload.ok) setStatusCode('error', payload.error || 'no-visible-table');
        else {
          var view = renderQuota();
          if (!view.allowed) setStatusCode('error', 'quota-block');
          else {
            clearStatusCode();
            onTableChange();
          }
        }
      });
    }).catch(function () {
      scanResult = null;
      renderTables();
      setStatusCode('error', 'unreadable-page');
    }).then(function () {
      scanning = false;
      document.getElementById('scan').disabled = false;
    });
  }

  function stamp(now) {
    function p(n) { return String(n).padStart(2, '0'); }
    return String(now.getFullYear())
      + p(now.getMonth() + 1)
      + p(now.getDate())
      + '-'
      + p(now.getHours())
      + p(now.getMinutes())
      + p(now.getSeconds());
  }

  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportAs(format) {
    var table = selectedTable();
    var count = table && table.rows ? table.rows.length : 0;
    var gate = quotaApi.assessExport(storage(), new Date(), count);
    if (!gate.ok) {
      if (gate.error === 'row-cap') {
        setStatusCode('error', 'row-cap', { rows: gate.rowCount, maxRows: gate.maxRows });
      } else if (gate.error === 'quota') setStatusCode('error', 'quota-block');
      else setStatusCode('error', gate.error || 'no-data-rows');
      renderQuota();
      renderActions();
      return;
    }
    var now = new Date();
    var filename = 'table-' + table.index + '-' + stamp(now) + (format === 'xlsx' ? '.xlsx' : '.csv');
    var blob;
    try {
      if (format === 'xlsx') {
        var bytes = xlsxApi.buildXlsx(table.columns, table.rows, { sheetName: '导出' });
        blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      } else {
        var text = csvApi.buildCsv(table.columns, table.rows);
        blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      }
    } catch (err) {
      setStatusCode('error', 'export-failed');
      return;
    }
    var spent = quotaApi.consumeExport(storage(), now);
    if (!spent.ok) {
      setStatusCode('error', 'quota-block');
      renderQuota();
      renderActions();
      return;
    }
    downloadBlob(filename, blob);
    lastExportName = filename;
    renderQuota();
    renderActions();
    var status = document.getElementById('status');
    status.dataset.kind = 'ok';
    status.dataset.code = 'exported';
    showStatus('ok', statusExported());
  }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'zh';
    try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* ignore */ }
    applyCopy();
  }

  function applyLicense(raw) {
    var result = quotaApi.saveLicense(storage(), new Date(), raw);
    var input = document.getElementById('license-input');
    if (result.ok && result.unlocked) input.value = result.state.licenseNote;
    if (result.cleared && result.ok) input.value = '';
    renderLicense();
    renderQuota();
    renderActions();
    if (!result.ok) setStatusCode('error', 'invalid-license');
    else if (result.cleared) setStatusCode('info', 'license-cleared');
    else setStatusCode('ok', 'license-unlocked');
  }

  document.getElementById('lang-zh').addEventListener('click', function () { setLang('zh'); });
  document.getElementById('lang-en').addEventListener('click', function () { setLang('en'); });
  document.getElementById('scan').addEventListener('click', scan);
  document.getElementById('export-csv').addEventListener('click', function () { exportAs('csv'); });
  document.getElementById('export-xlsx').addEventListener('click', function () { exportAs('xlsx'); });
  document.getElementById('license-form').addEventListener('submit', function (event) {
    event.preventDefault();
    applyLicense(document.getElementById('license-input').value);
  });
  document.getElementById('license-clear').addEventListener('click', function () {
    applyLicense('');
  });

  lang = readLang();
  applyCopy();
  scan();
})();
