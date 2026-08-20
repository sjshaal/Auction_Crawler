async function main() {
  const homeResp = await fetch('https://www.publicsurplus.com/sms/browse/home', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const cookie = homeResp.headers.get('set-cookie')?.split(';')[0] ?? '';

  const html = await fetch('https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=gold+jewelry&Submit4=', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Referer': 'https://www.publicsurplus.com/sms/browse/home' }
  }).then(r => r.text());

  // Find all Ajax.Request and fetch/XMLHttpRequest calls in the page JS
  const ajaxMatches = [...html.matchAll(/Ajax\.Request\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
  const fetchMatches = [...html.matchAll(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
  const urlMatches = [...html.matchAll(/url\s*:\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
  
  console.log('Ajax.Request URLs:', ajaxMatches);
  console.log('fetch() URLs:', fetchMatches);
  console.log('url: URLs:', urlMatches.filter(u => !u.includes('.css') && !u.includes('.js') && !u.includes('.png')));

  // Print the section after 30000 chars (likely the main content area)
  console.log('\n--- HTML 30000-35000 ---');
  console.log(html.slice(30000, 35000));
}
main().catch(console.error);
