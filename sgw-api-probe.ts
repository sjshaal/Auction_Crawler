async function main() {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  // Try known ShopGoodwill API patterns for a single item
  // The search API is: POST buyerapi.shopgoodwill.com/api/Search/ItemListing
  // Try likely item-detail endpoints with a real-looking item ID
  const itemId = 259828810; // a plausible item ID

  const endpoints = [
    `https://buyerapi.shopgoodwill.com/api/Listing/GetListing/${itemId}`,
    `https://buyerapi.shopgoodwill.com/api/Search/GetItemDetail?listingId=${itemId}`,
    `https://buyerapi.shopgoodwill.com/api/Listing/${itemId}`,
    `https://buyerapi.shopgoodwill.com/api/Items/GetItem/${itemId}`,
  ];

  for (const url of endpoints) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Origin': 'https://shopgoodwill.com' } });
    const body = await r.text();
    console.log(`${r.status} ${url}`);
    if (r.status === 200) console.log('  ', body.slice(0, 300));
  }
}
main().catch(console.error);
