import { Router } from 'express';
import { semanticSearch, getIndexedCount, isAvailable, indexBatch } from '../../vector/VectorStore.js';
import { getDb } from '../../db/Database.js';
import type { AuctionListing } from '../../types/index.js';

const router = Router();

// GET /api/semantic/status
router.get('/status', async (_req, res) => {
  res.json({
    available: isAvailable(),
    indexed:   isAvailable() ? await getIndexedCount() : 0,
  });
});

// POST /api/semantic/search
// Body: { query: string, k?: number }
router.post('/search', async (req, res) => {
  const { query, k = 10 } = req.body as { query?: string; k?: number };

  if (!query?.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  if (!isAvailable()) {
    return res.status(503).json({ error: 'Semantic search is not available' });
  }

  try {
    const matches = await semanticSearch(query.trim(), Math.min(Number(k), 50));

    if (!matches.length) {
      return res.json({ listings: [], total: 0, query });
    }

    // Fetch full listing details from SQLite for the matched IDs
    const db = getDb();
    const listings: AuctionListing[] = [];

    for (const match of matches) {
      const row = db
        .prepare('SELECT * FROM listings WHERE id = :id AND site = :site')
        .get({ id: match.listingId, site: match.site }) as Record<string, unknown> | undefined;

      if (row) {
        listings.push({
          id:           row.id as string,
          site:         row.site as AuctionListing['site'],
          title:        row.title as string,
          description:  row.description as string | undefined,
          currentPrice: row.current_price as number,
          buyNowPrice:  row.buy_now_price as number | undefined,
          imageUrl:     row.image_url as string | undefined,
          url:          row.url as string,
          endTime:      row.end_time as string,
          category:     row.category as string | undefined,
          seller:       row.seller as string | undefined,
          bidCount:     row.bid_count as number | undefined,
          location:     row.location as string | undefined,
          condition:    row.condition_text as string | undefined,
          scrapedAt:    row.scraped_at as string,
          searchConfigId: row.search_config_id as number | undefined,
        });
      }
    }

    res.json({ listings, total: listings.length, query });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/semantic/reindex  — backfill all SQLite listings into Ruvector
router.post('/reindex', async (_req, res) => {
  if (!isAvailable()) {
    return res.status(503).json({ error: 'Semantic search is not available' });
  }

  const db = getDb();
  const rows = db.prepare('SELECT * FROM listings').all() as Record<string, unknown>[];

  const listings: AuctionListing[] = rows.map(row => ({
    id:           row.id as string,
    site:         row.site as AuctionListing['site'],
    title:        row.title as string,
    description:  row.description as string | undefined,
    currentPrice: row.current_price as number,
    buyNowPrice:  row.buy_now_price as number | undefined,
    imageUrl:     row.image_url as string | undefined,
    url:          row.url as string,
    endTime:      row.end_time as string,
    category:     row.category as string | undefined,
    seller:       row.seller as string | undefined,
    bidCount:     row.bid_count as number | undefined,
    location:     row.location as string | undefined,
    condition:    row.condition_text as string | undefined,
    scrapedAt:    row.scraped_at as string,
    searchConfigId: row.search_config_id as number | undefined,
  }));

  // Run in background so HTTP responds immediately
  indexBatch(listings).catch(e => console.warn('[vector] reindex error:', e));

  res.json({ message: `Reindexing ${listings.length} listings in background` });
});

export default router;
