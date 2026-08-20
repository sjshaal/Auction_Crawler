import { BaseCrawler } from './BaseCrawler.js';
import type { AuctionListing, SearchConfig } from '../types/index.js';

// PublicSurplus is a US government-surplus auction platform (The Public Group).
// It requires a session cookie from the homepage before search requests return data.
// Results are server-side rendered HTML — no JSON API available.
//
// Key patterns (confirmed from live capture):
//   Grid card ID  : id="val_{auctionId}searchGrid"
//   Title         : <a href="/sms/auction/view?auc={id}" title="TITLE">
//   Price         : <b id="val_{id}searchGrid">$X.XX</b>
//   End time (ms) : updateTimeLeftSpan(timeLeftInfoMap, {id}, "...", currentMs, endMs, ...)
//   Image         : /sms/docviewer/mainaucdoc?auc={id}&thumb=b
//   Location      : <span class="auction-item-state">XX</span>  (state abbreviation)

const BASE_URL   = 'https://www.publicsurplus.com';
const HOME_URL   = `${BASE_URL}/sms/browse/home`;
const SEARCH_URL = `${BASE_URL}/sms/browse/search`;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class PublicSurplusCrawler extends BaseCrawler {
  readonly siteName = 'publicsurplus';

  async search(config: SearchConfig): Promise<AuctionListing[]> {
    const keywords = config.keywords.join(' ');
    this.log(`Searching for: "${keywords}"`);

    const listings: AuctionListing[] = [];

    try {
      // Step 1 — get a session cookie from the homepage
      const homeResp = await fetch(HOME_URL, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      });
      const rawCookie = homeResp.headers.get('set-cookie') ?? '';
      const cookie    = rawCookie.split(';')[0]; // just "smssid=..."

      if (!cookie) {
        this.logError('No session cookie returned from homepage');
        return [];
      }

      // Step 2 — search with the session cookie
      const url      = `${SEARCH_URL}?posting=y&scope=&keyWord=${encodeURIComponent(keywords)}&Submit4=`;
      const resp     = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept':     'text/html',
          'Referer':    HOME_URL,
          'Cookie':     cookie,
        },
      });

      if (!resp.ok) {
        this.logError(`HTTP ${resp.status}`);
        return [];
      }

      const html = await resp.text();

      // Quick bail-out when no results (page body is ~50k vs ~100k+ with results)
      if (!html.includes('searchGrid')) {
        this.log('No results found');
        return [];
      }

      // Find every grid card by its price element ID
      const idRe = /id="val_(\d+)searchGrid"/g;
      let m: RegExpExecArray | null;

      while ((m = idRe.exec(html)) !== null) {
        const auctionId = m[1];
        const pos       = m.index;

        // ── Title ──────────────────────────────────────────────────────────
        // Look in the 2000 chars before the price element for the titled anchor
        const before = html.slice(Math.max(0, pos - 2000), pos);
        const titleMatch = before.match(/href="\/sms\/auction\/view\?auc=\d+"[^>]*title="([^"]+)"/);
        const title = titleMatch?.[1]?.replace(/^#\d+ - /, '').trim() ?? '';
        if (!title) continue;

        // ── Price ───────────────────────────────────────────────────────────
        // The price sits between the id= attr and </b>; allow whitespace around the value
        const priceMatch = html.slice(pos, pos + 200).match(/>\s*\$?([\d,.]+)\s*</);
        const currentPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

        if (config.minPrice && currentPrice < config.minPrice) continue;
        if (config.maxPrice && currentPrice > config.maxPrice) continue;

        // ── End time ────────────────────────────────────────────────────────
        // updateTimeLeftSpan is in a <script> block ~500-1500 chars after the val_ span
        const endMatch = html.slice(pos, pos + 1500).match(
          new RegExp(`updateTimeLeftSpan\\(timeLeftInfoMap,\\s*${auctionId},\\s*"[^"]+",\\s*\\d+,\\s*(\\d+)`)
        );
        const endMs = endMatch ? parseInt(endMatch[1], 10) : 0;
        if (!endMs || endMs < Date.now()) continue; // skip expired

        const endTime = new Date(endMs).toISOString();

        if (config.endingWithinHours) {
          const hoursLeft = (endMs - Date.now()) / 3_600_000;
          if (hoursLeft > config.endingWithinHours) continue;
        }

        // ── Location ────────────────────────────────────────────────────────
        const stateMatch = before.match(/<span class="auction-item-state">\s*([A-Z]{2})\s*<\/span>/);
        const location = stateMatch?.[1];

        listings.push({
          id:             auctionId,
          site:           'publicsurplus',
          title,
          currentPrice,
          imageUrl:       `${BASE_URL}/sms/docviewer/mainaucdoc?auc=${auctionId}&thumb=b`,
          url:            `${BASE_URL}/sms/auction/view?auc=${auctionId}`,
          endTime,
          location,
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
}
