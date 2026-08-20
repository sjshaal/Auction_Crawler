import { chromium } from 'playwright';
import { BaseCrawler } from './BaseCrawler.js';
import type { AuctionListing, SearchConfig } from '../types/index.js';

const SEARCH_BASE = 'https://www.shopthesalvationarmy.com/Browse';

export class SalvationArmyCrawler extends BaseCrawler {
  readonly siteName = 'shopthesalvationarmy';

  async search(config: SearchConfig): Promise<AuctionListing[]> {
    this.log(`Searching for: "${config.keywords.join(' ')}"`);

    // Correct param names confirmed from live page inspection:
    //   FullTextQuery (not q), PriceLow / PriceHigh (not minPrice / maxPrice)
    //   StatusFilter=active_only ensures we skip closed listings
    const params = new URLSearchParams({
      FullTextQuery:  config.keywords.join(' '),
      StatusFilter:   'active_only',
    });
    if (config.minPrice) params.set('PriceLow',  String(config.minPrice));
    if (config.maxPrice) params.set('PriceHigh', String(config.maxPrice));
    const url = `${SEARCH_BASE}?${params}`;

    const browser = await chromium.launch({ headless: true });
    const listings: AuctionListing[] = [];

    try {
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector('.panel.panel-default, .no-results', { timeout: 10_000 }).catch(() => {});

      const rawItems = await page.evaluate(() => {
        const results: Array<{
          id: string;
          title: string;
          price: string;
          endMs: string;
          imageUrl: string;
          url: string;
          bidCount: string;
        }> = [];

        document.querySelectorAll('.panel.panel-default').forEach(card => {
          // Use h2 link for title/URL — NOT the image anchor which appears first in DOM
          const titleLinkEl = card.querySelector('h2.galleryTitle a') as HTMLAnchorElement | null;
          const imgEl       = card.querySelector('.galleryImage img') as HTMLImageElement | null;
          const priceEl     = card.querySelector('.awe-rt-CurrentPrice .NumberPart, .awe-rt-CurrentPrice');
          const timeEl      = card.querySelector('[data-action-milliseconds]');
          const bidEl       = card.querySelector('.awe-rt-AcceptedListingActionCount');

          if (!titleLinkEl) return;

          const href    = titleLinkEl.href;
          const idMatch = href.match(/\/Details\/(\d+)\//);
          const id      = idMatch ? idMatch[1] : String(Math.random());

          // Strip leading "N Bid(s)" injected by span elements before the title text
          const rawTitle = titleLinkEl.textContent?.trim() ?? '';
          const title    = rawTitle.replace(/^\d+\s*Bid\(s\)\s*/i, '').trim();

          results.push({
            id,
            title,
            price:    priceEl?.textContent?.replace(/[^0-9.]/g, '') ?? '0',
            endMs:    timeEl?.getAttribute('data-action-milliseconds') ?? '',
            imageUrl: imgEl?.src ?? '',
            url:      href,
            bidCount: bidEl?.textContent?.trim() ?? '0',
          });
        });

        return results;
      });

      this.log(`Found ${rawItems.length} items`);

      for (const item of rawItems) {
        const price = parseFloat(item.price) || 0;

        if (config.minPrice && price < config.minPrice) continue;
        if (config.maxPrice && price > config.maxPrice) continue;

        const endTime = item.endMs
          ? new Date(parseInt(item.endMs, 10)).toISOString()
          : null;

        if (!endTime || this.isExpired(endTime)) continue;

        if (config.endingWithinHours) {
          const hoursLeft = (new Date(endTime).getTime() - Date.now()) / 3_600_000;
          if (hoursLeft > config.endingWithinHours) continue;
        }

        if (!item.title) continue;

        listings.push({
          id:           `sa-${item.id}`,
          site:         'shopthesalvationarmy',
          title:        item.title,
          currentPrice: price,
          imageUrl:     item.imageUrl || undefined,
          url:          item.url,
          endTime,
          bidCount:     parseInt(item.bidCount, 10) || 0,
          scrapedAt:    this.now(),
          searchConfigId: config.id,
        });
      }
    } catch (err) {
      this.logError('Scrape failed', err);
    } finally {
      await browser.close();
    }

    return listings;
  }
}
