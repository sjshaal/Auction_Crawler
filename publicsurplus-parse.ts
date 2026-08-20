async function main() {
  const homeResp = await fetch('https://www.publicsurplus.com/sms/browse/home', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const cookie = homeResp.headers.get('set-cookie')?.split(';')[0] ?? '';

  const html = await fetch('https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=gold+jewelry&Submit4=', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html', 'Referer': 'https://www.publicsurplus.com/sms/browse/home',
      'Cookie': cookie,
    }
  }).then(r => r.text());

  console.log('HTML length:', html.length);

  // Search for key patterns
  const patterns = ['docNum', 'auctionNum', 'itemId', 'lotId', 'currentBid', 'endDate', 'closeDate', 
    'card-body', 'card-title', 'auction-item', 'lot-item', 'result-item', 'search-result',
    '/sms/auction', '/sms/lot', 'href="/sms/', 'data-id', 'data-doc', 'sms/browse/auc'];
  patterns.forEach(p => {
    const idx = html.indexOf(p);
    if (idx > -1) {
      console.log(`\n"${p}" at ${idx}:`);
      console.log(html.slice(Math.max(0, idx-100), idx+300));
    }
  });

  // Print the section after navigation/header (around the middle of the page)
  console.log('\n--- Middle of HTML (15000-17000) ---');
  console.log(html.slice(15000, 17000));

  // Look for any href containing numbers (likely auction/lot URLs)
  const hrefMatches = [...html.matchAll(/href="(\/sms\/[^"]+)"/g)].map(m => m[1]);
  const uniqueHrefs = [...new Set(hrefMatches)].filter(h => /\d/.test(h)).slice(0, 15);
  console.log('\nUnique numeric hrefs:', uniqueHrefs);
}
main().catch(console.error);
