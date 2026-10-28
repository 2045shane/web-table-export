/**
 * UTF-8 CSV (BOM + CRLF) so Excel opens Chinese text.
 * Cells that look like formulas are prefixed with a quote so they stay text.
 */
(function (root) {
  'use strict';

  function csvCell(value) {
    var s = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(s) || s.charAt(0) === '\t' || s.charAt(0) === '\r') {
      s = "'" + s;
    }
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildCsv(columns, rows) {
    if (!columns || !columns.length || !rows || !rows.length) {
      throw new Error('no-rows');
    }
    var lines = [columns.map(csvCell).join(',')];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = [];
      for (var c = 0; c < columns.length; c++) cells.push(csvCell(row[columns[c]]));
      lines.push(cells.join(','));
    }
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  var api = { buildCsv: buildCsv, csvCell: csvCell };
  root.WebTableExportCsv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
