import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const catHits: any[] = [];
  page.on('response', async r => {
    if (r.url().includes('/catResults') && r.headers()['content-type']?.includes('json')) {
      try {
        const d = JSON.parse(await r.text());
        catHits.push(...(d?.results?.[0]?.hits ?? []));
        console.log('catResults URL:', r.url());
      } catch {}
    }
  });

  // Broad search for upcoming jewelry lots
  await page.goto('https://www.invaluable.com/search/?keyword=jewelry&upcoming=true', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  console.log('hits:', catHits.length);

  if (catHits.length) {
    const now = Date.now() / 1000;
    const future = catHits.filter(h => h.dateTimeUTCUnix > now);
    console.log('Future lots:', future.length);
    if (future[0]) {
      console.log('\nSample upcoming lot keys:', Object.keys(future[0]).join(', '));
      console.log(JSON.stringify(future[0], null, 2));
    }
    // Print all keys including any extras
    const allKeys = new Set(catHits.flatMap(h => Object.keys(h)));
    console.log('\nAll keys across hits:', [...allKeys].join(', '));
  }

  await browser.close();
}
main().catch(console.error);
