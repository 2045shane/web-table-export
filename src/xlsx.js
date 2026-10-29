/**
 * Minimal .xlsx writer (Office Open XML, ZIP method STORE).
 * No third-party dependency. Every cell is an inline string so order
 * numbers and leading zeros are not coerced.
 */
(function (root) {
  'use strict';

  var encoder = new TextEncoder();

  function crc32(bytes) {
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (var bit = 0; bit < 8; bit++) {
        var mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xedb88320 & mask);
      }
    }
    return (~crc) >>> 0;
  }

  function u16(n) {
    var b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, true);
    return b;
  }

  function u32(n) {
    var b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  }

  function concat(parts) {
    var len = 0;
    for (var i = 0; i < parts.length; i++) len += parts[i].length;
    var out = new Uint8Array(len);
    var offset = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], offset);
      offset += parts[j].length;
    }
    return out;
  }

  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colLetter(index) {
    var n = index + 1;
    var s = '';
    while (n > 0) {
      var rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function sheetName(name) {
    var s = String(name || '导出').replace(/[:\\/?*\[\]]/g, ' ').trim() || '导出';
    return s.slice(0, 31);
  }

  function buildSheetXml(columns, rows) {
    var width = columns.length;
    var lastCol = colLetter(width - 1);
    var lastRow = rows.length + 1;
    var xml = [];
    xml.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    xml.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    xml.push('<dimension ref="A1:' + lastCol + lastRow + '"/>');
    xml.push('<sheetData>');
    function rowXml(r, values) {
      var cells = [];
      for (var c = 0; c < width; c++) {
        var ref = colLetter(c) + r;
        cells.push(
          '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
            xmlEscape(values[c]) +
            '</t></is></c>'
        );
      }
      return '<row r="' + r + '">' + cells.join('') + '</row>';
    }
    xml.push(rowXml(1, columns));
    for (var i = 0; i < rows.length; i++) {
      var values = [];
      for (var c = 0; c < width; c++) values.push(rows[i][columns[c]] == null ? '' : rows[i][columns[c]]);
      xml.push(rowXml(i + 2, values));
    }
    xml.push('</sheetData></worksheet>');
    return xml.join('');
  }

  function workbookXml(name) {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + xmlEscape(sheetName(name)) + '" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>'
    );
  }

  function contentTypesXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'
    );
  }

  function rootRels() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
    );
  }

  function workbookRels() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>'
    );
  }

  function stylesXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
      '</styleSheet>'
    );
  }

  function zipStore(files) {
    var locals = [];
    var centrals = [];
    var offset = 0;
    for (var i = 0; i < files.length; i++) {
      var nameBytes = encoder.encode(files[i].name);
      var data = encoder.encode(files[i].data);
      var crc = crc32(data);
      var local = concat([
        u32(0x04034b50),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
        data,
      ]);
      locals.push(local);
      centrals.push(concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]));
      offset += local.length;
    }
    var central = concat(centrals);
    var eocd = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(central.length),
      u32(offset),
      u16(0),
    ]);
    return concat(locals.concat([central, eocd]));
  }

  function buildXlsx(columns, rows, options) {
    if (!columns || !columns.length || !rows || !rows.length) {
      throw new Error('no-rows');
    }
    var name = options && options.sheetName;
    var files = [
      { name: '[Content_Types].xml', data: contentTypesXml() },
      { name: '_rels/.rels', data: rootRels() },
      { name: 'xl/workbook.xml', data: workbookXml(name) },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRels() },
      { name: 'xl/styles.xml', data: stylesXml() },
      { name: 'xl/worksheets/sheet1.xml', data: buildSheetXml(columns, rows) },
    ];
    return zipStore(files);
  }

  var api = { buildXlsx: buildXlsx, xmlEscape: xmlEscape };
  root.WebTableExportXlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
