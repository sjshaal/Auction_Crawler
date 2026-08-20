import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const allCalls: { u: string; s: number; ct: string; b: string }[] = [];
  page.on('response', async r => {
    const u = r.url();
    const ct = r.headers()['content-type'] ?? '';
    if (!u.match(/\.(js|css|png|jpg|woff|ico|svg|gif|woff2|jpeg)/) && !u.includes('google') && !u.includes('analytics') && !u.includes('cloudflare') && !u.includes('s3.amazonaws')) {
      try { allCalls.push({ u, s: r.status(), ct: ct.split(';')[0], b: (await r.text()).slice(0, 1000) }); } catch {}
    }
  });

  // Load homepage
  await page.goto('https://www.publicsurplus.com/sms/browse/home', { waitUntil: 'networkidle', timeout: 25_000 });
  await page.waitForTimeout(2000);

  // Find and inspect the search form
  const formHtml = await page.evaluate(() => {
    const form = document.querySelector('form');
    return form ? form.outerHTML.slice(0, 500) : 'no form found';
  });
  console.log('Form HTML:', formHtml);

  // Find search input
  const inputInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map(i => ({ name: i.name, id: i.id, type: i.type, placeholder: i.placeholder }));
  });
  console.log('Inputs:', JSON.stringify(inputInfo, null, 2));

  // Submit the search via the form
  const searchInput = await page.$('input[name="searchTxt"], #searchTxt, input[type="search"], input[type="text"]');
  if (searchInput) {
    console.log('\nFound search input, submitting...');
    await searchInput.fill('gold jewelry');

    // Watch for navigation
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 }).catch(() => null),
      searchInput.press('Enter'),
    ]);
    console.log('After submit URL:', page.url());
    console.log('Response:', response?.status(), response?.url());
  }

  await page.waitForTimeout(4000);

  // Check DOM now
  const bodyLen = await page.evaluate(() => document.body.innerHTML.length);
  const elCount = await page.evaluate(() => document.querySelectorAll('*').length);
  console.log('\nBody length:', bodyLen, '| Elements:', elCount);
  const bodySnippet = await page.evaluate(() => document.body.innerHTML.slice(0, 3000));
  console.log('Body:\n', bodySnippet);

  console.log('\n--- All captured calls ---');
  allCalls.forEach(c => {
    console.log(`${c.s} [${c.ct}] ${c.u}`);
    if (c.ct.includes('json') || c.ct.includes('html')) console.log(' ', c.b.slice(0, 300));
  });

  await browser.close();
}
main().catch(console.error);
