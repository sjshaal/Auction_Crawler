import { Router } from 'express';
import { getListings, toggleFavorite, deleteListing, saveListings } from '../../db/Database.js';
import { importFromUrl } from '../../crawlers/importUrl.js';
import type { ListingFilter, SortBy, Site } from '../../types/index.js';

const router = Router();

router.get('/', (req, res) => {
  const q = req.query;

  const filter: ListingFilter = {
    keyword:           q.keyword  as string  | undefined,
    minPrice:          q.minPrice ? Number(q.minPrice) : undefined,
    maxPrice:          q.maxPrice ? Number(q.maxPrice) : undefined,
    endingWithinHours: q.endingWithinHours ? Number(q.endingWithinHours) : undefined,
    category:          q.category as string  | undefined,
    sortBy:            q.sortBy   as SortBy  | undefined,
    favoritesOnly:     q.favoritesOnly === 'true',
    limit:             q.limit    ? Number(q.limit)    : 60,
    offset:            q.offset   ? Number(q.offset)   : 0,
  };

  if (q.sites) {
    filter.sites = (q.sites as string).split(',') as Site[];
  }

  const result = getListings(filter);
  res.json(result);
});

// POST /api/listings/import-url  — fetch a single item by URL and save it
// Must come before /:site/:id routes so "import-url" isn't parsed as a :site param
router.post('/import-url', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url?.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const listing = await importFromUrl(url.trim());
    saveListings([listing]);
    res.json(listing);
  } catch (err: any) {
    res.status(422).json({ error: err?.message ?? 'Import failed' });
  }
});

// POST /api/listings/manual  — save a manually-entered listing
router.post('/manual', (req, res) => {
  const b = req.body as Record<string, string>;
  const { site, title, url, price, endTime, imageUrl } = b;

  const validSites: Site[] = ['shopgoodwill', 'govdeals', 'shopthesalvationarmy', 'hibid', 'kbid', 'publicsurplus'];
  if (!site || !validSites.includes(site as Site)) {
    return res.status(400).json({ error: 'Valid site is required' });
  }
  if (!title?.trim())   return res.status(400).json({ error: 'Title is required' });
  if (!url?.trim())     return res.status(400).json({ error: 'URL is required' });
  if (!endTime?.trim()) return res.status(400).json({ error: 'End time is required' });

  const endDate = new Date(endTime);
  if (isNaN(endDate.getTime())) return res.status(400).json({ error: 'Invalid end time' });
  if (endDate < new Date())     return res.status(400).json({ error: 'End time is in the past' });

  // Generate a unique-enough ID from the URL
  const id = 'manual-' + Buffer.from(url).toString('base64').slice(0, 12).replace(/[^a-z0-9]/gi, '');

  const listing = {
    id,
    site:         site as Site,
    title:        title.trim(),
    currentPrice: price ? parseFloat(price) : 0,
    url:          url.trim(),
    endTime:      endDate.toISOString(),
    imageUrl:     imageUrl?.trim() || undefined,
    scrapedAt:    new Date().toISOString(),
  };

  saveListings([listing]);
  res.json(listing);
});

// POST /api/listings/:site/:id/favorite  — toggle favorite, returns { isFavorite }
router.post('/:site/:id/favorite', (req, res) => {
  const { site, id } = req.params;
  const result = toggleFavorite(id, site);
  res.json(result);
});

// DELETE /api/listings/:site/:id  — remove a listing from the DB
router.delete('/:site/:id', (req, res) => {
  const { site, id } = req.params;
  deleteListing(id, site);
  res.status(204).send();
});

export default router;
