import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  // Step 1: load homepage to get session
  await page.goto('https://www.publicsurplus.com/sms/browse/home', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2000);
  console.log('Homepage loaded, DOM length:', await page.evaluate(() => document.body.innerHTML.length));

  // Step 2: try to use search
  const input = await page.$('#searchTxt, input[name="searchTxt"], input[type="search"]');
  if (input) {
    console.log('Found search input');
    await input.fill('gold jewelry');
    await input.press('Enter');
    await page.waitForTimeout(5000);
  } else {
    console.log('No input, navigating...');
    await page.goto('https://www.publicsurplus.com/sms/browse/cataucs?catId=0&searchTxt=gold+jewelry', { waitUntil: 'networkidle', timeout: 25_000 }).catch(() => {});
    await page.waitForTimeout(5000);
  }

  console.log('Search URL:', page.url());
  const bodyLen = await page.evaluate(() => document.body.innerHTML.length);
  console.log('Body length:', bodyLen);

  // Print body
  const body = await page.evaluate(() => document.body.innerHTML.slice(0, 2000));
  console.log('Body HTML:', body);

  // Count all elements
  const elCount = await page.evaluate(() => document.querySelectorAll('*').length);
  console.log('Total DOM elements:', elCount);

  await browser.close();
}
main().catch(console.error);
