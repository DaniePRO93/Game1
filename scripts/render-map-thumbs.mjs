// Renders a top-down picture of every map for the versus map vote.
// Usage: start `npx vite --port 5173`, then `node scripts/render-map-thumbs.mjs`.
// Needs Playwright and ffmpeg on the machine.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://localhost:5173';
const outDir = new URL('../public/img/maps/', import.meta.url).pathname;
const tmp = `${outDir}.tmp.png`;
mkdirSync(outDir, { recursive: true });

const ids = ['construction', 'rooftops', 'factory', 'playground', 'treetops'];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
for (const id of ids) {
  await page.goto(`${base}/play/?test`);
  await page.waitForTimeout(1500);
  await page.evaluate((id) => window.__topdown(id), id);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: tmp });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-vf', 'scale=360:360', '-quality', '82', `${outDir}${id}.webp`]);
  console.log('wrote', id);
}
execFileSync('rm', ['-f', tmp]);
await browser.close();
