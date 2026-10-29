/**
 * Popup copy. Chinese is the primary language. Daily and row numbers are not
 * written here; the popup fills them from the named constants in quota.js.
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
      quota: '每天 {limit} 次 · 今日剩余 {remaining}',
      quotaPaid: '已解锁 · 每天 {limit} 次 · 今日剩余 {remaining}',
      quotaHint: '次数按本机日期计算，次日恢复。成功导出 CSV 或 Excel 各算 1 次。',
      quotaHintPaid: '已解锁的次数只记在这台浏览器里，没有服务器配额。清除许可码即回到免费档。',
      rowCapFree: '免费单次最多 {maxRows} 行。超过不会截断下载。',
      rowCapPaid: '单次行数本机无硬顶。免费档是每天 {freeLimit} 次、单次最多 {freeRows} 行。',
      capUnlock: '今日剩余 {remaining}。有问题请联系我。小红书私信「珊哥爱读书」，或在下方输入许可码。',
      found: '找到 {count} 个表格，请选择：',
      exportCsv: '导出 CSV',
      exportXlsx: '导出 Excel',
      exportNote: 'CSV 和 Excel 免费档都能下载，都是完整文件。超过单次行数或用完当日次数时，不会下载空文件，也不会悄悄截断。',
      rows: '{rows} 行 · {cols} 列',
      overCap: '超过免费单次 {maxRows} 行',
      exported: '已开始下载 {name}',
      quotaBlock: '今天的 {limit} 次免费导出已经用完，今日剩余 {remaining}。导出已停用，不会下载文件。',
      quotaBlockPaid: '今天的 {limit} 次导出已经用完，今日剩余 {remaining}。导出已停用，不会下载文件。',
      ctaNote: '',
      licenseTitle: '许可码',
      licenseHelp: '许可码只保存在这台浏览器，不会上传，也不经过支付。校验通过后，每日次数和单次行数按已解锁档生效。没有码可以小红书私信「珊哥爱读书」。留空保存，或点清除，回到免费档。',
      licenseSave: '保存',
      licenseClear: '清除',
      licensePlaceholder: '输入许可码（不会上传）',
      licenseEmpty: '当前是免费档。',
      licenseUnlocked: '已解锁。每日次数和单次行数已按付费档生效。',
      licenseInvalidStored: '保存的内容不是有效许可码，仍按免费档计算。',
      licenseUnlockedStatus: '许可码有效，已解锁更高的每日次数，并且本机不再限制单次行数。',
      licenseClearedStatus: '已清除许可码，回到免费档。',
      langLabel: '语言',
      errors: {
        'no-visible-table': '当前页没有可导出的可见表格。请打开带表格的网页后再试。不会下载空文件。',
        'no-data-rows': '看到了表格结构，但没有可见数据行。已停止，不会下载空文件。',
        'unreadable-page': '读不到这个标签页。请从工具栏「导出」打开，并停在普通网页（http 或 https）上。浏览器内置页和扩展商店页不能读取。本地文件要在扩展详情里打开「允许访问文件网址」。',
        'no-tab': '没有找到当前标签页。',
        'quota': '今天的免费次数已用完，导出已停用。不会下载文件。',
        'export-failed': '文件没有生成，这次不计入次数。请再扫描一次。',
        'invalid-license': '许可码无效，没有解锁。请核对后再保存，或小红书私信「珊哥爱读书」。当前是免费档。',
        'row-cap': '这张表有 {rows} 行，超过免费单次最多 {maxRows} 行。已停止导出，不会下载被截断的文件。',
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
      quota: '{limit} per day · {remaining} left today',
      quotaPaid: 'Unlocked · {limit} per day · {remaining} left today',
      quotaHint: 'The count uses this device’s date and resets tomorrow. One successful CSV or Excel download uses 1.',
      quotaHintPaid: 'The unlocked count stays in this browser. There is no server quota. Clear the license to return to the free tier.',
      rowCapFree: 'Free plan: up to {maxRows} rows per export. Over the cap, nothing is downloaded.',
      rowCapPaid: 'No per-export row cap on this device. Free tier is {freeLimit} per day and {freeRows} rows per export.',
      capUnlock: '{remaining} left today. 有问题请联系我. Xiaohongshu DM 「珊哥爱读书」, or paste a license below.',
      found: '{count} table(s). Choose one:',
      exportCsv: 'Export CSV',
      exportXlsx: 'Export Excel',
      exportNote: 'CSV and Excel both stay available on the free tier, and both are complete files. Over the row cap or out of today’s exports, nothing is downloaded and rows are not silently cut.',
      rows: '{rows} rows · {cols} columns',
      overCap: 'over the free cap of {maxRows} rows',
      exported: 'Download started: {name}',
      quotaBlock: 'Today’s {limit} free exports are used up. Remaining: {remaining}. Export is off, and no file was downloaded.',
      quotaBlockPaid: 'Today’s {limit} exports are used up. Remaining: {remaining}. Export is off, and no file was downloaded.',
      ctaNote: 'No in-app payment and no store purchase in this cut.',
      licenseTitle: 'License',
      licenseHelp: 'The license stays in this browser. It is not uploaded and there is no payment step. A valid code raises today’s export count and the per-export row cap. To ask for a code, send a Xiaohongshu DM to 「珊哥爱读书」. Save an empty field, or press Clear, to return to the free tier.',
      licenseSave: 'Save',
      licenseClear: 'Clear',
      licensePlaceholder: 'License code (not uploaded)',
      licenseEmpty: 'Free tier.',
      licenseUnlocked: 'Unlocked. Daily exports and the row cap now use the paid tier.',
      licenseInvalidStored: 'The saved text is not a valid license. The free tier still applies.',
      licenseUnlockedStatus: 'License accepted. The higher daily count is on, and this device has no per-export row cap.',
      licenseClearedStatus: 'License cleared. You are back on the free tier.',
      langLabel: 'Language',
      errors: {
        'no-visible-table': 'No visible table on this page. Open a page that shows a table and try again. Nothing was downloaded.',
        'no-data-rows': 'A table structure was found, but it has no visible data rows. Nothing was downloaded.',
        'unreadable-page': 'This tab cannot be read. Open Export from the toolbar while a normal http(s) page is active. Browser internal pages and the extension store cannot be read. Local files need “Allow access to file URLs” on the extension’s details page.',
        'no-tab': 'No current tab was found.',
        'quota': 'Today’s free exports are used up. Export is off. Nothing was downloaded.',
        'export-failed': 'The file was not created. This attempt was not counted. Scan again.',
        'invalid-license': 'That license code is not valid, so nothing was unlocked. Check it and save again, or send a Xiaohongshu DM to 「珊哥爱读书」. You are on the free tier.',
        'row-cap': 'This table has {rows} rows, over the free cap of {maxRows}. Export stopped. A truncated file was not downloaded.',
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
