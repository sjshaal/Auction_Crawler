import { Router } from 'express';
import {
  getSearchConfigs,
  getSearchConfig,
  saveSearchConfig,
  deleteSearchConfig,
} from '../../db/Database.js';
import { scheduleJob, unscheduleJob } from '../../scheduler/Scheduler.js';
import type { SearchConfig } from '../../types/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getSearchConfigs());
});

router.get('/:id', (req, res) => {
  const config = getSearchConfig(Number(req.params.id));
  if (!config) return res.status(404).json({ error: 'Not found' });
  res.json(config);
});

router.post('/', (req, res) => {
  const body = req.body as Partial<SearchConfig>;
  if (!body.name || !body.keywords?.length) {
    return res.status(400).json({ error: 'name and keywords are required' });
  }

  const config: SearchConfig = {
    name:               body.name,
    keywords:           body.keywords ?? [],
    categories:         body.categories ?? [],
    minPrice:           body.minPrice,
    maxPrice:           body.maxPrice,
    endingWithinHours:  body.endingWithinHours,
    sites:              body.sites ?? ['shopgoodwill', 'govdeals'],
    enabled:            body.enabled ?? true,
    scheduleInterval:   body.scheduleInterval,
  };

  const saved = saveSearchConfig(config);

  if (saved.enabled && saved.scheduleInterval && saved.id) {
    scheduleJob(saved.id, saved.name, saved.scheduleInterval);
  }

  res.status(201).json(saved);
});

router.put('/:id', (req, res) => {
  const id     = Number(req.params.id);
  const existing = getSearchConfig(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const body   = req.body as Partial<SearchConfig>;
  const config = { ...existing, ...body, id };
  const saved  = saveSearchConfig(config);

  // Re-sync the scheduler
  unscheduleJob(id);
  if (saved.enabled && saved.scheduleInterval) {
    scheduleJob(id, saved.name, saved.scheduleInterval);
  }

  res.json(saved);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  unscheduleJob(id);
  deleteSearchConfig(id);
  res.status(204).send();
});

export default router;
