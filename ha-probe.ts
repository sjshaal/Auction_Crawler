import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const apiCalls: { url: string; status: number; body: string }[] = [];

  page.on('response', async r => {
    const u = r.url();
    if (u.includes('datadome') || u.includes('captcha') || u.includes('.js') || u.includes('.css') || u.includes('.png') || u.includes('.jpg') || u.includes('.woff')) return;
    try {
      const body = await r.text();
      apiCalls.push({ url: u, status: r.status(), body: body.slice(0, 400) });
    } catch {}
  });

  console.log('Loading ha.com homepage...');
  await page.goto('https://www.ha.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);

  console.log('Submitting search for "cartier watch"...');
  const searchInput = await page.$('input[name="searchTerm"], input[placeholder*="search" i], input[type="search"], #searchInput');
  if (searchInput) {
    await searchInput.fill('cartier watch');
    await searchInput.press('Enter');
  } else {
    await page.goto('https://www.ha.com/c/search-results.zx?type=keyword&keyword=cartier+watch&ic=1', {
      waitUntil: 'domcontentloaded', timeout: 30_000
    });
  }

  await page.waitForTimeout(5000);

  console.log(`\nJSON API calls intercepted (${apiCalls.length}):`);
  apiCalls.forEach(c => {
    console.log(`\n  ${c.status} ${c.url}`);
    console.log(`  Body: ${c.body.slice(0, 400)}`);
  });

  await browser.close();
}

main().catch(console.error);
