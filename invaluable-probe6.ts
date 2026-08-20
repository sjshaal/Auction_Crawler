import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const calls: { u: string; ct: string; s: number; b: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (!u.match(/\.(js|css|png|jpg|woff|ico|svg|gif|woff2)/) && !u.includes('evergage') && !u.includes('bugsnag') && !u.includes('cookiebot') && !u.includes('chat') && !u.includes('challenge-platform')) {
      try { calls.push({ u, ct: ct.split(';')[0], s: r.status(), b: (await r.text()).slice(0, 800) }); } catch {}
    }
  });

  // Try the Invaluable search with explicit upcoming items filter
  await page.goto('https://www.invaluable.com/search/?keyword=gold+jewelry&upcoming=true&hasResults=false', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());

  calls.forEach(c => {
    console.log(`\n${c.s} [${c.ct}]\n${c.u}`);
    if (c.ct.includes('json') || c.u.includes('algolia')) console.log(c.b);
  });

  await browser.close();
}
main().catch(console.error);
