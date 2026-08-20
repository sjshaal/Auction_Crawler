import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const allHits: any[] = [];
  page.on('response', async r => {
    if (r.url().includes('/catResults') && r.headers()['content-type']?.includes('json')) {
      try { const d = JSON.parse(await r.text()); allHits.push(...(d?.results?.[0]?.hits ?? [])); } catch {}
    }
  });

  // Broad search on upcoming=true
  await page.goto('https://www.invaluable.com/search/?keyword=ring&upcoming=true', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());

  const now = Date.now() / 1000;
  const future = allHits.filter(h => h.dateTimeUTCUnix > now);
  const past   = allHits.filter(h => h.dateTimeUTCUnix <= now);
  console.log(`Total: ${allHits.length}, Future: ${future.length}, Past: ${past.length}`);

  if (future[0]) {
    console.log('\nFuture lot sample:');
    console.log(JSON.stringify(future[0], null, 2));
  } else {
    console.log('\nNo future lots found — catResults is a price archive only');
    console.log('Most recent past lot date:', new Date(Math.max(...allHits.map(h => h.dateTimeUTCUnix)) * 1000).toISOString());
  }

  await browser.close();
}
main().catch(console.error);
