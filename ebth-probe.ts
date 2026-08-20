import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const apiCalls: { url: string; status: number; ct: string; body: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (u.includes('ebth.com') && !u.match(/\.(js|css|png|jpg|woff|ico|svg)/)) {
      try {
        const body = await r.text();
        apiCalls.push({ url: u, status: r.status(), ct, body: body.slice(0, 500) });
      } catch {}
    }
  });

  console.log('Loading EBTH...');
  await page.goto('https://www.ebth.com/browse?q=gold+jewelry&sort=end_date_asc', {
    waitUntil: 'networkidle', timeout: 30_000
  });
  await page.waitForTimeout(3000);

  console.log(`\nAPI calls (${apiCalls.length}):`);
  apiCalls.forEach(c => {
    console.log(`\n  ${c.status} [${c.ct.split(';')[0]}] ${c.url}`);
    if (c.ct.includes('json')) console.log(`  ${c.body.slice(0, 400)}`);
  });

  await browser.close();
}
main().catch(console.error);
