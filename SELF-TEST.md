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

CSV 带 UTF-8 BOM，公式开头的格子会加引号。`.xlsx` 能被 Python `zipfile` 打开，工作表里是 inline string，含中文和 `A & B`。配额测试覆盖第 4 次拒绝、次日清零。`FREE_DAILY_EXPORT_LIMIT` 只在 `src/quota.js` 写成 `3`。

2026-10-28 那一版里，许可码只是备注，不会增加次数。这一点已由下面的 `PLUGIN-PAYWALL-CUT-2026-10-29-v1` 改掉：对得上校验的 `licenseNote` 会抬升配额。

## PLUGIN-PAYWALL-CUT-2026-10-29-v1

日期：2026-10-29

选择的数字：免费每天 3 次、单次最多 100 行；有效许可码后每天 1000 次、单次行数本机无硬顶（`PAID_EXPORT_MAX_ROWS = null`）。

```bash
npm test
```

`npm test` 先跑 `scripts/check-paywall-invariants.mjs`（`npm run lint`），再跑 node:test。不变量失败则整次失败。通过时先打印 `paywall invariants ok`，然后 31 项测试通过。其中和这一刀直接相关的是：

- 免费第 4 次被 `quota` 挡住，剩余 0，不生成文件
- 旧的纯文本 `licenseNote`（例如 `CONTACT-珊哥爱读书`）不解锁
- `WTE1.PAID.3c5a2030` 把当日上限从 3 抬到 1000，并取消单次行数硬顶；第 4 次和 101 行、5000 行都可以通过
- 清除许可码，或再保存一个无效码，回到免费档；无效输入有中文和英文错误
- 已解锁用满 1000 次后再次被挡住，剩余 0
- jsdom 打开真实的 `src/popup.html`：主路径是「每天 3 次」和今日剩余，以及「免费单次最多 100 行」；触顶后 CTA「有问题请联系我」/「珊哥爱读书」和许可码输入都在；101 行在免费档不会创建 Blob，解锁后 CSV 含全部 101 行，Excel 以 `PK` 开头
- `src/` 与 `manifest.json` 没有 Shane API key，依赖里没有支付 SDK，也没有新的服务端配额

Chrome 正式版会忽略 `--load-extension`，所以这些界面断言跑在弹出窗口自己的脚本上，而不是一个已装进浏览器的扩展里。手动加载步骤仍见 README。

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
