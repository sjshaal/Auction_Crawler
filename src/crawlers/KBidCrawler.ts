import { BaseCrawler } from './BaseCrawler.js';
import type { AuctionListing, SearchConfig } from '../types/index.js';

// K-BID serves plain HTML with no bot protection — a standard fetch() works.
// Real-time bid/timing data is embedded in the HTML as a JSON array (Sockoas
// hydration), keyed by "lot:k-bid:{auctionId}:{lotId}". We extract that first,
// then correlate with lot cards found via span IDs in the markup.

const BASE_URL   = 'https://www.k-bid.com';
const SEARCH_URL = `${BASE_URL}/auction/search`;

const FETCH_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

interface SockLot {
  key:          string;
  currentBid:   number;
  msRemaining:  number;
}

export class KBidCrawler extends BaseCrawler {
  readonly siteName = 'kbid';

  async search(config: SearchConfig): Promise<AuctionListing[]> {
    const keywords = config.keywords.join(' ');
    this.log(`Searching for: "${keywords}"`);

    const listings: AuctionListing[] = [];

    try {
      const url  = `${SEARCH_URL}?search_phrase=${encodeURIComponent(keywords)}&page=1`;
      const resp = await fetch(url, { headers: FETCH_HEADERS });

      if (!resp.ok) {
        this.logError(`HTTP ${resp.status}`);
        return [];
      }

      const html    = await resp.text();
      const sockMap = this.parseSockoas(html);

      // Each open lot has a span: id="lot_current_bid_lot_k-bid_{auctionId}_{lotId}"
      const spanRe = /id="lot_current_bid_lot_k-bid_(\d+)_(\d+)"[^>]*>([^<]*)</g;
      let m: RegExpExecArray | null;

      while ((m = spanRe.exec(html)) !== null) {
        const [, auctionId, lotId, priceText] = m;

        const sockKey = `lot:k-bid:${auctionId}:${lotId}`;
        const sock    = sockMap.get(sockKey);

        // Skip lots with no timing data (closed or not yet hydrated)
        if (!sock || sock.msRemaining <= 0) continue;

        const endTime      = new Date(Date.now() + sock.msRemaining).toISOString();
        const currentPrice = sock.currentBid > 0
          ? sock.currentBid
          : parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

        if (config.minPrice && currentPrice < config.minPrice) continue;
        if (config.maxPrice && currentPrice > config.maxPrice) continue;
        if (config.endingWithinHours) {
          if (sock.msRemaining / 3_600_000 > config.endingWithinHours) continue;
        }

        // Find the card that precedes this span in the HTML
        const before  = html.slice(Math.max(0, m.index - 4000), m.index);
        const href    = this.lastMatch(before, /href="(\/auction\/\d+\/item\/\d+)"/g, 1);
        const imgTag  = this.lastMatch(before, /<img\s[^>]*class="[^"]*auction-img[^"]*"[^>]*>/g, 0);

        if (!href || !imgTag) continue;

        const imageUrl = imgTag.match(/\bsrc="([^"]+)"/)?.[1];
        const rawTitle = imgTag.match(/\balt="([^"]+)"/)?.[1];
        const title    = rawTitle ? this.decodeHtml(rawTitle).trim() : '';

        if (!title) continue;

        listings.push({
          id:             `${auctionId}_${lotId}`,
          site:           'kbid',
          title,
          currentPrice,
          imageUrl,
          url:            `${BASE_URL}${href}`,
          endTime,
          scrapedAt:      this.now(),
          searchConfigId: config.id,
        });
      }

      this.log(`Found ${listings.length} listings`);
    } catch (err) {
      this.logError('Search failed', err);
    }

    return listings;
  }

  private parseSockoas(html: string): Map<string, SockLot> {
    const map   = new Map<string, SockLot>();
    const keyRe = /"key"\s*:\s*"(lot:k-bid:\d+:\d+)"/g;
    let km: RegExpExecArray | null;

    while ((km = keyRe.exec(html)) !== null) {
      const key = km[1];
      // Scan a window around the key for sibling fields (order-independent)
      const window = html.slice(Math.max(0, km.index - 300), Math.min(html.length, km.index + 500));
      const bid    = window.match(/"currentBid"\s*:\s*(\d+(?:\.\d+)?)/)?.[1];
      const ms     = window.match(/"msRemaining"\s*:\s*(\d+)/)?.[1];
      if (bid !== undefined && ms !== undefined) {
        map.set(key, { key, currentBid: parseFloat(bid), msRemaining: parseInt(ms, 10) });
      }
    }

    return map;
  }

  private lastMatch(text: string, re: RegExp, group: number): string | null {
    let last: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) last = m[group];
    return last;
  }

  private decodeHtml(s: string): string {
    return s
      .replace(/&amp;/g,  '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g,  "'")
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>');
  }
}
