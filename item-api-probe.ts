async function main() {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // ShopGoodwill item detail
  const sgw = await fetch('https://buyerapi.shopgoodwill.com/api/ItemDetail/GetItemDetailModelByItemId/259828810', {
    headers: { 'User-Agent': UA, 'Origin': 'https://shopgoodwill.com', 'Referer': 'https://shopgoodwill.com/' }
  }).then(r => r.json());
  
  console.log('=== ShopGoodwill ===');
  const d = sgw.data ?? sgw;
  console.log('Keys:', Object.keys(d).join(', '));
  console.log('title:', d.title ?? d.itemTitle);
  console.log('currentPrice:', d.currentPrice ?? d.currentBid);
  console.log('endTime:', d.endingTime ?? d.endTime ?? d.closingDate);
  console.log('imageUrl:', d.smallImageName ?? d.imageURL ?? d.mainImage);
  console.log('seller:', d.sellerName ?? d.seller);

  // GovDeals — try to fetch single asset
  // URL pattern: govdeals.com/en/asset/{accountId}/{assetId}
  // API: maestro.lqdt1.com - search by assetId
  console.log('\n=== GovDeals (need accountId+assetId from URL) ===');
  console.log('URL pattern: govdeals.com/en/asset/{accountId}/{assetId}');
  console.log('Can use maestro search filtered by assetId');
}
main().catch(console.error);
