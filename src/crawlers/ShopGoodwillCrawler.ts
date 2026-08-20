import { chromium } from 'playwright';
import { BaseCrawler } from './BaseCrawler.js';
import type { AuctionListing, SearchConfig } from '../types/index.js';

interface SGWItem {
  itemId:        number;
  title:         string;
  description?:  string;
  currentPrice:  number;
  buyNowPrice?:  number;
  itemImageGuid?: string;
  imageURL?:     string;
  endingTime?:   string;
  endTime?:      string;
  categoryName?: string;
  sellerName?:   string;
  numBids?:      number;   // confirmed API field name — was incorrectly mapped as quantityBid
}

interface SGWResponse {
  searchResults?: { items?: SGWItem[]; totalItems?: number };
}

export class ShopGoodwillCrawler extends BaseCrawler {
  readonly siteName = 'shopgoodwill';

  async search(config: SearchConfig): Promise<AuctionListing[]> {
    const keywords = config.keywords.join(' ');
    this.log(`Searching for: "${keywords}"`);

    const browser = await chromium.launch({ headless: true });
    const listings: AuctionListing[] = [];

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      // Load homepage so Angular initializes (routing doesn't work on a cold direct URL)
      this.log('Loading homepage...');
      await page.goto('https://shopgoodwill.com', { waitUntil: 'load', timeout: 30_000 });

      // Find the search input — ShopGoodwill uses #txtGlobalSearch (type="text", not type="search")
      await page.waitForSelector('#txtGlobalSearch', { timeout: 10_000 });
      const searchInput = await page.$('#txtGlobalSearch');
      if (!searchInput) {
        this.logError('Could not find search input on ShopGoodwill homepage');
        return [];
      }

      // Start waiting for the API response AFTER the page has loaded,
      // so the 30s budget is spent only on the search, not on the page load
      const apiResponsePromise = page.waitForResponse(
        resp => resp.url().includes('Search/ItemListing'),
        { timeout: 30_000 }
      ).catch(() => null);

      this.log('Submitting search...');
      await searchInput.fill(keywords);
      await searchInput.press('Enter');

      const apiResp = await apiResponsePromise;
      if (!apiResp) {
        this.logError('Search API response not received within timeout');
        return [];
      }

      const data = await apiResp.json().catch(() => null) as SGWResponse | null;
      const items = data?.searchResults?.items ?? [];
      this.log(`Found ${items.length} items`);

      for (const item of items) {
        const listing = this.mapItem(item, config);
        if (!listing.endTime || this.isExpired(listing.endTime)) continue;

        // Apply price filters (the search input doesn't support price range)
        if (config.minPrice && listing.currentPrice < config.minPrice) continue;
        if (config.maxPrice && listing.currentPrice > config.maxPrice) continue;

        // Apply ending-within filter
        if (config.endingWithinHours) {
          const hoursLeft = (new Date(listing.endTime).getTime() - Date.now()) / 3_600_000;
          if (hoursLeft > config.endingWithinHours) continue;
        }

        listings.push(listing);
      }
    } catch (err) {
      this.logError('Search failed', err);
    } finally {
      await browser.close();
    }

    return listings;
  }

  private mapItem(item: SGWItem, config: SearchConfig): AuctionListing {
    const imageUrl = item.imageURL
      ?? (item.itemImageGuid
        ? `https://shopgoodwill.com/Content/images/listings/${item.itemImageGuid}_thumb.jpg`
        : undefined);

    const rawEnd = item.endingTime ?? item.endTime ?? '';

    return {
      id:           String(item.itemId),
      site:         'shopgoodwill',
      title:        item.title,
      description:  item.description,
      currentPrice: item.currentPrice,
      buyNowPrice:  item.buyNowPrice || undefined,
      imageUrl,
      url:          `https://shopgoodwill.com/item/${item.itemId}`,
      endTime:      rawEnd ? this.parsePacificDate(rawEnd) : '',
      category:     item.categoryName,
      seller:       item.sellerName,
      bidCount:     item.numBids ?? 0,
      scrapedAt:    this.now(),
      searchConfigId: config.id,
    };
  }

  // ShopGoodwill returns endingTime in Pacific Time with no timezone indicator.
  // Appending the correct PT offset prevents the host machine's local timezone
  // from being applied, which causes a 3-hour error on Eastern Time machines.
  private parsePacificDate(raw: string): string {
    if (!raw) return '';
    // If the string already carries timezone info, trust it as-is
    if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw.trim())) {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    // Determine current Pacific offset (PDT = -07:00, PST = -08:00)
    const ptLabel = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles', timeZoneName: 'short',
    });
    const offset = ptLabel.includes('PDT') ? '-07:00' : '-08:00';
    // ISO strings (e.g. "2026-05-21T19:48:00") need offset with no space;
    // slash-format strings (e.g. "5/22/2026 6:00 AM") need a space before offset
    const sep = raw.includes('T') ? '' : ' ';
    const d = new Date(`${raw}${sep}${offset}`);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

}
