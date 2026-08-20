import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  let catResultsBody = '';
  page.on('response', async r => {
    if (r.url().includes('/catResults')) {
      try { catResultsBody = await r.text(); } catch {}
    }
  });

  await page.goto('https://www.invaluable.com/search/?keyword=gold+jewelry&upcoming=true', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(4000);

  if (catResultsBody) {
    const data = JSON.parse(catResultsBody);
    const hits = data?.results?.[0]?.hits ?? [];
    console.log(`\nTotal hits: ${hits.length}`);
    console.log('First hit keys:', Object.keys(hits[0] ?? {}).join(', '));
    console.log('\nFirst hit:');
    console.log(JSON.stringify(hits[0], null, 2));

    // Check if there's an open/upcoming one
    const upcoming = hits.find((h: any) => h.dateTimeUTCUnix > Date.now() / 1000);
    if (upcoming) {
      console.log('\nUpcoming lot:', JSON.stringify(upcoming, null, 2));
    }
  } else {
    console.log('No catResults captured');
    // Check page for lot links
    const links = await page.$$eval('a[href*="/lot/"]', els => els.slice(0, 3).map(e => e.getAttribute('href')));
    console.log('Sample lot links:', links);
  }

  await browser.close();
}
main().catch(console.error);
