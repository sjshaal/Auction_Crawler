import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const responses: { url: string; status: number; ct: string; body: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (u.includes('invaluable.com') && ct.includes('json')) {
      try { responses.push({ url: u, status: r.status(), ct, body: await r.text() }); } catch {}
    }
  });

  await page.goto('https://www.invaluable.com/search/?keyword=gold+jewelry&upcoming=true', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(5000);

  console.log('\nJSON responses from invaluable.com:');
  responses.forEach(r => {
    console.log(`\n  ${r.status} ${r.url}`);
    if (r.body.length < 2000) console.log('  ', r.body);
    else {
      // Parse and pretty-print first hit
      try {
        const d = JSON.parse(r.body);
        const hits = d?.results?.[0]?.hits;
        if (hits?.length) {
          console.log('  hits:', hits.length);
          console.log('  first keys:', Object.keys(hits[0]).join(', '));
          const h = hits[0];
          console.log(JSON.stringify({ lotTitle: h.lotTitle, lotRef: h.lotRef, photoPath: h.photoPath, priceResult: h.priceResult, dateTimeUTCUnix: h.dateTimeUTCUnix, currencyCode: h.currencyCode, houseName: h.houseName, saleType: h.saleType, upcoming: h.upcoming, currentBid: h.currentBid, estimateLow: h.estimateLow, estimateHigh: h.estimateHigh }, null, 2));
        } else {
          console.log('  ', JSON.stringify(d).slice(0, 400));
        }
      } catch { console.log('  ', r.body.slice(0, 400)); }
    }
  });

  // Also grab sample lot links from DOM
  const hrefs = await page.$$eval('a[href*="invaluable.com"]', els => 
    [...new Set(els.map(e => e.getAttribute('href')).filter(h => h?.includes('/lot/')))].slice(0, 5)
  );
  console.log('\nSample lot hrefs:', hrefs);

  await browser.close();
}
main().catch(console.error);
