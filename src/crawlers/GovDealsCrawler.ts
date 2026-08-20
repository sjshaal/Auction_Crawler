import { chromium } from 'playwright';
import { BaseCrawler } from './BaseCrawler.js';
import type { AuctionListing, SearchConfig } from '../types/index.js';

// GovDeals is protected by Akamai Bot Manager — headless Chrome is permanently blocked.
// The only reliable approach is non-headless mode with a homepage warm-up, which lets
// us intercept the maestro.lqdt1.com/search/list API response directly.
//
// API response key map (confirmed from live capture):
//   assetSearchResults  → array-like object (Object.values → items array)
//   assetId             → item ID
//   accountId           → seller account (needed for URL + image)
//   assetShortDescription → title
//   currentBid          → current price
//   assetAuctionEndDateUtc → end time, already UTC ISO (e.g. "2026-06-02T19:10:00Z")
//   categoryDescription → category
//   companyName         → seller name
//   photo               → image filename prefix

interface GDItem {
  assetId:               number;
  accountId:             number;
  assetShortDescription: string;
  currentBid:            number | null;
  assetAuctionEndDateUtc?: string;
  categoryDescription?:  string;
  companyName?:          string;
  photo?:                string;
  locationCity?:         string;
  locationState?:        string;
}

interface MaestroResponse {
  assetSearchResults?: Record<string, GDItem>;
}

const IMAGE_BASE   = 'https://webassets.lqdt1.com/assets/photos';
const ITEM_BASE    = 'https://www.govdeals.com/en/asset';
const BIDBOX_BASE  = 'https://maestro.lqdt1.com/bids/bidbox/GD';

// Confirmed stable API keys (embedded in the Angular bundle, same for all users)
const API_HEADERS = {
  'Accept':                    'application/json',
  'x-api-key':                 'af93060f-337e-428c-87b8-c74b5837d6cd',
  'ocp-apim-subscription-key': 'cf620d1d8f904b5797507dc5fd1fdb80',
  'x-user-id':                 '-1',
  'x-api-correlation-id':      '00000000-0000-0000-0000-000000000001',
  'Origin':                    'https://www.govdeals.com',
  'Referer':                   'https://www.govdeals.com/',
};

export class GovDealsCrawler extends BaseCrawler {
  readonly siteName = 'govdeals';

  async search(config: SearchConfig): Promise<AuctionListing[]> {
    const keyword = config.keywords.join(' ');
    this.log(`Searching for: "${keyword}"`);

    // headless: false is required — Akamai blocks all headless Chrome on GovDeals
    const browser = await chromium.launch({
      headless: false,
      // macOS snaps negative-coordinate windows back to the visible area.
      // Large positive coordinates push the window beyond any real screen edge.
      args: ['--no-sandbox', '--window-position=9999,9999', '--window-size=800,600'],
    });
    const listings: AuctionListing[] = [];

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();

      // Register response interceptor BEFORE any navigation
      const resultsPromise = page.waitForResponse(
        async r => {
          if (!r.url().includes('maestro.lqdt1.com/search/list')) return false;
          try {
            const req = JSON.parse((await r.request().postData()) ?? '{}');
            // The real keyword search uses responseStyle 'productsOnly' with a non-wildcard searchText
            return req.responseStyle === 'productsOnly' && req.searchText !== '*';
          } catch { return false; }
        },
        { timeout: 40_000 }
      ).catch(() => null);

      // Step 1: Load homepage to acquire Akamai session cookies
      this.log('Loading homepage for Akamai cookie warm-up...');
      await page.goto('https://www.govdeals.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector('#textSearchInput', { timeout: 10_000 });

      // Step 2: Submit the search via the search box (same as a real user)
      this.log('Submitting search...');
      await page.fill('#textSearchInput', keyword);
      await page.press('#textSearchInput', 'Enter');

      const apiResp = await resultsPromise;
      if (!apiResp) {
        this.logError('Maestro search API response not received within timeout');
        return [];
      }

      const data = await apiResp.json().catch(() => null) as MaestroResponse | null;
      // assetSearchResults is an array-like object with numeric string keys
      const items: GDItem[] = Object.values(data?.assetSearchResults ?? {});
      this.log(`Found ${items.length} items`);

      for (const item of items) {
        const price = item.currentBid ?? 0;

        if (config.minPrice && price < config.minPrice) continue;
        if (config.maxPrice && price > config.maxPrice) continue;

        const endTime = item.assetAuctionEndDateUtc ?? '';
        if (!endTime || this.isExpired(endTime)) continue;

        if (config.endingWithinHours) {
          const hoursLeft = (new Date(endTime).getTime() - Date.now()) / 3_600_000;
          if (hoursLeft > config.endingWithinHours) continue;
        }

        const imageUrl = item.photo
          ? `${IMAGE_BASE}/${item.accountId}/${item.photo.split('?')[0]}`
          : undefined;

        const location = [item.locationCity, item.locationState].filter(Boolean).join(', ') || undefined;

        listings.push({
          id:           `gd-${item.accountId}-${item.assetId}`,
          site:         'govdeals',
          title:        item.assetShortDescription,
          currentPrice: price,
          imageUrl,
          url:          `${ITEM_BASE}/${item.assetId}/${item.accountId}`,
          endTime,
          category:     item.categoryDescription,
          seller:       item.companyName,
          location,
          bidCount:     0,   // filled in below via fetchBidCounts
          scrapedAt:    this.now(),
          searchConfigId: config.id,
        });
      }

      // Fetch real bid counts from the bidbox API in parallel (no browser needed)
      if (listings.length > 0) {
        this.log(`Fetching bid counts for ${listings.length} items...`);
        await this.fetchBidCounts(listings);
      }
    } catch (err) {
      this.logError('Search failed', err);
    } finally {
      await browser.close();
    }

    return listings;
  }

  // Fetches bid counts from the maestro bidbox API in parallel (max 5 concurrent).
  // The bidbox endpoint is directly callable without browser session cookies.
  private async fetchBidCounts(listings: AuctionListing[]): Promise<void> {
    const CONCURRENCY = 5;

    const fetchOne = async (listing: AuctionListing): Promise<void> => {
      // ID format is "gd-{accountId}-{assetId}"
      const [, accountId, assetId] = listing.id.split('-');
      const url = `${BIDBOX_BASE}/${assetId}/${accountId}/1`;
      try {
        const resp = await fetch(url, { headers: API_HEADERS });
        if (resp.ok) {
          const data = await resp.json() as { bidCount?: number };
          listing.bidCount = data.bidCount ?? 0;
        }
      } catch {
        // Non-fatal — listing stays with bidCount 0
      }
    };

    // Process in batches of CONCURRENCY to avoid hammering the API
    for (let i = 0; i < listings.length; i += CONCURRENCY) {
      await Promise.all(listings.slice(i, i + CONCURRENCY).map(fetchOne));
    }

    this.log(`Bid counts fetched`);
  }
}
