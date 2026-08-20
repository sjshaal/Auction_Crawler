async function main() {
  const homeResp = await fetch('https://www.publicsurplus.com/sms/browse/home', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const cookie = homeResp.headers.get('set-cookie')?.split(';')[0] ?? '';

  const html = await fetch('https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=gold+jewelry&Submit4=', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Referer': 'https://www.publicsurplus.com/sms/browse/home' }
  }).then(r => r.text());

  // Print the last section of the page — should contain search results
  console.log('Total length:', html.length);
  console.log('\n--- HTML 38000-44000 ---');
  console.log(html.slice(38000, 44000));
  console.log('\n--- HTML 44000-49747 ---');
  console.log(html.slice(44000));
}
main().catch(console.error);
