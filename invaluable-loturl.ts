import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })).newPage();

  const catHits: any[] = [];
  page.on('response', async r => {
    if (r.url().includes('/catResults') && r.headers()['content-type']?.includes('json')) {
      try { const d = JSON.parse(await r.text()); catHits.push(...(d?.results?.[0]?.hits ?? [])); } catch {}
    }
  });

  // Load search to get lot refs
  await page.goto('https://www.invaluable.com/search/?keyword=gold+jewelry&upcoming=false', { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(4000);

  if (catHits.length) {
    const h = catHits[0];
    console.log('lotRef:', h.lotRef, 'objectID:', h.objectID, 'houseName:', h.houseName, 'lotTitle:', h.lotTitle);
    
    // Navigate to the lot using common URL patterns
    const patterns = [
      `https://www.invaluable.com/auction/view/?salref=${h.lotRef}`,
      `https://www.invaluable.com/lot/${h.lotRef?.toLowerCase()}/`,
      `https://www.invaluable.com/catalog/lot.cfm?lot=${h.lotRef}`,
    ];
    for (const url of patterns) {
      const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }).catch(() => null);
      console.log(url, '->', r?.status, r?.url);
    }
    
    // Also check what links appear on the page for this lot
    const links = await page.evaluate((ref) => {
      return Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.toLowerCase().includes(ref.toLowerCase()));
    }, h.lotRef);
    console.log('Page links with lotRef:', links.slice(0, 5));
  }

  await browser.close();
}
main().catch(console.error);
