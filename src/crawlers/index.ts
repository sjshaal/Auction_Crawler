import { ShopGoodwillCrawler }   from './ShopGoodwillCrawler.js';
import { GovDealsCrawler }       from './GovDealsCrawler.js';
import { SalvationArmyCrawler }  from './SalvationArmyCrawler.js';
import { HiBidCrawler }          from './HiBidCrawler.js';
import { KBidCrawler }           from './KBidCrawler.js';
import { PublicSurplusCrawler }  from './PublicSurplusCrawler.js';
import type { AuctionListing, SearchConfig, CrawlResult } from '../types/index.js';
import type { Site } from '../types/index.js';

const CRAWLERS: Record<Site, { search: (c: SearchConfig) => Promise<AuctionListing[]> }> = {
  shopgoodwill:         new ShopGoodwillCrawler(),
  govdeals:             new GovDealsCrawler(),
  shopthesalvationarmy: new SalvationArmyCrawler(),
  hibid:                new HiBidCrawler(),
  kbid:                 new KBidCrawler(),
  publicsurplus:        new PublicSurplusCrawler(),
};

export async function runCrawl(config: SearchConfig): Promise<CrawlResult> {
  const errors:   string[]         = [];
  const listings: AuctionListing[] = [];

  const sites = config.sites.filter(s => s in CRAWLERS);

  await Promise.allSettled(
    sites.map(async site => {
      try {
        const found = await CRAWLERS[site].search(config);
        listings.push(...found);
      } catch (err) {
        const msg = `${site}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        console.error(`[crawl] ${msg}`);
      }
    })
  );

  return {
    listings,
    totalFound: listings.length,
    crawledAt:  new Date().toISOString(),
    errors,
  };
}
