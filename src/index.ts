import app from './server/app.js';
import { getDb, backfillSites } from './db/Database.js';
import { startScheduler } from './scheduler/Scheduler.js';

const PORT = Number(process.env.PORT ?? 3000);

// Initialize DB (creates tables on first run)
getDb();

// Auto-add any newly registered sites to all existing search configs
backfillSites();

// Start scheduled crawls
startScheduler();

app.listen(PORT, () => {
  console.log(`\nAuction Crawler running at http://localhost:${PORT}\n`);
});
