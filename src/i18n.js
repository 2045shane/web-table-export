/**
 * Popup copy. Chinese is the primary language. The daily number is not
 * written here; the popup fills {limit} from FREE_DAILY_EXPORT_LIMIT.
 */
(function (root) {
  'use strict';

  var STR = {
    zh: {
      title: '网页表格导出',
      subtitle: '导出当前页看得见的表格',
      boundary: '只读取当前页里未隐藏的表格行，不翻页、不自动滚动加载。',
      scan: '重新扫描',
      scanning: '正在读取当前页…',
      quota: '今日剩余 {remaining} / {limit} 次',
      quotaHint: '免费额度每天 {limit} 次，次日恢复。',
      found: '找到 {count} 个表格，请选择：',
      exportCsv: '导出 CSV',
      exportXlsx: '导出 Excel',
      exportNote: 'CSV 和 Excel 都是真实文件。每点一次导出，计入 1 次。',
      rows: '{rows} 行 · {cols} 列',
      exported: '已开始下载 {name}',
      quotaBlock: '今天的 {limit} 次免费导出已经用完。',
      ctaNote: '',
      licenseTitle: '许可码（占位）',
      licenseHelp: '本版本不连接支付，也不核验许可码。码只保存在这台浏览器里，不能增加次数。需要开通请小红书私信「珊哥爱读书」。',
      licenseSave: '保存',
      licensePlaceholder: '输入许可码（不会上传）',
      licenseEmpty: '尚未填写',
      licenseSaved: '已保存在本地（未核验，不增加次数）',
      langLabel: '语言',
      errors: {
        'no-visible-table': '当前页没有可导出的可见表格。请打开带表格的网页后再试。不会下载空文件。',
        'no-data-rows': '看到了表格结构，但没有可见数据行。已停止，不会下载空文件。',
        'unreadable-page': '读不到这个标签页。请从工具栏「导出」打开，并停在普通网页（http 或 https）上。浏览器内置页和扩展商店页不能读取。本地文件要在扩展详情里打开「允许访问文件网址」。',
        'no-tab': '没有找到当前标签页。',
        'quota': '今天的免费次数已用完，导出已停用。',
        'export-failed': '文件没有生成，这次不计入次数。请再扫描一次。',
      },
      sources: {
        'html-table': '网页表格',
        'admin-widget': '后台表格',
        'admin-grid': '后台网格',
        'admin-rows': '后台行',
      },
    },
    en: {
      title: 'Web Table Export',
      subtitle: 'Export tables you can already see',
      boundary: 'Reads unhidden rows on this page only. It does not change pages or auto-scroll for more rows.',
      scan: 'Scan again',
      scanning: 'Reading this page…',
      quota: '{remaining} / {limit} left today',
      quotaHint: 'Free limit is {limit} exports per day. It resets tomorrow.',
      found: '{count} table(s). Choose one:',
      exportCsv: 'Export CSV',
      exportXlsx: 'Export Excel',
      exportNote: 'CSV and Excel are both real files. Each export uses 1 credit.',
      rows: '{rows} rows · {cols} columns',
      exported: 'Download started: {name}',
      quotaBlock: 'Today’s {limit} free exports are used up.',
      ctaNote: 'Questions? Contact me. This cut does not take payment.',
      licenseTitle: 'License code (stub)',
      licenseHelp: 'This version does not connect to a payment service and does not check the code. It stays in this browser and does not add exports. To ask about access, send a Xiaohongshu DM to 「珊哥爱读书」.',
      licenseSave: 'Save',
      licensePlaceholder: 'License code (not uploaded)',
      licenseEmpty: 'Empty',
      licenseSaved: 'Saved on this device (not verified, no extra exports)',
      langLabel: 'Language',
      errors: {
        'no-visible-table': 'No visible table on this page. Open a page that shows a table and try again. Nothing was downloaded.',
        'no-data-rows': 'A table structure was found, but it has no visible data rows. Nothing was downloaded.',
        'unreadable-page': 'This tab cannot be read. Open Export from the toolbar while a normal http(s) page is active. Browser internal pages and the extension store cannot be read. Local files need “Allow access to file URLs” on the extension’s details page.',
        'no-tab': 'No current tab was found.',
        'quota': 'The free limit is used up. Export is disabled.',
        'export-failed': 'The file was not created. This attempt was not counted. Scan again.',
      },
      sources: {
        'html-table': 'HTML table',
        'admin-widget': 'Admin table',
        'admin-grid': 'Admin grid',
        'admin-rows': 'Admin rows',
      },
    },
  };

  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (_m, key) {
      return vars && vars[key] != null ? String(vars[key]) : '';
    });
  }

  var api = { STR: STR, fill: fill };
  root.WebTableExportI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
