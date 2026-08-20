import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const jsonCalls: { u: string; b: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (ct.includes('json') && u.includes('invaluable.com') && !u.includes('session') && !u.includes('currency') && !u.includes('bugsnag') && !u.includes('evergage')) {
      try { jsonCalls.push({ u, b: (await r.text()).slice(0, 1000) }); } catch {}
    }
  });

  // Try catalog/upcoming lots search
  await page.goto('https://www.invaluable.com/catalog/?keyword=gold+jewelry', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());

  jsonCalls.forEach(c => {
    console.log(`\n${c.u}`);
    console.log(c.b);
  });

  await browser.close();
}
main().catch(console.error);
