// importUrl.ts — fetch a single listing by URL from any supported site.
//
// Supported sites and how data is fetched:
//   shopgoodwill  → buyerapi.shopgoodwill.com REST JSON
//   hibid         → hibid.com/api/v1/lot/{id} REST JSON
//   kbid          → page HTML + Sockoas constructor + galleriaData
//   publicsurplus → page HTML (after homepage session cookie)
//
// GovDeals (Akamai) and Salvation Army (requires Playwright) are not supported.

import type { AuctionListing } from '../types/index.js';

const UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const now = () => new Date().toISOString();

// ── Public entry point ────────────────────────────────────────────────────────

export async function importFromUrl(rawUrl: string): Promise<AuctionListing> {
  const url = rawUrl.trim();

  if (/shopgoodwill\.com/i.test(url))        return importShopGoodwill(url);
  if (/hibid\.com/i.test(url))               return importHiBid(url);
  if (/\bk-bid\.com\b/i.test(url))           return importKBid(url);
  if (/publicsurplus\.com/i.test(url))       return importPublicSurplus(url);
  if (/govdeals\.com/i.test(url))            throw new Error('GovDeals is bot-protected — direct URL import is not supported');
  if (/shopthesalvationarmy\.org/i.test(url)) throw new Error('Salvation Army URL import is not yet supported');

  throw new Error('Unrecognized auction site. Supported: ShopGoodwill, HiBid, K-BID, PublicSurplus');
}

// ── ShopGoodwill ──────────────────────────────────────────────────────────────
// URL: shopgoodwill.com/item/{itemId}
// API: buyerapi.shopgoodwill.com/api/ItemDetail/GetItemDetailModelByItemId/{itemId}
// Image: imageServer (CDN base) + thumbnailUrlString (relative path)

async function importShopGoodwill(url: string): Promise<AuctionListing> {
  const m = url.match(/\/item\/(\d+)/);
  if (!m) throw new Error('Could not extract item ID from ShopGoodwill URL');
  const itemId = m[1];

  const resp = await fetch(
    `https://buyerapi.shopgoodwill.com/api/ItemDetail/GetItemDetailModelByItemId/${itemId}`,
    {
      headers: {
        'Accept':     'application/json',
        'Origin':     'https://shopgoodwill.com',
        'Referer':    `https://shopgoodwill.com/item/${itemId}`,
        'User-Agent': UA,
      },
    }
  );
  if (!resp.ok) throw new Error(`ShopGoodwill API error: HTTP ${resp.status}`);

  const d = await resp.json() as any;
  if (!d?.title) throw new Error('ShopGoodwill API returned no data — item may not exist');

  const rawEnd = d.endTime ?? d.endingTime ?? '';
  if (!rawEnd) throw new Error('ShopGoodwill API did not return an end time');

  // ShopGoodwill returns times in their local timezone (Pacific) with no offset marker.
  // Appending 'Z' would treat them as UTC — wrong. Instead, use the serverTime field
  // (also local, same tz) to compute the real UTC offset:
  //   offset = Date.now() − Date.parse(serverTime + 'Z')  ≈ +7h during PDT
  //   endUtcMs = Date.parse(rawEnd + 'Z') + offset
  const serverOffsetMs = d.serverTime
    ? Date.now() - Date.parse(d.serverTime + 'Z')
    : 0;
  const endMs   = Date.parse(rawEnd + 'Z') + serverOffsetMs;
  const endTime = new Date(endMs).toISOString();
  if (endMs < Date.now()) throw new Error('This ShopGoodwill listing has already ended');

  // Full image URL = CDN base + relative thumbnail path.
  // thumbnailUrlString may be a semicolon-separated list — take only the first entry.
  const firstThumb = (d.thumbnailUrlString?.split(';')[0]?.trim() ?? '').replace(/\\/g, '/');
  const imageUrl = (d.imageServer && firstThumb && !firstThumb.includes('No-Image'))
    ? `${d.imageServer}${firstThumb}`
    : (d.imageUrlString?.split(';')[0]?.trim().replace(/\\/g, '/') || undefined);

  return {
    id:           String(d.itemId ?? itemId),
    site:         'shopgoodwill',
    title:        d.title,
    description:  d.description ?? undefined,
    currentPrice: d.currentPrice ?? 0,
    buyNowPrice:  d.buyNowPrice  || undefined,
    imageUrl,
    url:          `https://shopgoodwill.com/item/${itemId}`,
    endTime,
    category:     d.categoryName ?? undefined,
    seller:       d.sellerName   ?? undefined,
    bidCount:     d.numBids      ?? 0,
    scrapedAt:    now(),
  };
}

// ── HiBid ─────────────────────────────────────────────────────────────────────
// URL: hibid.com/lot/{lotId}  (optional slug after the ID is ignored)
// API: hibid.com/api/v1/lot/{lotId}  → JSON with tileModel + lotStatus

async function importHiBid(url: string): Promise<AuctionListing> {
  const m = url.match(/\/lot\/(\d+)/);
  if (!m) throw new Error('Could not extract lot ID from HiBid URL');
  const lotId = m[1];

  const resp = await fetch(`https://hibid.com/api/v1/lot/${lotId}`, {
    headers: {
      'Accept':     'application/json',
      'Referer':    `https://hibid.com/lot/${lotId}`,
      'User-Agent': UA,
    },
  });
  if (!resp.ok) throw new Error(`HiBid API error: HTTP ${resp.status}`);

  const d     = await resp.json() as any;
  const tile  = d?.tileModel;
  const state = tile?.lotStatus;

  if (!tile?.lead) throw new Error('HiBid API returned no data — lot may not exist');

  const timeLeftSeconds: number = state?.timeLeftSeconds ?? -1;
  if (timeLeftSeconds <= 0) throw new Error('This HiBid lot has already ended');

  const currentPrice = (state?.bidCount ?? 0) > 0
    ? (state?.highBid ?? 0)
    : (state?.minBid  ?? 0);

  return {
    id:           lotId,
    site:         'hibid',
    title:        tile.lead,
    currentPrice,
    imageUrl:     tile.featuredPicture?.thumbnailLocation ?? undefined,
    url:          `https://hibid.com/lot/${lotId}`,
    endTime:      new Date(Date.now() + timeLeftSeconds * 1000).toISOString(),
    bidCount:     state?.bidCount ?? 0,
    scrapedAt:    now(),
  };
}

// ── K-BID ─────────────────────────────────────────────────────────────────────
// URL: k-bid.com/auction/{auctionId}/item/{itemNum}
// Data is embedded in the page HTML:
//   • Title   — og:title meta tag
//   • Price   — Sockoas constructor call (same format as search page)
//   • EndTime — Sockoas msRemaining field
//   • Image   — galleriaData JSON array, first "image" URL

async function importKBid(url: string): Promise<AuctionListing> {
  const m = url.match(/\/auction\/(\d+)\/item\/(\d+)/);
  if (!m) throw new Error('Could not extract auction/item IDs from K-BID URL. Expected format: k-bid.com/auction/{id}/item/{num}');
  const [, auctionId, itemNum] = m;

  const resp = await fetch(`https://www.k-bid.com/auction/${auctionId}/item/${itemNum}`, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
  });
  if (!resp.ok) throw new Error(`K-BID returned HTTP ${resp.status}`);

  const html = await resp.text();

  // Title: og:title, stripped of " | Online Auction | K-BID" suffix
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)?.[1] ?? '';
  const title   = ogTitle.replace(/\s*\|\s*Online Auction.*$/i, '').trim();
  if (!title) throw new Error('Could not extract title from K-BID page');

  // Sockoas constructor: new Sockoas('...', '...', '...', 'jwt', [{lot object}])
  // The lot object contains: key, nextBid, currentBid, msRemaining, lastModifiedTime
  const sockBlock     = html.match(/new Sockoas\([^;]+\[(\{[\s\S]+?\})\]\)/)?.[1] ?? '';
  const currentBid    = parseFloat(sockBlock.match(/'currentBid'\s*:\s*([\d.]+)/)?.[1]  ?? '0');
  const msRemaining   = parseFloat(sockBlock.match(/'msRemaining'\s*:\s*([\d.]+)/)?.[1] ?? '0');

  if (!msRemaining || msRemaining <= 0) throw new Error('This K-BID item has already ended');

  // Image: first "image":"..." entry inside galleriaData (CDN rackcdn.com URLs)
  const galleriaMatch = html.match(/"image"\s*:\s*"(https?:[^"]+rackcdn[^"]+)"/);
  const imageUrl      = galleriaMatch ? galleriaMatch[1].replace(/\\/g, '') : undefined;

  return {
    id:           `${auctionId}-${itemNum}`,
    site:         'kbid',
    title,
    currentPrice: currentBid,
    imageUrl,
    url:          `https://www.k-bid.com/auction/${auctionId}/item/${itemNum}`,
    endTime:      new Date(Date.now() + msRemaining).toISOString(),
    scrapedAt:    now(),
  };
}

// ── PublicSurplus ─────────────────────────────────────────────────────────────
// URL: publicsurplus.com/sms/auction/view?auc={auctionId}
// Requires a session cookie from the homepage (same pattern as the search crawler).
// Title from <meta name="description">, end time from updateTimeLeftSpan script.

async function importPublicSurplus(url: string): Promise<AuctionListing> {
  const m = url.match(/[?&]auc=(\d+)/);
  if (!m) throw new Error('Could not extract auction ID from PublicSurplus URL. Expected: publicsurplus.com/sms/auction/view?auc={id}');
  const auctionId = m[1];

  const BASE = 'https://www.publicsurplus.com';

  // Step 1: homepage GET to obtain the smssid session cookie
  const homeResp = await fetch(`${BASE}/sms/browse/home`, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
  });
  const cookie = (homeResp.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie) throw new Error('Failed to get session cookie from PublicSurplus');

  // Step 2: fetch the auction item page
  const resp = await fetch(`${BASE}/sms/auction/view?auc=${auctionId}`, {
    headers: {
      'User-Agent': UA,
      'Accept':     'text/html',
      'Cookie':     cookie,
      'Referer':    `${BASE}/sms/browse/home`,
    },
  });
  if (!resp.ok) throw new Error(`PublicSurplus returned HTTP ${resp.status}`);

  const html = await resp.text();

  // Title: <meta name="description" content="ITEM TITLE - Seller Name"/>
  // Strip the " - Seller Name" suffix at the end
  const metaDesc = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1] ?? '';
  const title    = metaDesc.replace(/\s*-\s*[^-]+$/, '').trim();
  if (!title) throw new Error('Could not extract title from PublicSurplus page — auction may not exist');

  // Price: first $X.XX amount in the page body
  const priceMatch = html.match(/>\s*\$\s*([\d,]+\.\d{2})\s*</);
  const currentPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

  // End time: updateTimeLeftSpan(timeLeftInfoMap, {id}, "...", currentMs, endMs, ...)
  const endMatch = html.match(
    new RegExp(`updateTimeLeftSpan\\(timeLeftInfoMap,\\s*${auctionId},\\s*"[^"]+",\\s*\\d+,\\s*(\\d+)`)
  );
  const endMs = endMatch ? parseInt(endMatch[1], 10) : 0;
  if (!endMs || endMs < Date.now()) throw new Error('This PublicSurplus auction has already ended');

  return {
    id:           auctionId,
    site:         'publicsurplus',
    title,
    currentPrice,
    imageUrl:     `${BASE}/sms/docviewer/mainaucdoc?auc=${auctionId}&thumb=b`,
    url:          `${BASE}/sms/auction/view?auc=${auctionId}`,
    endTime:      new Date(endMs).toISOString(),
    scrapedAt:    now(),
  };
}
