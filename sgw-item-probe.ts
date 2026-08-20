import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })).newPage();

  const apis: { u: string; b: string }[] = [];

  // Intercept all API calls on a live item page
  // Use a known item ID pattern from search
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (u.includes('shopgoodwill') && !u.match(/\.(js|css|png|jpg|woff|svg|ico|gif|woff2)/) && !u.includes('google') && !u.includes('analytics')) {
      try { apis.push({ u, b: (await r.text()).slice(0, 600) }); } catch {}
    }
  });

  // Go directly to item page — grab id from URL bar
  await page.goto('https://shopgoodwill.com/item', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
  
  // Actually navigate to search to get a real item URL
  await page.goto('https://shopgoodwill.com', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2000);

  // Look for any item links
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .filter(h => h?.includes('/item/'))
      .slice(0, 3)
  );
  console.log('Item links:', links);

  if (links[0]) {
    apis.length = 0;
    await page.goto(`https://shopgoodwill.com${links[0]}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(4000);
    console.log('\nAPI calls on item page:');
    apis.forEach(a => {
      console.log(`\n  ${a.u}`);
      const ct = a.b;
      if (a.u.includes('api') || a.u.includes('Api') || a.u.includes('item') || ct.includes('{')) console.log(' ', a.b);
    });
  }

  await browser.close();
}
main().catch(console.error);
