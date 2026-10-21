// Screenshots the page in headless Chrome, printing console errors and the
// results of expressions evaluated in the page.
//   python3 -m http.server 8765        (in repo/)
//   node tests/screenshot.mjs 'http://127.0.0.1:8765/art/buddhabrot/#samples=20000' out.png [waitMs] [js...]
// The window is 1400 × 900; set SIZE=390x844 (for example) for a phone-sized one.
// An expression 'sleep:ms' waits instead.
import { writeFileSync } from 'node:fs';
import { launch, evaluate, sleep } from './chrome.mjs';
const [url, out, wait = '4000', ...evals] = process.argv.slice(2);
const [W, H] = (process.env.SIZE || '1400x900').split('x').map(Number);
const { send, close } = await launch(W, H);
await send('Page.navigate', { url });
await sleep(+wait);
for (const ex of evals) {
  if (ex.startsWith('sleep:')) { await sleep(+ex.slice(6)); continue; }
  console.log('eval>', JSON.stringify(await evaluate(send, ex)));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
close();
process.exit(0);
