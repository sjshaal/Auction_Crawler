import { DatabaseSync, type StatementSync, type SQLInputValue } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import type { AuctionListing, SearchConfig, ListingFilter, Site } from '../types/index.js';

// Master list of every known site. Adding a site here ensures all existing
// search configs automatically include it on the next server startup.
const ALL_SITES: Site[] = [
  'shopgoodwill',
  'govdeals',
  'shopthesalvationarmy',
  'hibid',
  'kbid',
  'publicsurplus',
];

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'auction.db');

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');
  applySchema(_db);
  return _db;
}

function applySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_configs (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT    NOT NULL,
      keywords            TEXT    NOT NULL DEFAULT '[]',
      categories          TEXT    NOT NULL DEFAULT '[]',
      min_price           REAL,
      max_price           REAL,
      ending_within_hours INTEGER,
      sites               TEXT    NOT NULL DEFAULT '["shopgoodwill","govdeals"]',
      enabled             INTEGER NOT NULL DEFAULT 1,
      schedule_interval   TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      last_run_at         TEXT
    );

    CREATE TABLE IF NOT EXISTS listings (
      id               TEXT NOT NULL,
      site             TEXT NOT NULL,
      title            TEXT NOT NULL,
      description      TEXT,
      current_price    REAL NOT NULL,
      buy_now_price    REAL,
      image_url        TEXT,
      url              TEXT NOT NULL,
      end_time         TEXT NOT NULL,
      category         TEXT,
      seller           TEXT,
      bid_count        INTEGER DEFAULT 0,
      location         TEXT,
      condition_text   TEXT,
      scraped_at       TEXT NOT NULL DEFAULT (datetime('now')),
      search_config_id INTEGER REFERENCES search_configs(id),
      PRIMARY KEY (id, site)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id   TEXT NOT NULL,
      site TEXT NOT NULL,
      PRIMARY KEY (id, site)
    );

    CREATE INDEX IF NOT EXISTS idx_listings_end_time   ON listings(end_time);
    CREATE INDEX IF NOT EXISTS idx_listings_site       ON listings(site);
    CREATE INDEX IF NOT EXISTS idx_listings_scraped_at ON listings(scraped_at);
    CREATE INDEX IF NOT EXISTS idx_listings_price      ON listings(current_price);
  `);
}

// ── Listings ──────────────────────────────────────────────────────────────────

export function saveListings(listings: AuctionListing[]): void {
  const db   = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO listings (
      id, site, title, description, current_price, buy_now_price,
      image_url, url, end_time, category, seller, bid_count,
      location, condition_text, scraped_at, search_config_id
    ) VALUES (
      :id, :site, :title, :description, :currentPrice, :buyNowPrice,
      :imageUrl, :url, :endTime, :category, :seller, :bidCount,
      :location, :condition, :scrapedAt, :searchConfigId
    )
  `);

  db.exec('BEGIN');
  try {
    for (const item of listings) {
      stmt.run({
        id:            item.id,
        site:          item.site,
        title:         item.title,
        description:   item.description ?? null,
        currentPrice:  item.currentPrice,
        buyNowPrice:   item.buyNowPrice ?? null,
        imageUrl:      item.imageUrl ?? null,
        url:           item.url,
        endTime:       item.endTime,
        category:      item.category ?? null,
        seller:        item.seller ?? null,
        bidCount:      item.bidCount ?? 0,
        location:      item.location ?? null,
        condition:     item.condition ?? null,
        scrapedAt:     item.scrapedAt,
        searchConfigId: item.searchConfigId ?? null,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const SORT_MAP: Record<string, string> = {
  price_asc:       'l.current_price ASC',
  price_desc:      'l.current_price DESC',
  end_time_asc:    'l.end_time ASC',
  end_time_desc:   'l.end_time DESC',
  scraped_at_desc: 'l.scraped_at DESC',
  favorites_first: '(f.id IS NOT NULL) DESC, l.end_time ASC',
};

export function getListings(
  filter: ListingFilter = {}
): { listings: AuctionListing[]; total: number } {
  const db = getDb();

  const conditions: string[] = [];
  const params: Record<string, SQLInputValue> = {};

  // Always exclude expired listings — compare as ISO strings to avoid SQLite's
  // datetime() space-separator vs stored T-separator mismatch
  params.now = new Date().toISOString();
  conditions.push('l.end_time >= :now');

  if (filter.sites?.length) {
    filter.sites.forEach((s, i) => { params[`site${i}`] = s; });
    const placeholders = filter.sites.map((_, i) => `:site${i}`).join(', ');
    conditions.push(`l.site IN (${placeholders})`);
  }

  if (filter.keyword) {
    conditions.push(`(l.title LIKE :kw OR l.description LIKE :kw)`);
    params.kw = `%${filter.keyword}%`;
  }

  if (filter.minPrice !== undefined) {
    conditions.push('l.current_price >= :minPrice');
    params.minPrice = filter.minPrice;
  }

  if (filter.maxPrice !== undefined) {
    conditions.push('l.current_price <= :maxPrice');
    params.maxPrice = filter.maxPrice;
  }

  if (filter.endingWithinHours !== undefined) {
    const cutoff = new Date(Date.now() + filter.endingWithinHours * 3_600_000).toISOString();
    params.endingCutoff = cutoff;
    conditions.push('l.end_time <= :endingCutoff');
  }

  if (filter.category) {
    conditions.push('l.category LIKE :category');
    params.category = `%${filter.category}%`;
  }

  if (filter.favoritesOnly) {
    conditions.push('f.id IS NOT NULL');
  }

  const where   = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = SORT_MAP[filter.sortBy ?? 'end_time_asc'] ?? SORT_MAP.end_time_asc;
  const limit   = filter.limit ?? 60;
  const offset  = filter.offset ?? 0;

  const join = 'LEFT JOIN favorites f ON f.id = l.id AND f.site = l.site';

  const countRow = db
    .prepare(`SELECT COUNT(*) AS count FROM listings l ${join} ${where}`)
    .get(params) as { count: number };

  const rows = db
    .prepare(`SELECT l.*, (f.id IS NOT NULL) AS is_favorite FROM listings l ${join} ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`)
    .all(params) as Record<string, unknown>[];

  return { listings: rows.map(rowToListing), total: countRow.count };
}

export function deleteListing(id: string, site: string): void {
  const db = getDb();
  db.prepare('DELETE FROM listings WHERE id = :id AND site = :site').run({ id, site });
  db.prepare('DELETE FROM favorites WHERE id = :id AND site = :site').run({ id, site });
}

export function toggleFavorite(id: string, site: string): { isFavorite: boolean } {
  const db      = getDb();
  const exists  = db.prepare('SELECT 1 FROM favorites WHERE id = :id AND site = :site').get({ id, site });
  if (exists) {
    db.prepare('DELETE FROM favorites WHERE id = :id AND site = :site').run({ id, site });
    return { isFavorite: false };
  } else {
    db.prepare('INSERT INTO favorites (id, site) VALUES (:id, :site)').run({ id, site });
    return { isFavorite: true };
  }
}

// ── Search configs ─────────────────────────────────────────────────────────────

export function saveSearchConfig(config: SearchConfig): SearchConfig {
  const db = getDb();

  const values = {
    name:              config.name,
    keywords:          JSON.stringify(config.keywords),
    categories:        JSON.stringify(config.categories),
    minPrice:          config.minPrice ?? null,
    maxPrice:          config.maxPrice ?? null,
    endingWithinHours: config.endingWithinHours ?? null,
    sites:             JSON.stringify(config.sites),
    enabled:           config.enabled ? 1 : 0,
    scheduleInterval:  config.scheduleInterval ?? null,
  };

  if (config.id) {
    db.prepare(`
      UPDATE search_configs SET
        name = :name, keywords = :keywords, categories = :categories,
        min_price = :minPrice, max_price = :maxPrice,
        ending_within_hours = :endingWithinHours, sites = :sites,
        enabled = :enabled, schedule_interval = :scheduleInterval
      WHERE id = :id
    `).run({ ...values, id: config.id });
    return config;
  }

  const result = db.prepare(`
    INSERT INTO search_configs
      (name, keywords, categories, min_price, max_price, ending_within_hours,
       sites, enabled, schedule_interval)
    VALUES
      (:name, :keywords, :categories, :minPrice, :maxPrice, :endingWithinHours,
       :sites, :enabled, :scheduleInterval)
  `).run(values);

  return { ...config, id: Number(result.lastInsertRowid) };
}

export function getSearchConfigs(): SearchConfig[] {
  return (getDb()
    .prepare('SELECT * FROM search_configs ORDER BY created_at DESC')
    .all() as Record<string, unknown>[])
    .map(rowToSearchConfig);
}

export function getSearchConfig(id: number): SearchConfig | null {
  const row = getDb()
    .prepare('SELECT * FROM search_configs WHERE id = :id')
    .get({ id }) as Record<string, unknown> | undefined;
  return row ? rowToSearchConfig(row) : null;
}

export function deleteSearchConfig(id: number): void {
  getDb().prepare('DELETE FROM search_configs WHERE id = :id').run({ id });
}

export function markLastRunAt(id: number): void {
  getDb()
    .prepare("UPDATE search_configs SET last_run_at = datetime('now') WHERE id = :id")
    .run({ id });
}

/**
 * Ensure every search config includes all known sites.
 * Called once at server startup — safe to run repeatedly (idempotent).
 * Any site added to ALL_SITES will automatically appear in every existing config.
 */
export function backfillSites(): void {
  const db      = getDb();
  const configs = getSearchConfigs();
  let updated   = 0;

  for (const config of configs) {
    const missing = ALL_SITES.filter(s => !config.sites.includes(s));
    if (missing.length === 0) continue;

    const newSites = [...config.sites, ...missing];
    db.prepare('UPDATE search_configs SET sites = :sites WHERE id = :id')
      .run({ sites: JSON.stringify(newSites), id: config.id });
    updated++;
  }

  if (updated > 0) {
    console.log(`[db] backfillSites: added missing sites to ${updated} search config(s)`);
  }
}

export function cleanupExpiredListings(): number {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(`
      DELETE FROM listings
      WHERE end_time < :now
        AND NOT EXISTS (
          SELECT 1 FROM favorites f
          WHERE f.id = listings.id AND f.site = listings.site
        )
    `)
    .run({ now });
  return result.changes as number;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToListing(row: Record<string, unknown>): AuctionListing {
  return {
    id:             row.id as string,
    site:           row.site as AuctionListing['site'],
    title:          row.title as string,
    description:    row.description as string | undefined,
    currentPrice:   row.current_price as number,
    buyNowPrice:    row.buy_now_price as number | undefined,
    imageUrl:       row.image_url as string | undefined,
    url:            row.url as string,
    endTime:        row.end_time as string,
    category:       row.category as string | undefined,
    seller:         row.seller as string | undefined,
    bidCount:       row.bid_count as number | undefined,
    location:       row.location as string | undefined,
    condition:      row.condition_text as string | undefined,
    scrapedAt:      row.scraped_at as string,
    searchConfigId: row.search_config_id as number | undefined,
    isFavorite:     Boolean(row.is_favorite),
  };
}

function rowToSearchConfig(row: Record<string, unknown>): SearchConfig {
  return {
    id:                row.id as number,
    name:              row.name as string,
    keywords:          JSON.parse(row.keywords as string),
    categories:        JSON.parse(row.categories as string),
    minPrice:          row.min_price as number | undefined,
    maxPrice:          row.max_price as number | undefined,
    endingWithinHours: row.ending_within_hours as number | undefined,
    sites:             JSON.parse(row.sites as string),
    enabled:           Boolean(row.enabled),
    scheduleInterval:  row.schedule_interval as string | undefined,
    createdAt:         row.created_at as string,
    lastRunAt:         row.last_run_at as string | undefined,
  };
}
