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
      } catch {}
    }
  });

  // Use upcoming=false to look for scheduled-but-not-started lots with dateTimeUTCUnix in future
  await page.goto('https://www.invaluable.com/search/?keyword=gold+jewelry&upcoming=false', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(5000);

  const now = Date.now() / 1000;
  const future = catHits.filter(h => h.dateTimeUTCUnix > now);
  const past   = catHits.filter(h => h.dateTimeUTCUnix <= now);
  console.log(`Total: ${catHits.length}, Future: ${future.length}, Past: ${past.length}`);

  if (future.length) {
    console.log('\nSample future lot:');
    console.log(JSON.stringify(future[0], null, 2));
  }
  if (catHits.length) {
    const h = catHits[0];
    console.log('\nAll keys:', Object.keys(h).join(', '));
    // Try to find lot URL on page
    const lotUrl = await page.$eval(`a[href*="${h.lotRef?.toLowerCase()}"]`, e => e.href).catch(() => null);
    console.log('Lot URL for', h.lotRef, ':', lotUrl);
    
    // Try image URL patterns
    console.log('Photo path:', h.photoPath);
    const imgBase = 'https://media.invaluable.com/housePhotos/';
    console.log('Likely image URL:', imgBase + h.photoPath);
  }

  // Search page for any lot links
  const links = await page.evaluate(() => {
    const as = Array.from(document.querySelectorAll('a[href]'));
    return [...new Set(as.map(a => a.href).filter(h => h.match(/invaluable\.com.*(lot|auction).*\d/)))].slice(0, 10);
  });
  console.log('\nLot links on page:', links);

  await browser.close();
}
main().catch(console.error);
