async function main() {
  const resp = await fetch('https://www.publicsurplus.com/sms/browse/cataucs?catId=0&searchTxt=gold+jewelry', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  const html = await resp.text();
  console.log('Status:', resp.status, 'Length:', html.length);
  // Look for bid/price/item patterns
  const bidIdx = html.indexOf('currentBid');
  const itemIdx = html.indexOf('auctionItem');
  const tdIdx = html.indexOf('<td');
  console.log('currentBid at:', bidIdx, '| auctionItem at:', itemIdx, '| <td at:', tdIdx);
  if (bidIdx > -1) console.log('Context:', html.slice(bidIdx-100, bidIdx+200));
  if (itemIdx > -1) console.log('auctionItem context:', html.slice(itemIdx-50, itemIdx+300));
  // Print first 3000 chars of body
  const bodyStart = html.indexOf('<body');
  console.log('\nBody start:\n', html.slice(bodyStart, bodyStart + 2000));
}
main().catch(console.error);
