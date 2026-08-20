import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { embed, EMBEDDING_DIMS } from './Embedder.js';
import type { AuctionListing } from '../types/index.js';

// In CommonJS output __filename is available; use it to create a require that
// resolves paths relative to this file (needed to load the .node binary).
const _require = createRequire(__filename);

// Pre-built darwin-x64 binary from the sibling ruvector project
const BINARY = path.join(
  __dirname,           // …/auction/src/vector
  '../../../ruvector/npm/core/platforms/darwin-x64/ruvector.node'
);

const STORAGE_DIR  = path.join(__dirname, '../../../data/vectors');
const STORAGE_FILE = path.join(STORAGE_DIR, 'auction-vectors.db');

// Separator that can't appear in site names or IDs
const SEP = '::';

interface VectorDbInstance {
  insert(entry: { id?: string; vector: Float32Array }): Promise<string>;
  search(query: { vector: Float32Array; k: number }): Promise<Array<{ id: string; score: number }>>;
  delete(id: string): Promise<boolean>;
  len(): Promise<number>;
}

let _db: VectorDbInstance | null = null;
let _unavailable = false;

function getDb(): VectorDbInstance | null {
  if (_db) return _db;
  if (_unavailable) return null;

  if (!fs.existsSync(BINARY)) {
    console.warn(`[vector] Ruvector binary not found at ${BINARY} — semantic search disabled`);
    _unavailable = true;
    return null;
  }

  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }

    const { VectorDb } = _require(BINARY) as { VectorDb: new (opts: object) => VectorDbInstance };
    _db = new VectorDb({
      dimensions:     EMBEDDING_DIMS,
      distanceMetric: 'Cosine',
      storagePath:    STORAGE_FILE,
    });

    console.log('[vector] Ruvector initialised.');
    return _db;
  } catch (err) {
    console.warn('[vector] Failed to load Ruvector:', (err as Error).message);
    _unavailable = true;
    return null;
  }
}

export function isAvailable(): boolean {
  return !_unavailable && (getDb() !== null);
}

// Index a listing: store its title+category embedding keyed by "site::id"
export async function indexListing(listing: AuctionListing): Promise<void> {
  const db = getDb();
  if (!db) return;

  const text   = [listing.title, listing.category].filter(Boolean).join(' — ');
  const vector = await embed(text);
  const id     = `${listing.site}${SEP}${listing.id}`;

  try {
    // Delete stale entry first (Ruvector has no upsert)
    await db.delete(id).catch(() => {});
    await db.insert({ id, vector });
  } catch (err) {
    console.warn(`[vector] Index failed for ${id}:`, (err as Error).message);
  }
}

export async function indexBatch(listings: AuctionListing[]): Promise<void> {
  // Index sequentially to avoid overwhelming the embedder
  for (const listing of listings) {
    await indexListing(listing);
  }
}

export interface VectorMatch {
  site: string;
  listingId: string;
  score: number;
}

export async function semanticSearch(queryText: string, k = 10): Promise<VectorMatch[]> {
  const db = getDb();
  if (!db) throw new Error('Ruvector is not available on this platform');

  const vector  = await embed(queryText);
  const results = await db.search({ vector, k });

  return results
    .map(r => {
      const [site, ...rest] = r.id.split(SEP);
      return { site, listingId: rest.join(SEP), score: r.score };
    })
    .filter(r => r.site && r.listingId);
}

export async function getIndexedCount(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  return db.len();
}
