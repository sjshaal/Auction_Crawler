import { BaseCrawler } from './BaseCrawler.js';
import type { AuctionListing, SearchConfig } from '../types/index.js';

// HiBid exposes a public GraphQL API — no browser or session required.
// Search endpoint: POST https://hibid.com/graphql, operation LotSearch
//
// End-time note: bidCloseDateTime is unreliable because HiBid uses soft-close
// (bids placed in the final minutes extend the deadline). We compute end time
// from timeLeftSeconds instead, which is always accurate at query time.

const GQL_ENDPOINT = 'https://hibid.com/graphql';
const ITEM_BASE    = 'https://hibid.com/lot';

const LOT_SEARCH_QUERY = `
query LotSearch(
  $pageNumber: Int!,
  $pageLength: Int!,
  $searchText: String = null,
  $status: AuctionLotStatus = null,
  $shippingOffered: Boolean = false,
  $isArchive: Boolean = false,
  $countAsView: Boolean = true,
  $hideGoogle: Boolean = false
) {
  lotSearch(
    input: {
      searchText: $searchText,
      status: $status,
      shippingOffered: $shippingOffered,
      isArchive: $isArchive,
      countAsView: $countAsView,
      hideGoogle: $hideGoogle
    }
    pageNumber: $pageNumber
    pageLength: $pageLength
  ) {
    pagedResults {
      totalCount
      results {
        id
        lead
        lotState {
          highBid
          bidCount
          minBid
          isClosed
          timeLeftSeconds
        }
        featuredPicture {
          thumbnailLocation
        }
        auction {
          eventName
          auctioneer { name }
        }
      }
    }
  }
}`;

interface HBLotState {
  highBid:         number;
  bidCount:        number;
  minBid:          number;
  isClosed:        boolean;
  timeLeftSeconds: number;
}

interface HBItem {
  id:              number;
  lead:            string;
  lotState:        HBLotState;
  featuredPicture: { thumbnailLocation: string } | null;
  auction: {
    eventName:  string;
    auctioneer: { name: string };
  };
}

export class HiBidCrawler extends BaseCrawler {
  readonly siteName = 'hibid';

  async search(config: SearchConfig): Promise<AuctionListing[]> {
    const keywords = config.keywords.join(' ');
    this.log(`Searching for: "${keywords}"`);

    const listings: AuctionListing[] = [];

    try {
      const resp = await fetch(GQL_ENDPOINT, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
          'Origin':       'https://hibid.com',
          'Referer':      `https://hibid.com/lots?q=${encodeURIComponent(keywords)}&status=OPEN`,
          'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          operationName: 'LotSearch',
          variables: {
            searchText:      keywords,
            status:          'OPEN',
            pageNumber:      1,
            pageLength:      100,
            shippingOffered: false,
            isArchive:       false,
            countAsView:     false,
            hideGoogle:      false,
          },
          query: LOT_SEARCH_QUERY,
        }),
      });

      if (!resp.ok) {
        this.logError(`GraphQL request failed: HTTP ${resp.status}`);
        return [];
      }

      const data: any = await resp.json();
      const items: HBItem[] = data?.data?.lotSearch?.pagedResults?.results ?? [];
      this.log(`Found ${items.length} items (of ${data?.data?.lotSearch?.pagedResults?.totalCount ?? '?'} total)`);

      const now = Date.now();

      for (const item of items) {
        const state = item.lotState;

        // Skip expired or closed lots
        if (state.isClosed || state.timeLeftSeconds <= 0) continue;

        // Compute end time from timeLeftSeconds — accurate even after soft-close extensions
        const endTime = new Date(now + state.timeLeftSeconds * 1000).toISOString();

        // Current price: highBid if bids exist, otherwise minBid (starting price)
        const currentPrice = state.bidCount > 0 ? state.highBid : state.minBid;

        if (config.minPrice && currentPrice < config.minPrice) continue;
        if (config.maxPrice && currentPrice > config.maxPrice) continue;

        if (config.endingWithinHours) {
          const hoursLeft = state.timeLeftSeconds / 3_600;
          if (hoursLeft > config.endingWithinHours) continue;
        }

        listings.push({
          id:             String(item.id),
          site:           'hibid',
          title:          item.lead,
          currentPrice,
          imageUrl:       item.featuredPicture?.thumbnailLocation,
          url:            `${ITEM_BASE}/${item.id}`,
          endTime,
          seller:         item.auction?.auctioneer?.name,
          bidCount:       state.bidCount,
          scrapedAt:      this.now(),
          searchConfigId: config.id,
        });
      }
    } catch (err) {
      this.logError('Search failed', err);
    }

    return listings;
  }
}
