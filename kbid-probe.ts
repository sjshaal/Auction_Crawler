import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const calls: { s: number; ct: string; u: string; b: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (!u.match(/\.(js|css|png|jpg|woff|ico|svg|gif)/) && !u.includes('google') && !u.includes('facebook') && !u.includes('tag') && !u.includes('analytics')) {
      try { const b = await r.text(); calls.push({ s: r.status(), ct: ct.split(';')[0], u, b: b.slice(0, 500) }); } catch {}
    }
  });

  console.log('Loading K-BID homepage...');
  await page.goto('https://www.k-bid.com', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1000);
  const input = await page.$('#searchKeyword, input[name="keywords"], input[type="search"]');
  if (input) {
    console.log('Found search input, submitting...');
    await input.fill('gold jewelry');
    await input.press('Enter');
    await page.waitForTimeout(5000);
  } else {
    console.log('No search input found, navigating directly...');
    await page.goto('https://www.k-bid.com/items?keywords=gold+jewelry', { waitUntil: 'networkidle', timeout: 20_000 });
    await page.waitForTimeout(3000);
  }
  console.log('Current URL:', page.url());

  console.log(`\nAll non-asset responses (${calls.length}):`);
  calls.forEach(c => {
    console.log(`\n  ${c.s} [${c.ct}]\n  ${c.u}`);
    if (c.ct.includes('json')) console.log(`  JSON: ${c.b.slice(0, 500)}`);
  });

  await browser.close();
}
main().catch(console.error);
