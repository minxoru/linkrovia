import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { brand } from '../src/lib/brand.ts';

const local = (path) => new URL(path, import.meta.url);
const require = createRequire(import.meta.url);
const fontPath =
  require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2');
const [font, mark, tokens] = await Promise.all([
  readFile(fontPath),
  readFile(local('../static/' + brand.mark)),
  readFile(local('../src/lib/styles/tokens.css'), 'utf8'),
]);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
  });
  await page.setContent(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><style>
      ${tokens}
      @font-face { font-family: Inter; font-weight: 100 900;
        src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2'); }
      body { margin: 0; background: var(--brand-ink); color: var(--brand-on-ink);
        font-family: Inter, sans-serif; }
      main { box-sizing: border-box; display: grid; grid-template-columns: 1fr 260px;
        align-items: center; gap: 36px; padding: 88px; height: 630px; }
      p { font-size: 27px; font-weight: 650; color: var(--brand-muted-on-ink); margin: 0 0 28px; }
      h1 { font-size: 56px; font-weight: 760; letter-spacing: -2.6px; line-height: 1.12; margin: 0; }
      h1 span { display: block; color: var(--brand-signal); }
      figure { box-sizing: border-box; margin: 0; display: grid; place-items: center; height: 260px;
        background: var(--brand-ink-panel); border: 1px solid var(--brand-ink-border); border-radius: 32px; }
    </style></head><body><main>
      <div><p id="brand"></p><h1>Every link.<span>The right destination.</span></h1></div>
      <figure><img alt="" width="168" height="168" src="data:image/svg+xml;base64,${mark.toString('base64')}"></figure>
    </main></body></html>`);
  await page.evaluate((name) => {
    const label = document.getElementById('brand');
    if (label) label.textContent = name;
  }, brand.name);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: local('../static/' + brand.socialImage).pathname,
  });
} finally {
  await browser.close();
}
