import { Router } from 'express';
import { runCrawl } from '../../crawlers/index.js';
import {
  getSearchConfig,
  getSearchConfigs,
  saveListings,
  markLastRunAt,
  cleanupExpiredListings,
} from '../../db/Database.js';
import type { SearchConfig } from '../../types/index.js';
import { getSchedulerStatus } from '../../scheduler/Scheduler.js';
import { indexBatch } from '../../vector/VectorStore.js';

const router = Router();

// Trigger crawl for a specific saved search config
router.post('/config/:id', async (req, res) => {
  const id     = Number(req.params.id);
  const config = getSearchConfig(id);
  if (!config) return res.status(404).json({ error: 'Search config not found' });

  console.log(`[crawl] Manual trigger for config id=${id} "${config.name}"`);
  const result = await runCrawl(config);
  saveListings(result.listings);
  markLastRunAt(id);
  const removed = cleanupExpiredListings();

  // Index in background — don't await so the HTTP response returns immediately
  indexBatch(result.listings).catch(e => console.warn('[vector] index error:', e));

  res.json({
    saved:     result.listings.length,
    removed,
    errors:    result.errors,
    crawledAt: result.crawledAt,
  });
});

// Trigger crawl for all enabled search configs
// Accepts optional body: { sites: string[] } to restrict which sites are crawled.
// Each config's own sites list is intersected with the requested sites, so a config
// that only targets GovDeals is skipped entirely when the user deselects GovDeals.
router.post('/all', async (req, res) => {
  const requestedSites: string[] | undefined = req.body?.sites;

  const configs: SearchConfig[] = getSearchConfigs()
    .filter(c => c.enabled)
    .flatMap(c => {
      if (!requestedSites?.length) return [c];
      // Keep only the sites the user selected; skip the config if none match
      const filteredSites = c.sites.filter(s => requestedSites.includes(s));
      return filteredSites.length ? [{ ...c, sites: filteredSites }] : [];
    });

  if (!configs.length) {
    return res.json({ saved: 0, message: 'No matching enabled search configs for the selected sites.' });
  }

  let totalSaved = 0;
  const allErrors: string[] = [];
  const allListings = [];

  for (const config of configs) {
    const result = await runCrawl(config);
    saveListings(result.listings);
    if (config.id) markLastRunAt(config.id);
    totalSaved += result.listings.length;
    allErrors.push(...result.errors);
    allListings.push(...result.listings);
  }

  const removed = cleanupExpiredListings();
  indexBatch(allListings).catch(e => console.warn('[vector] index error:', e));
  res.json({ saved: totalSaved, removed, errors: allErrors, crawledAt: new Date().toISOString() });
});

// Ad-hoc crawl without saving a config
router.post('/adhoc', async (req, res) => {
  const body = req.body;
  if (!body.keywords?.length) {
    return res.status(400).json({ error: 'keywords array is required' });
  }

  const result = await runCrawl({
    name:               'ad-hoc',
    keywords:           body.keywords,
    categories:         body.categories ?? [],
    minPrice:           body.minPrice,
    maxPrice:           body.maxPrice,
    endingWithinHours:  body.endingWithinHours,
    sites:              body.sites ?? ['shopgoodwill', 'govdeals'],
    enabled:            true,
  });

  saveListings(result.listings);
  const removed = cleanupExpiredListings();
  indexBatch(result.listings).catch(e => console.warn('[vector] index error:', e));

  res.json({
    saved:     result.listings.length,
    removed,
    errors:    result.errors,
    crawledAt: result.crawledAt,
  });
});

// Manual cleanup of expired (non-favourite) listings
router.post('/cleanup', (_req, res) => {
  const removed = cleanupExpiredListings();
  res.json({ removed });
});

// Scheduler status
router.get('/scheduler', (_req, res) => {
  res.json(getSchedulerStatus());
});

export default router;
