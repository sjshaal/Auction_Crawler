import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  await page.goto('https://www.publicsurplus.com/sms/browse/cataucs?catId=0&searchTxt=gold+jewelry', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());

  // Count items
  const count = await page.$$eval('.auctionItemDiv, .item-row, [class*="auction-item"], [class*="lot-item"]', els => els.length).catch(() => 0);
  console.log('Item divs found:', count);

  // Get outer HTML of first item
  const firstItem = await page.$('.auctionItemDiv, .item-row, [class*="lot"]').catch(() => null);
  if (firstItem) {
    const html = await firstItem.innerHTML();
    console.log('\nFirst item HTML:', html.slice(0, 1000));
  }

  // Check for any JSON data on the page
  const scriptData = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    return scripts.map(s => s.textContent?.slice(0, 200)).filter(t => t?.includes('bid') || t?.includes('Bid') || t?.includes('price'));
  });
  console.log('\nScripts with bid data:', scriptData.slice(0, 3));

  // Try to get listing titles and prices
  const items = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr, .row, .item, [class*="auction"]'));
    return rows.slice(0, 5).map(el => ({
      text: el.textContent?.trim().slice(0, 200),
      className: el.className,
    }));
  });
  console.log('\nPage rows:', JSON.stringify(items, null, 2));

  // Get full page HTML snippet
  const bodyHtml = await page.evaluate(() => document.body.innerHTML.slice(5000, 7000));
  console.log('\nBody HTML excerpt:', bodyHtml);

  await browser.close();
}
main().catch(console.error);
