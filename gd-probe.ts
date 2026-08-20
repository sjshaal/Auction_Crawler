import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--window-position=-2000,-2000'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const apiCalls: { url: string; status: number; body: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    if (u.includes('maestro.lqdt1.com') || u.includes('lqdt1.com')) {
      try {
        const body = await r.text();
        apiCalls.push({ url: u, status: r.status(), body: body.slice(0, 300) });
      } catch {}
    }
  });

  // Visit homepage first for Akamai cookies
  await page.goto('https://www.govdeals.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Visit a specific item page
  await page.goto('https://www.govdeals.com/en/asset/4150/284', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log(`\nAll lqdt1 API calls (${apiCalls.length}):`);
  apiCalls.forEach(c => {
    console.log(`\n  ${c.status} ${c.url}`);
    // Look for bid-related data in body
    if (/bid|count|numBid/i.test(c.body)) {
      console.log('  *** CONTAINS BID DATA ***');
      console.log('  Body snippet:', c.body.slice(0, 400));
    }
  });

  await browser.close();
}
main();
