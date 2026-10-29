/**
 * Visible-table parser for cut WEB-EXPORT-CUT-2026-10-28-v1.
 *
 * One ruleset. The popup injects this file into the current tab and calls
 * WebTableExport.parseDocument(document). Tests call the same function.
 * Column names are documented in the README under 列名规则.
 *
 * "Visible" means present in this document and not hidden
 * (hidden, display:none, visibility hidden/collapse, opacity 0,
 * content-visibility:hidden, zero-size, or parked off the left edge).
 * Rows already in the DOM below the window are included.
 * This file does not scroll, paginate, or request other pages.
 */
(function (root) {
  'use strict';

  var PARSER_ID = 'visible-table-v1';
  var WIDGET_SELECTOR = '.el-table, .ant-table, .arco-table, .n-data-table, .vxe-table, [data-table-widget]';
  var FIXED_SELECTOR = '.el-table__fixed, .el-table__fixed-right, .el-table__fixed-left, .ant-table-fixed-left, .ant-table-fixed-right';
  var ROW_SELECTOR = '.el-table__row, .ant-table-row, .ag-row, .table-row, .data-row';
  var CELL_SELECTOR = '.el-table__cell, .ant-table-cell, .ag-cell, .table-cell, .data-cell';

  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function stabilizeColumns(rawNames) {
    var counts = new Map();
    return rawNames.map(function (raw, i) {
      var name = normalizeText(raw);
      if (!name) name = 'column_' + (i + 1);
      var seen = counts.get(name) || 0;
      counts.set(name, seen + 1);
      return seen === 0 ? name : name + '_' + (seen + 1);
    });
  }

  function classNameOf(el) {
    if (!el) return '';
    if (typeof el.className === 'string') return el.className;
    if (el.className && typeof el.className.baseVal === 'string') return el.className.baseVal;
    return el.getAttribute('class') || '';
  }

  function hasLayout(el) {
    var view = el.ownerDocument && el.ownerDocument.defaultView;
    if (!view || typeof el.getBoundingClientRect !== 'function') return false;
    var ua = (view.navigator && view.navigator.userAgent) || '';
    if (/jsdom/i.test(ua)) return false;
    return true;
  }

  function computedHidden(el) {
    try {
      var view = el.ownerDocument && el.ownerDocument.defaultView;
      if (!view || typeof view.getComputedStyle !== 'function') return false;
      var cs = view.getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return true;
      if (cs.opacity === '0') return true;
      if (cs.contentVisibility === 'hidden') return true;
      return false;
    } catch (err) {
      return false;
    }
  }

  function isEffectivelyHidden(el) {
    if (!el || el.nodeType !== 1) return true;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden) return true;
      if (n.getAttribute('aria-hidden') === 'true') return true;
      if (computedHidden(n)) return true;
    }
    if (!hasLayout(el)) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return true;
    if (rect.right < 0 && rect.left < -20) return true;
    return false;
  }

  function isSkipRow(el) {
    if (!el || el.nodeType !== 1) return true;
    if (isEffectivelyHidden(el)) return true;
    if (/\bant-table-measure-row\b/.test(classNameOf(el))) return true;
    return false;
  }

  function isFixedClone(table) {
    return !!(table.closest && table.closest(FIXED_SELECTOR));
  }

function controlNodeText(node) {
  if (!node || node.nodeType !== 1) return '';
  if (node.hidden || computedHidden(node)) return '';
  var tag = node.tagName;
  if (tag === 'TEXTAREA') return node.value || '';
  if (tag === 'SELECT') {
    var chosen = node.selectedOptions && node.selectedOptions[0];
    var fallback = node.querySelector('option[selected]') || node.querySelector('option');
    var opt = chosen || fallback;
    return opt ? (opt.textContent || '') : (node.value || '');
  }
  var type = (node.getAttribute('type') || 'text').toLowerCase();
  if (type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit' || type === 'file' || type === 'image' || type === 'reset') {
    return '';
  }
  return node.value || '';
}

function cellText(cell) {
  if (!cell || cell.nodeType !== 1) return '';
  if (cell.hidden || computedHidden(cell)) return '';
  var clone = cell.cloneNode(true);
  var liveControls = Array.prototype.slice.call(cell.querySelectorAll('textarea, select, input'));
  var cloneControls = Array.prototype.slice.call(clone.querySelectorAll('textarea, select, input'));
  cloneControls.forEach(function (node, index) {
    var shown = controlNodeText(liveControls[index] || node);
    node.replaceWith(clone.ownerDocument.createTextNode(shown));
  });
  clone.querySelectorAll('table, [role="grid"], [role="table"], script, style, svg, noscript, template').forEach(function (n) {
    n.remove();
  });
  clone.querySelectorAll('[aria-hidden="true"]').forEach(function (n) {
    if (!normalizeText(n.textContent)) n.remove();
  });
  var text = '';
  if (typeof clone.innerText === 'string') text = clone.innerText;
  if (!normalizeText(text)) text = clone.textContent || '';
  text = normalizeText(text);
  if (text) return text;
  var img = cell.querySelector('img[alt]');
  if (img && !img.hidden && !computedHidden(img)) return normalizeText(img.getAttribute('alt'));
  return '';
}

  function spanCount(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
  }

  function buildMatrix(logicalRows, repeatColspanText) {
    var occupied = new Map();
    var grid = [];
    logicalRows.forEach(function (row, r) {
      var line = [];
      var c = 0;
      function flush() {
        while (occupied.has(r + ':' + c)) {
          line[c] = occupied.get(r + ':' + c);
          c += 1;
        }
      }
      row.cells.forEach(function (cell) {
        flush();
        var cs = spanCount(cell.colSpan);
        var rs = spanCount(cell.rowSpan);
        for (var dc = 0; dc < cs; dc++) {
          var value = dc === 0 || repeatColspanText ? cell.text : '';
          line[c + dc] = value;
          for (var dr = 1; dr < rs; dr++) {
            var down = dc === 0 || repeatColspanText ? cell.text : '';
            occupied.set((r + dr) + ':' + (c + dc), down);
          }
        }
        c += cs;
      });
      flush();
      grid.push(line);
    });
    return grid;
  }

  function combineHeaderGrid(grid) {
    var width = 0;
    grid.forEach(function (row) {
      if (row.length > width) width = row.length;
    });
    var names = [];
    for (var c = 0; c < width; c++) {
      var parts = [];
      for (var r = 0; r < grid.length; r++) {
        var part = normalizeText(grid[r][c] || '');
        if (!part) continue;
        if (parts[parts.length - 1] === part) continue;
        parts.push(part);
      }
      names.push(parts.join(' / '));
    }
    return stabilizeColumns(names);
  }

  function extendColumns(columns, width) {
    var cols = columns.slice();
    var used = new Set(cols);
    for (var i = cols.length; i < width; i++) {
      var name = 'column_' + (i + 1);
      var n = 2;
      while (used.has(name)) {
        name = 'column_' + (i + 1) + '_' + n;
        n += 1;
      }
      used.add(name);
      cols.push(name);
    }
    return cols;
  }

  function rowsToObjects(columns, matrix) {
    var out = [];
    matrix.forEach(function (line) {
      var obj = {};
      var any = false;
      columns.forEach(function (col, i) {
        var value = line[i] == null ? '' : String(line[i]);
        obj[col] = value;
        if (value) any = true;
      });
      if (any) out.push(obj);
    });
    return out;
  }

  function isAutoName(name, index) {
    return name === 'column_' + (index + 1);
  }

  function dropTrailingEmptyGenerated(columns, rows) {
    var end = columns.length;
    while (end > 0) {
      var name = columns[end - 1];
      if (!isAutoName(name, end - 1)) break;
      var empty = rows.every(function (row) { return !row[name]; });
      if (!empty) break;
      end -= 1;
    }
    if (end === columns.length) return { columns: columns, rows: rows };
    if (end === 0) return { columns: [], rows: [] };
    var cols = columns.slice(0, end);
    var next = rows.map(function (row) {
      var obj = {};
      cols.forEach(function (col) { obj[col] = row[col] == null ? '' : row[col]; });
      return obj;
    }).filter(function (row) {
      return cols.some(function (col) { return row[col] !== ''; });
    });
    return { columns: cols, rows: next };
  }

  function finish(columns, matrix) {
    var width = columns ? columns.length : 0;
    matrix.forEach(function (line) {
      if (line.length > width) width = line.length;
    });
    var cols = columns && columns.length ? extendColumns(columns, width) : extendColumns([], width);
    var packed = dropTrailingEmptyGenerated(cols, rowsToObjects(cols, matrix));
    if (!packed.columns.length || !packed.rows.length) return null;
    return packed;
  }

  function trLogical(tr) {
    return {
      cells: Array.prototype.map.call(tr.cells, function (cell) {
        return {
          text: cellText(cell),
          colSpan: cell.colSpan,
          rowSpan: cell.rowSpan,
        };
      }),
    };
  }

  function headerRowCount(table, rowEls) {
    var thead = table.tHead;
    if (thead) {
      var n = Array.prototype.filter.call(thead.rows, function (row) {
        return rowEls.indexOf(row) !== -1;
      }).length;
      if (n > 0) return n;
    }
    var first = rowEls[0];
    if (!first) return 0;
    var cells = Array.prototype.slice.call(first.cells || []);
    if (cells.length && cells.every(function (cell) { return cell.tagName === 'TH'; })) return 1;
    return 0;
  }

  function visibleRowElements(table) {
    return Array.prototype.filter.call(table.rows || [], function (row) {
      return !isSkipRow(row);
    });
  }

  function parseFromRows(headerEls, dataEls) {
    var columns = null;
    if (headerEls.length) {
      columns = combineHeaderGrid(buildMatrix(headerEls.map(trLogical), true));
    }
    var matrix = buildMatrix(dataEls.map(trLogical), false);
    return finish(columns, matrix);
  }

  function parseHtmlTable(table) {
    var rowEls = visibleRowElements(table);
    if (!rowEls.length) return null;
    var headerCount = headerRowCount(table, rowEls);
    return parseFromRows(rowEls.slice(0, headerCount), rowEls.slice(headerCount));
  }

  function tableParts(table) {
    var rowEls = visibleRowElements(table);
    var headerCount = headerRowCount(table, rowEls);
    return {
      headerCount: headerCount,
      dataCount: Math.max(0, rowEls.length - headerCount),
      rowEls: rowEls,
    };
  }

function mergeWidget(tables) {
  var full = [];
  var headers = [];
  var bodies = [];
  tables.forEach(function (table) {
    if (isEffectivelyHidden(table) || isFixedClone(table)) return;
    var parts = tableParts(table);
    if (!parts.rowEls.length) return;
    if (parts.headerCount > 0 && parts.dataCount > 0) full.push(table);
    else if (parts.headerCount > 0) headers.push(table);
    else if (parts.dataCount > 0) bodies.push(table);
  });

  var split = null;
  if (bodies.length) {
    var body = bodies.slice().sort(function (a, b) {
      return tableParts(b).dataCount - tableParts(a).dataCount;
    })[0];
    var bodyParts = tableParts(body);
    var dataEls = bodyParts.rowEls.slice(bodyParts.headerCount);
    var headerNames = null;
    if (headers.length) {
      var header = headers.slice().sort(function (a, b) {
        return tableParts(b).rowEls.length - tableParts(a).rowEls.length;
      })[0];
      var headerParts = tableParts(header);
      var headerEls = headerParts.rowEls.slice(0, headerParts.headerCount);
      headerNames = combineHeaderGrid(buildMatrix(headerEls.map(trLogical), true));
    }
    split = finish(headerNames, buildMatrix(dataEls.map(trLogical), false));
  }

    var fullParsed = full.map(parseHtmlTable).filter(Boolean);
    var fullRows = fullParsed.reduce(function (n, item) { return n + item.rows.length; }, 0);
    var splitRows = split ? split.rows.length : 0;
    if (fullParsed.length && fullRows >= splitRows) {
      return fullParsed.map(function (item) { return item; });
    }
    return split ? [split] : [];
  }

  function labelFor(el, columns) {
    var aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria && normalizeText(aria)) return normalizeText(aria);
    if (el.tagName === 'TABLE' && el.caption && normalizeText(el.caption.textContent)) {
      return normalizeText(el.caption.textContent);
    }
    return columns[0] || '';
  }

  function record(el, source, parsed) {
    return {
      root: el,
      source: source,
      rootId: el.id || null,
      label: labelFor(el, parsed.columns),
      columns: parsed.columns,
      rows: parsed.rows,
    };
  }

  function extractWidgetsAndTables(doc) {
    var records = [];
    var sawEmpty = false;
    var consumed = new Set();
    var widgets = Array.prototype.filter.call(doc.querySelectorAll(WIDGET_SELECTOR), function (widget) {
      return !(widget.parentElement && widget.parentElement.closest(WIDGET_SELECTOR));
    });

    widgets.forEach(function (widget) {
      var inside = Array.prototype.slice.call(widget.querySelectorAll('table'));
      inside.forEach(function (table) { consumed.add(table); });
      if (isEffectivelyHidden(widget)) return;
      var merged = mergeWidget(inside);
      if (merged.length) {
        merged.forEach(function (parsed) {
          records.push(record(widget, 'admin-widget', parsed));
        });
        return;
      }
      inside.forEach(function (table) {
        if (!isFixedClone(table)) consumed.delete(table);
      });
      if (inside.some(function (table) { return !isEffectivelyHidden(table) && visibleRowElements(table).length; })) {
        sawEmpty = true;
      }
    });

    Array.prototype.forEach.call(doc.querySelectorAll('table'), function (table) {
      if (consumed.has(table) || isFixedClone(table) || isEffectivelyHidden(table)) return;
      var parsed = parseHtmlTable(table);
      if (parsed) records.push(record(table, 'html-table', parsed));
      else if (visibleRowElements(table).length) sawEmpty = true;
    });

    return { records: records, sawEmpty: sawEmpty };
  }

  function ariaSpan(el, name) {
    return spanCount(el.getAttribute(name));
  }

  function logicalFromElements(cellEls) {
    return {
      cells: cellEls.map(function (cell) {
        return {
          text: cellText(cell),
          colSpan: ariaSpan(cell, 'aria-colspan'),
          rowSpan: ariaSpan(cell, 'aria-rowspan'),
        };
      }),
    };
  }

function coveredByExportedTable(el, records) {
  var table = el.closest('table');
  if (!table) return false;
  return records.some(function (item) {
    return item.root === table || (item.root.contains && item.root.contains(table));
  });
}

function extractGrids(doc, tableRecords) {
  var records = [];
  var sawEmpty = false;
  var roots = Array.prototype.filter.call(doc.querySelectorAll('[role="grid"], [role="table"]'), function (el) {
    if (coveredByExportedTable(el, tableRecords)) return false;
    if (el.parentElement && el.parentElement.closest('[role="grid"], [role="table"]')) return false;
    if (isEffectivelyHidden(el)) return false;
    return true;
  });
    roots.forEach(function (rootEl) {
      var rows = Array.prototype.filter.call(rootEl.querySelectorAll('[role="row"]'), function (row) {
        if (!row.parentElement || row.parentElement.closest('[role="grid"], [role="table"]') !== rootEl) return false;
        return !isSkipRow(row);
      });
      var logical = rows.map(function (row) {
        var cells = Array.prototype.filter.call(
          row.querySelectorAll('[role="cell"], [role="gridcell"], [role="columnheader"], [role="rowheader"]'),
          function (cell) {
            return cell.parentElement && cell.parentElement.closest('[role="row"]') === row;
          }
        );
        return { row: row, cells: Array.prototype.slice.call(cells) };
      }).filter(function (item) { return item.cells.length; });
      var headerCount = 0;
      while (headerCount < logical.length) {
        var headerish = logical[headerCount].cells.every(function (cell) {
          var role = cell.getAttribute('role');
          return role === 'columnheader' || role === 'rowheader';
        });
        if (!headerish) break;
        headerCount += 1;
      }
      var headerLogical = logical.slice(0, headerCount).map(function (item) {
        return logicalFromElements(item.cells);
      });
      var dataLogical = logical.slice(headerCount).map(function (item) {
        return logicalFromElements(item.cells);
      });
      var columns = headerLogical.length ? combineHeaderGrid(buildMatrix(headerLogical, true)) : null;
      var parsed = finish(columns, buildMatrix(dataLogical, false));
      if (parsed) records.push(record(rootEl, 'admin-grid', parsed));
      else if (logical.length) sawEmpty = true;
    });
    return { records: records, sawEmpty: sawEmpty };
  }

  function isClassHeader(el) {
    return /(?:^|\s)(?:header|table-header|is-header)(?:\s|$)/i.test(classNameOf(el));
  }

  function extractClassRows(doc) {
    var records = [];
    var sawEmpty = false;
    var rows = Array.prototype.filter.call(doc.querySelectorAll(ROW_SELECTOR), function (row) {
      if (row.closest('table')) return false;
      if (row.closest('[role="grid"], [role="table"]')) return false;
      if (isSkipRow(row)) return false;
      return true;
    });
    var groups = new Map();
    rows.forEach(function (row) {
      var parent = row.parentElement;
      if (!parent || isEffectivelyHidden(parent)) return;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(row);
    });
    groups.forEach(function (group, parent) {
      var logical = group.map(function (row) {
        var cells = Array.prototype.filter.call(row.querySelectorAll(CELL_SELECTOR), function (cell) {
          return cell.closest(ROW_SELECTOR) === row;
        });
        return { row: row, cells: Array.prototype.slice.call(cells) };
      }).filter(function (item) {
        return item.cells.length >= 2;
      });
      if (logical.length < 2 && !(logical.length === 1 && !isClassHeader(logical[0].row))) {
        if (group.length) sawEmpty = true;
        return;
      }
      var headerCount = 0;
      while (headerCount < logical.length && isClassHeader(logical[headerCount].row)) headerCount += 1;
      if (headerCount === logical.length) {
        sawEmpty = true;
        return;
      }
      var headerLogical = logical.slice(0, headerCount).map(function (item) {
        return logicalFromElements(item.cells);
      });
      var dataLogical = logical.slice(headerCount).map(function (item) {
        return logicalFromElements(item.cells);
      });
      if (!dataLogical.length) {
        sawEmpty = true;
        return;
      }
      var columns = headerLogical.length ? combineHeaderGrid(buildMatrix(headerLogical, true)) : null;
      var parsed = finish(columns, buildMatrix(dataLogical, false));
      if (parsed && parsed.columns.length >= 2) records.push(record(parent, 'admin-rows', parsed));
      else sawEmpty = true;
    });
    return { records: records, sawEmpty: sawEmpty };
  }

  function compareRoots(a, b) {
    if (a === b) return 0;
    var pos = a.compareDocumentPosition(b);
    if (pos & 4) return -1;
    if (pos & 2) return 1;
    return 0;
  }

  function parseDocument(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return { ok: false, error: 'no-visible-table', parserId: PARSER_ID, tables: [] };
    }
    var fromTables = extractWidgetsAndTables(doc);
    var fromGrids = extractGrids(doc, fromTables.records);
    var fromRows = extractClassRows(doc);
    var records = fromTables.records.concat(fromGrids.records, fromRows.records);
    records.sort(function (a, b) { return compareRoots(a.root, b.root); });
    if (!records.length) {
      var sawEmpty = fromTables.sawEmpty || fromGrids.sawEmpty || fromRows.sawEmpty;
      return {
        ok: false,
        error: sawEmpty ? 'no-data-rows' : 'no-visible-table',
        parserId: PARSER_ID,
        tables: [],
      };
    }
    return {
      ok: true,
      error: null,
      parserId: PARSER_ID,
      tables: records.map(function (item, index) {
        return {
          index: index + 1,
          source: item.source,
          rootId: item.rootId,
          label: item.label,
          columns: item.columns,
          rows: item.rows,
        };
      }),
    };
  }

  var api = {
    PARSER_ID: PARSER_ID,
    parseDocument: parseDocument,
    normalizeText: normalizeText,
    stabilizeColumns: stabilizeColumns,
  };
  root.WebTableExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
