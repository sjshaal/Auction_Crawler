async function main() {
  const homeResp = await fetch('https://www.publicsurplus.com/sms/browse/home', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const cookie = homeResp.headers.get('set-cookie')?.split(';')[0] ?? '';
  const h = { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Referer': 'https://www.publicsurplus.com/sms/browse/home' };

  // Try different keywords to get results
  for (const kw of ['jewelry', 'watch', 'coin', 'laptop']) {
    const html = await fetch(`https://www.publicsurplus.com/sms/browse/search?posting=y&scope=&keyWord=${encodeURIComponent(kw)}&Submit4=`, { headers: h }).then(r => r.text());
    const noResults = html.includes('noAuctionsFound') && !html.includes('noAuctionsFound" style="display:none');
    const resultIdx = html.indexOf('auc-grid') > -1 ? html.indexOf('auc-grid') : html.indexOf('result-item') > -1 ? html.indexOf('result-item') : html.indexOf('docNum');
    console.log(`"${kw}": ${html.length} chars, noAuctions=${noResults}, result container at ${resultIdx}`);
    if (!noResults && resultIdx > -1) {
      console.log('Result HTML:', html.slice(resultIdx, resultIdx + 1500));
      break;
    }
  }
}
main().catch(console.error);
