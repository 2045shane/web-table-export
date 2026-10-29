# 自测记录

Cut：`WEB-EXPORT-CUT-2026-10-28-v1`  
日期：2026-10-28  
解析器：`visible-table-v1`

## 已完成

### 单元测试与夹具（AC-S02）

```bash
npm install
npm test
```

21 项通过。固定夹具 `fixtures/ac-s02-visible-tables.html` 的解析结果与 `fixtures/ac-s02-visible-tables.expected.json` 一致。隐藏表、`display:none` 行、固定列克隆不会出现在 JSON 里。

同一套 `src/parser.js` 又在本机 Google Chrome 156（headless）里对夹具跑过一遍，JSON 与提交的期望文件一致：

| 页面 | 结果 |
| --- | --- |
| `fixtures/ac-s02-visible-tables.html` | 4 张表，与期望 JSON 一致 |
| `fixtures/ac-s02-empty.html` | `no-visible-table`，不产生行 |
| `fixtures/ac-s02-header-only.html` | `no-data-rows`，不产生行 |
| `demo/orders.html` | 1 个 `html-table`，4 行 |
| `demo/admin.html` | `admin-widget` + `admin-grid` |
| `demo/empty.html` | `no-visible-table` |

CSV 带 UTF-8 BOM，公式开头的格子会加引号。`.xlsx` 能被 Python `zipfile` 打开，工作表里是 inline string，含中文和 `A & B`。配额测试覆盖第 4 次拒绝、许可码不增加次数、次日清零。`FREE_DAILY_EXPORT_LIMIT` 只在 `src/quota.js` 写成 `3`。

### 权限

`manifest.json` 的 `permissions` 只有 `activeTab` 和 `scripting`，没有 `host_permissions`。

## 还没在弹出窗口里点完的部分

本机是 Google Chrome 正式版。它会忽略 `--load-extension` / `--disable-extensions-except`（日志原文：`--load-extension is not allowed in Google Chrome, ignoring.`）。自动化去点「Select Folder」时，按钮能高亮但点下去没有加载扩展。因此下面这些界面截图还没有放进本记录：

- 弹出窗口中文 / 英文
- 普通表、后台表各导出一次
- CSV 与 Excel 两个按钮的下载结果
- 用满 3 次之后的「有问题请联系我」
- `chrome://extensions` 详情里的权限说明

手动加载步骤在 README「加载已解压的扩展程序」。加载时选仓库根目录，不要选 `src/`。示例页需要先在仓库根目录执行 `python3 -m http.server 8765`，再打开 `http://127.0.0.1:8765/demo/orders.html`。直接双击 HTML 得到的是 `file://`，Chrome 默认不让扩展读取。
