import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  // Capture the HTML response body directly
  let html = '';
  page.on('response', async r => {
    if (r.url().includes('/sms/browse/cataucs')) {
      try { html = await r.text(); } catch {}
    }
  });

  await page.goto('https://www.publicsurplus.com/sms/browse/cataucs?catId=0&searchTxt=gold+jewelry', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(6000);

  console.log('Response body length:', html.length);
  if (html.length > 0) {
    // Find auction items
    const docIdx = html.indexOf('docNum');
    const bidIdx = html.indexOf('currentBid');
    const itemIdx = html.indexOf('auctionNum');
    console.log('docNum at:', docIdx, 'currentBid at:', bidIdx, 'auctionNum at:', itemIdx);
    if (docIdx > -1) console.log('docNum context:', html.slice(docIdx-50, docIdx+300));
    if (bidIdx > -1) console.log('bid context:', html.slice(bidIdx-50, bidIdx+200));
    // Print interesting section
    const tableIdx = html.indexOf('<table');
    console.log('\nFirst table at:', tableIdx);
    if (tableIdx > -1) console.log(html.slice(tableIdx, tableIdx+500));
  }

  // Also get DOM state after JS renders
  const domBody = await page.evaluate(() => document.body.innerHTML.length);
  console.log('\nDOM body length:', domBody);
  
  // Try iframes
  const frames = page.frames();
  console.log('Frames:', frames.length);
  for (const frame of frames) {
    const url = frame.url();
    if (url && url !== 'about:blank') {
      console.log('Frame URL:', url);
      const frameItems = await frame.$$eval('a, tr, td', els => els.length).catch(() => 0);
      console.log('  Elements:', frameItems);
    }
  }

  await browser.close();
}
main().catch(console.error);
