import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })).newPage();

  const apis: { u: string; b: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    if (!u.match(/\.(js|css|png|jpg|woff|svg|ico|gif|woff2)/) && !u.includes('google') && !u.includes('analytics') && !u.includes('tag') && !u.includes('facebook')) {
      try { apis.push({ u, b: (await r.text()).slice(0, 800) }); } catch {}
    }
  });

  // Use a specific live item URL
  await page.goto('https://shopgoodwill.com/item/259828810', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());

  apis.forEach(a => {
    if (a.u.includes('shopgoodwill') || a.u.includes('buyerapi')) {
      console.log(`\n${a.u}`);
      console.log(a.b.slice(0, 500));
    }
  });

  await browser.close();
}
main().catch(console.error);
