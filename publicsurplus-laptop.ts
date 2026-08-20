async function main() {
  const homeResp = await fetch('https://www.publicsurplus.com/sms/browse/home', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const cookie = homeResp.headers.get('set-cookie')?.split(';')[0] ?? '';

  const html = await fetch('https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=laptop&Submit4=', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Referer': 'https://www.publicsurplus.com/sms/browse/home' }
  }).then(r => r.text());

  console.log('Length:', html.length);

  // Check the noAuctionsFound div state
  const noAucIdx = html.indexOf('noAuctionsFound');
  console.log('noAuctionsFound context:', html.slice(noAucIdx, noAucIdx + 100));

  // Look for result-specific patterns
  const patterns = ['docNum', 'auctionNum', 'itemNum', 'currentBid', 'lotNum', 'auc-card', 'auc-grid__item', 'searchResult', 'ps-card', 'auction-doc'];
  patterns.forEach(p => {
    const i = html.indexOf(p);
    if (i > -1) console.log(`\n${p} at ${i}:`, html.slice(i-50, i+300));
  });

  // Print last 10000 chars where results usually live
  console.log('\n--- TAIL 100000-110000 ---');
  console.log(html.slice(100000, 110000));
}
main().catch(console.error);
