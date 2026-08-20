async function main() {
  const resp = await fetch('https://www.invaluable.com/catResults?keyword=gold+jewelry&upcoming=true&size=10', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.invaluable.com/search/?keyword=gold+jewelry&upcoming=true',
    }
  });
  console.log('status:', resp.status, resp.headers.get('content-type'));
  const text = await resp.text();
  try {
    const data = JSON.parse(text);
    const hits = data?.results?.[0]?.hits ?? [];
    console.log('hit count:', hits.length);
    if (hits.length) {
      console.log('first hit keys:', Object.keys(hits[0]).join(', '));
      console.log(JSON.stringify(hits[0], null, 2));
    } else {
      console.log('raw:', text.slice(0, 500));
    }
  } catch {
    console.log('not JSON:', text.slice(0, 500));
  }
}
main().catch(console.error);
