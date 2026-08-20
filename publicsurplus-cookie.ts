async function main() {
  // Step 1: fetch homepage to get session cookie
  const homeResp = await fetch('https://www.publicsurplus.com/sms/browse/home', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  const cookies = homeResp.headers.get('set-cookie') ?? '';
  console.log('Homepage status:', homeResp.status);
  console.log('Cookies:', cookies.slice(0, 300));

  // Extract JSESSIONID or similar
  const cookieHeader = cookies.split(',').map(c => c.split(';')[0]).join('; ');
  console.log('Cookie header:', cookieHeader);

  // Step 2: fetch search URL with cookie
  const searchResp = await fetch('https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=gold+jewelry&Submit4=', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': 'https://www.publicsurplus.com/sms/browse/home',
      'Cookie': cookieHeader,
    }
  });
  const html = await searchResp.text();
  console.log('\nSearch status:', searchResp.status, '| Length:', html.length);

  // Look for listing data
  const auctionIdx = html.indexOf('auction');
  const itemIdx = html.indexOf('itemNum');
  const bidIdx = html.indexOf('currentBid');
  const trIdx = html.indexOf('<tr');
  console.log('auction at:', auctionIdx, '| itemNum at:', itemIdx, '| currentBid at:', bidIdx, '| <tr at:', trIdx);

  if (html.length > 500) {
    // Find the main content area
    const bodyStart = html.indexOf('<body');
    const contentStart = html.indexOf('id="content"') > -1 ? html.indexOf('id="content"') : html.indexOf('id="main"') > -1 ? html.indexOf('id="main"') : bodyStart;
    console.log('\nContent area:\n', html.slice(contentStart, contentStart + 2000));
  }
}
main().catch(console.error);
