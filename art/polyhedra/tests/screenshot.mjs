// Screenshots the page in headless Chrome (software WebGL), printing console errors and the
// results of expressions evaluated in the page.
//   python3 -m http.server 8765        (in repo/)
//   node tests/screenshot.mjs 'http://127.0.0.1:8765/art/polyhedra/#n=tI' out.png [waitMs] [js...]
// An expression 'sleep:ms' waits instead.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, out, wait = '4000', ...evals] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'polyhedra-chrome-'));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${dir}`, '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1400,900', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 50; i++) { try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') console.log('console.' + m.params.type, m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded') console.log('log', m.params.entry.level, m.params.entry.text, m.params.entry.url || '');
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(+wait);
for (const ex of evals) {
  if (ex.startsWith('sleep:')) { await sleep(+ex.slice(6)); continue; }
  const r = await send('Runtime.evaluate', { expression: ex, awaitPromise: true, returnByValue: true });
  console.log('eval>', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
ws.close(); chrome.kill();
process.exit(0);
