/**
 * Load the fixed fixtures in real Chrome and compare them to the committed JSON.
 * This does not replace the popup; it checks the same parser.js against Blink.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parserSource = readFileSync(path.join(root, 'src/parser.js'), 'utf8');
const port = 8765;
const debugPort = 9333;

const server = spawn('python3', ['-m', 'http.server', String(port)], {
  cwd: root,
  stdio: 'ignore',
});
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${debugPort}`,
  '--user-data-dir=/tmp/wte-chrome-parse',
  '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore' });

let sessionId = 0;
const pending = new Map();

function send(ws, method, params = {}, session) {
  const id = ++sessionId;
  const message = { id, method, params };
  if (session) message.sessionId = session;
  ws.send(JSON.stringify(message));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

async function main() {
  let version = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.json());
      break;
    } catch (err) {
      await delay(300);
    }
  }
  if (!version) throw new Error('Chrome DevTools did not open');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const waiter = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) waiter.reject(new Error(JSON.stringify(data.error)));
    else waiter.resolve(data.result);
  });

  const cases = [
    ['fixtures/ac-s02-visible-tables.html', 'fixtures/ac-s02-visible-tables.expected.json'],
    ['fixtures/ac-s02-empty.html', null],
    ['fixtures/ac-s02-header-only.html', null],
    ['demo/orders.html', null],
    ['demo/admin.html', null],
    ['demo/empty.html', null],
  ];

  for (const [page, expectedFile] of cases) {
    const created = await send(ws, 'Target.createTarget', {
      url: `http://127.0.0.1:${port}/${page}`,
    });
    const attached = await send(ws, 'Target.attachToTarget', { targetId: created.targetId, flatten: true });
    const session = attached.sessionId;
    await send(ws, 'Page.enable', {}, session);
    await send(ws, 'Runtime.enable', {}, session);
    await delay(400);
    const evaluated = await send(ws, 'Runtime.evaluate', {
      expression: `${parserSource}\nWebTableExport.parseDocument(document)`,
      returnByValue: true,
      awaitPromise: true,
    }, session);
    if (evaluated.exceptionDetails) {
      throw new Error(page + ' ' + JSON.stringify(evaluated.exceptionDetails));
    }
    const actual = evaluated.result.value;
    if (expectedFile) {
      const expected = JSON.parse(readFileSync(path.join(root, expectedFile), 'utf8'));
      const stable = (value) => JSON.stringify(value, Object.keys(value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : []));
      const flatten = (value) => JSON.stringify(value, (key, item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return Object.keys(item).sort().reduce((acc, name) => {
            acc[name] = item[name];
            return acc;
          }, {});
        }
        return item;
      });
      const same = flatten(actual) === flatten(expected);
      console.log(page, same ? 'MATCH' : 'DIFF', 'parser', actual.parserId);
      if (!same) {
        console.log(flatten(actual));
        console.log(flatten(expected));
        process.exitCode = 1;
      }
      void stable;
    } else {
      console.log(page, actual.ok ? `ok tables=${actual.tables.length} sources=${actual.tables.map((t) => t.source).join(',')}` : `error=${actual.error}`);
      if (page.endsWith('empty.html') && actual.error !== 'no-visible-table') process.exitCode = 1;
      if (page.endsWith('header-only.html') && actual.error !== 'no-data-rows') process.exitCode = 1;
      if (page.endsWith('orders.html') && !(actual.ok && actual.tables.some((t) => t.source === 'html-table' && t.rows.length === 4))) {
        console.log(JSON.stringify(actual, null, 2));
        process.exitCode = 1;
      }
      if (page.endsWith('admin.html') && !(actual.ok && actual.tables.some((t) => t.source === 'admin-widget') && actual.tables.some((t) => t.source === 'admin-grid'))) {
        console.log(JSON.stringify(actual, null, 2));
        process.exitCode = 1;
      }
    }
    await send(ws, 'Target.closeTarget', { targetId: created.targetId });
  }
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  chrome.kill('SIGKILL');
  server.kill('SIGKILL');
});
