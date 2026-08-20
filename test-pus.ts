import { PublicSurplusCrawler } from './src/crawlers/PublicSurplusCrawler.js';

async function main() {
  const crawler = new PublicSurplusCrawler();
  const results = await crawler.search({
    id: 1, name: 'test', keywords: ['iphone'], categories: [],
    sites: ['publicsurplus'], enabled: true,
  });
  console.log('Results:', results.length);
  if (results.length) {
    console.log('First:', JSON.stringify(results[0], null, 2));
    return;
  }
  // Debug — fetch raw HTML and inspect
  const homeResp = await fetch('https://www.publicsurplus.com/sms/browse/home', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const cookie = homeResp.headers.get('set-cookie')?.split(';')[0] ?? '';
  const html = await fetch('https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=iphone&Submit4=', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Referer': 'https://www.publicsurplus.com/sms/browse/home' }
  }).then(r => r.text());
  console.log('HTML length:', html.length, '| has searchGrid:', html.includes('searchGrid'));
  const valMatches = [...html.matchAll(/id="val_(\d+)searchGrid"/g)];
  console.log('val_searchGrid count:', valMatches.length);
  if (valMatches.length) {
    const [full, id] = valMatches[0];
    const pos    = valMatches[0].index!;
    const before = html.slice(Math.max(0, pos - 2000), pos);
    const after  = html.slice(pos, pos + 400);
    const titleM = before.match(/href="\/sms\/auction\/view\?auc=\d+"[^>]*title="([^"]+)"/);
    const priceM = after.match(/>\$?([\d,.]+)</);
    const endM   = after.match(new RegExp(`updateTimeLeftSpan\\(timeLeftInfoMap,\\s*${id},\\s*"[^"]+",\\s*\\d+,\\s*(\\d+)`));
    console.log(`\nFirst item auc=${id}:`);
    console.log('  title:', titleM?.[1]);
    console.log('  price match:', priceM?.[0]);
    console.log('  endMs:', endM?.[1], '| future?', endM ? parseInt(endM[1]) > Date.now() : false);
    if (!endM) console.log('  after snippet:', after.slice(0, 300));
  }
}
main().catch(console.error);
