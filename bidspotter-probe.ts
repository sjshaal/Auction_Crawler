import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const calls: { s: number; ct: string; u: string; b: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (!u.match(/\.(js|css|png|jpg|woff|ico|svg|gif|woff2)/) && !u.includes('google') && !u.includes('analytics') && !u.includes('cloudflare')) {
      try { calls.push({ s: r.status(), ct: ct.split(';')[0], u, b: (await r.text()).slice(0, 600) }); } catch {}
    }
  });

  await page.goto('https://www.bidspotter.com/en-us/auction-catalogues/search?q=gold+jewelry', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(4000);
  console.log('URL:', page.url());
  calls.forEach(c => {
    console.log(`\n${c.s} [${c.ct}]\n${c.u}`);
    if (c.ct.includes('json')) console.log(c.b.slice(0, 400));
  });
  await browser.close();
}
main().catch(console.error);
