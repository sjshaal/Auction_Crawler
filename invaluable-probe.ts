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
    if (!u.match(/\.(js|css|png|jpg|woff|ico|svg|gif|woff2|ttf)/) && !u.includes('google') && !u.includes('facebook') && !u.includes('analytics') && !u.includes('cloudflare')) {
      try { const b = await r.text(); calls.push({ s: r.status(), ct: ct.split(';')[0], u, b: b.slice(0, 600) }); } catch {}
    }
  });

  console.log('Loading Invaluable search...');
  await page.goto('https://www.invaluable.com/search/?keyword=gold+jewelry&upcoming=true', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(4000);
  console.log('URL:', page.url());

  console.log(`\nNon-asset responses (${calls.length}):`);
  calls.forEach(c => {
    console.log(`\n  ${c.s} [${c.ct}]\n  ${c.u}`);
    if (c.ct.includes('json')) console.log(`  ${c.b.slice(0, 500)}`);
  });

  await browser.close();
}
main().catch(console.error);
