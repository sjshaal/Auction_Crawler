# Auction Crawler

A web crawler for finding deals across auction sites — HiBid, ShopGoodwill,
GovDeals, Public Surplus, Salvation Army Auctions, and K-BID — with saved
search configs, scheduled crawls, and a web UI for browsing and filtering
results.

## Requirements

- Node.js 18+
- npm

## Setup

Install dependencies:

```bash
npm install
```

Playwright is used for crawling; install its browser binaries:

```bash
npx playwright install chromium
```

## Running

Start the app in development mode (uses `tsx`, no build step needed):

```bash
npm run dev
```

The server listens on `http://localhost:3000` by default. Set `PORT` to
use a different port:

```bash
PORT=4000 npm run dev
```

On first run, a SQLite database is created automatically under `data/`.

### Production build

```bash
npm run build
npm start
```

## What it does

- **Crawlers** (`src/crawlers/`) scrape listings from each supported
  auction site.
- **Scheduler** (`src/scheduler/`) runs saved searches on a cron schedule
  and stores new listings.
- **Server** (`src/server/`) serves the web UI and API for browsing,
  filtering, and managing saved searches.

Data (the SQLite database) is gitignored and stored locally in `data/`.
