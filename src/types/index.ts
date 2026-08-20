export type Site = 'shopgoodwill' | 'govdeals' | 'shopthesalvationarmy' | 'hibid' | 'kbid' | 'publicsurplus';

export type SortBy =
  | 'price_asc'
  | 'price_desc'
  | 'end_time_asc'
  | 'end_time_desc'
  | 'scraped_at_desc'
  | 'favorites_first';

export interface AuctionListing {
  id: string;
  site: Site;
  title: string;
  description?: string;
  currentPrice: number;
  buyNowPrice?: number;
  imageUrl?: string;
  url: string;
  endTime: string; // ISO-8601
  category?: string;
  seller?: string;
  bidCount?: number;
  location?: string;
  condition?: string;
  scrapedAt: string; // ISO-8601
  searchConfigId?: number;
  isFavorite?: boolean;
}

export interface SearchConfig {
  id?: number;
  name: string;
  keywords: string[];
  categories: string[];
  minPrice?: number;
  maxPrice?: number;
  endingWithinHours?: number;
  sites: Site[];
  enabled: boolean;
  scheduleInterval?: string; // cron expression, e.g. "0 */2 * * *"
  createdAt?: string;
  lastRunAt?: string;
}

export interface CrawlResult {
  listings: AuctionListing[];
  totalFound: number;
  crawledAt: string;
  errors: string[];
}

export interface ListingFilter {
  sites?: Site[];
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  endingWithinHours?: number;
  category?: string;
  sortBy?: SortBy;
  favoritesOnly?: boolean;
  limit?: number;
  offset?: number;
}
