import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  let searchHtml = '';
  page.on('response', async r => {
    if (r.url().includes('/sms/browse/search')) {
      try { searchHtml = await r.text(); } catch {}
    }
  });

  await page.goto('https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=gold+jewelry&Submit4=', { waitUntil: 'networkidle', timeout: 25_000 });
  await page.waitForTimeout(3000);

  // Extract listing data from DOM
  const listings = await page.evaluate(() => {
    // Look for table rows or cards
    const rows = Array.from(document.querySelectorAll('tr'));
    return rows.slice(0, 8).map(r => ({
      className: r.className,
      text: r.innerText?.trim().slice(0, 200),
      links: Array.from(r.querySelectorAll('a')).map(a => ({ href: a.href, text: a.innerText?.trim().slice(0, 50) })),
      imgs: Array.from(r.querySelectorAll('img')).map(i => i.src),
    }));
  });
  console.log('Table rows:', JSON.stringify(listings, null, 2));

  // Look for any auction-specific elements
  const auctionData = await page.evaluate(() => {
    // Check for auction lot IDs or bid amounts
    const links = Array.from(document.querySelectorAll('a[href*="auction"], a[href*="lot"], a[href*="item"]'));
    return links.slice(0, 10).map(a => ({ href: a.href, text: a.innerText?.trim().slice(0, 100) }));
  });
  console.log('\nAuction links:', JSON.stringify(auctionData, null, 2));

  // Print relevant HTML section containing results
  if (searchHtml) {
    // Find the results table/section
    const resultsIdx = searchHtml.indexOf('searchresult');
    const tableIdx = searchHtml.indexOf('<table');
    const auctionIdx = searchHtml.indexOf('auctionId') !== -1 ? searchHtml.indexOf('auctionId') : searchHtml.indexOf('itemNum');
    console.log('\nsearchresult at:', resultsIdx, '| table at:', tableIdx, '| auctionId at:', auctionIdx);
    if (resultsIdx > -1) console.log('searchresult ctx:', searchHtml.slice(resultsIdx, resultsIdx + 600));
    if (tableIdx > -1) console.log('first table ctx:', searchHtml.slice(tableIdx, tableIdx + 1000));
    if (auctionIdx > -1) console.log('auctionId ctx:', searchHtml.slice(auctionIdx - 100, auctionIdx + 400));
  }

  await browser.close();
}
main().catch(console.error);
